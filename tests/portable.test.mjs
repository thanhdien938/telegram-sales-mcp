import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdirSync,mkdtempSync,rmSync,existsSync,writeFileSync,readFileSync,symlinkSync } from 'node:fs';
import { resolve,join,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID,createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createNativeChannel } from '../dist/runtime/native-channel.js';
import { assertNativeRpc, requireQualifiedNativeBuild } from '../dist/runtime/native-policy.js';
import { createTerminalSecrets } from '../dist/runtime/terminal-secrets.js';
import { authenticate, readApiCredentials } from '../dist/runtime/auth-controller.js';
import { acquireSession,validateRoot } from '../dist/runtime/session-store.js';
import { createReadSession } from '../dist/runtime/read-session.js';
import { verifyNativeBundle } from '../dist/runtime/native-integrity.js';
import { reopenPortable, parsePortableOptions } from '../dist/runtime/portable-provider.js';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const qa=join(root,'.qa');mkdirSync(qa,{recursive:true});
function disposable(fn){const dir=mkdtempSync(join(qa,'TEST_ONLY_PORTABLE_'));assert.equal(dirname(dir),qa);return Promise.resolve().then(()=>fn(dir)).finally(()=>rmSync(dir,{recursive:true,force:true}));}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class Wire {
 data=new Set();exit=new Set();written=[];stops=0;reply;
 async write(line){this.written.push(JSON.parse(line));this.reply?.(this.written.at(-1));}
 onData(fn){this.data.add(fn);return()=>this.data.delete(fn);}
 onExit(fn){this.exit.add(fn);return()=>this.exit.delete(fn);}
 async stop(){this.stops++;}
 frame(value,split=0){const b=Buffer.from(JSON.stringify(value)+'\n');if(split){this.raw(b.subarray(0,split));this.raw(b.subarray(split));}else this.raw(b);}
 raw(b){for(const fn of this.data)fn(b);}
 auth(value){this.frame({kind:'update',payload:{'@type':'updateAuthorizationState',authorization_state:{'@type':value}}});}
}
function vault(){const map=new Map();return {async protect(value,context){const id=randomUUID();map.set(id,{value:Buffer.from(value),context});return Buffer.from(id);},async unprotect(value,context){const item=map.get(value.toString());if(!item||item.context!==context)throw new Error('TEST_ONLY_UNSEAL_FAILURE');return Buffer.from(item.value);}};}
function credentials(){return {apiId:1,apiHash:'a'.repeat(32),databaseKey:Buffer.alloc(32,7).toString('base64'),nativeBundle:'b'.repeat(64)};}
const context=(mode='fresh')=>({mode,credentials:credentials(),databaseDirectory:'TEST_ONLY_DATABASE',filesDirectory:'TEST_ONLY_FILES',readIdentity:async()=>'1'});
function setup(states,requests=[]){let i=0;return {async waitState(signal){if(signal?.aborted)throw new Error('TEST_ONLY_CANCEL');if(i>=states.length)throw new Error('TEST_ONLY_NO_STATE');return states[i++];},async request(method){requests.push(method);return {'@type':'ok'};}};}
class Terminal extends EventEmitter {
 isTTY=true;isRaw=false;paused=true;restores=0;throwRestore=false;
 setRawMode(value){this.restores++;if(this.throwRestore&&this.restores>1)throw new Error('TEST_ONLY_RESTORE');this.isRaw=value;return this;}
 isPaused(){return this.paused;}resume(){this.paused=false;return this;}pause(){this.paused=true;return this;}
}
function terminal(timeout=100){const input=new Terminal();let output='';const writer={isTTY:true,write(value){output+=value;return true;}};return {input,reader:createTerminalSecrets(input,writer,timeout),output:()=>output};}

test('native framing correlates split response and update, exposes read facade without setup',async()=>{
 const wire=new Wire(),channel=createNativeChannel(wire,'reopen');await channel.read.start();const events=[];channel.read.subscribe(e=>events.push(e));
 const request=channel.read.send({'@type':'getMe','@extra':'TEST_ONLY_CORRELATION'});const id=wire.written[0].id;
 wire.frame({kind:'response',id,payload:{'@type':'user',id:1}},7);await request;
 wire.auth('authorizationStateReady');assert(events.some(e=>e.kind==='response'&&e.extra==='TEST_ONLY_CORRELATION'));
 assert.equal('request' in channel.read,false);assert.equal('setup' in channel.read,false);await channel.stop();await channel.stop();assert.equal(wire.stops,1);
});
test('native malformed UTF-8, JSON, envelope and oversized frame fail closed with sanitized reason',async()=>{
 for(const bytes of [Buffer.from('[]\n'),Buffer.from('{bad\n'),Buffer.from([255,10]),Buffer.from('x'.repeat(129))]){
  const wire=new Wire(),channel=createNativeChannel(wire,'fresh',{maxBytes:128});await channel.read.start();wire.raw(bytes);await tick();assert.equal(channel.read.getLifecycleState(),'failed');assert.equal(wire.stops,1);
 }
});
test('native timeout and pending bound reject without retry and close wire',async()=>{
 const wire=new Wire(),channel=createNativeChannel(wire,'reopen',{timeoutMs:20,maxPending:1});await channel.read.start();
 const first=assert.rejects(channel.read.send({'@type':'getMe','@extra':'TEST_ONLY_FIRST'}),/TIMEOUT/);
 await assert.rejects(channel.read.send({'@type':'getMe','@extra':'TEST_ONLY_SECOND'}),/PENDING_LIMIT/);await first;assert.equal(wire.written.length,1);assert.equal(wire.stops,1);
});
test('native injected raw read transport and setup scope cannot send Telegram writes',async()=>{
 const wire=new Wire(),channel=createNativeChannel(wire,'fresh');await channel.read.start();
 for(const method of ['sendMessage','deleteMessages','forwardMessages','viewMessages','pinChatMessage','downloadFile','setTdlibParameters','unknown'])await assert.rejects(channel.read.send({'@type':method,'@extra':'TEST_ONLY',scope:'setup'}));
 for(const method of ['sendMessage','setChatTitle','unknown'])await assert.rejects(channel.setup.request(method));
 assert.equal(wire.written.length,0);await channel.stop();
});
test('private auth setup only admits exact current state and cannot re-enable auth after Ready',async()=>{
 const wire=new Wire(),channel=createNativeChannel(wire,'fresh');await channel.read.start();
 await assert.rejects(channel.setup.request('checkAuthenticationCode',{code:'TEST_ONLY'}),/AUTH_PHASE_REJECTED/);
 wire.auth('authorizationStateWaitCode');wire.reply=m=>wire.frame({kind:'response',id:m.id,payload:{'@type':'ok'}});
 await channel.setup.request('checkAuthenticationCode',{code:'TEST_ONLY'});wire.auth('authorizationStateReady');
 await assert.rejects(channel.setup.request('checkAuthenticationCode',{code:'TEST_ONLY'}),/AUTH_PHASE_REJECTED/);await channel.stop();
});
test('reopen auth-required state and post-Ready auth loss close instead of prompting',async()=>{
 for(const mode of ['fresh','reopen']){
  const wire=new Wire(),channel=createNativeChannel(wire,mode);await channel.read.start();if(mode==='fresh')wire.auth('authorizationStateReady');wire.auth('authorizationStateWaitCode');await tick();assert.equal(channel.read.getLifecycleState(),'failed');assert.equal(wire.stops,1);
 }
});
test('fresh mock transitions parameters-phone-code-password-Ready without retry',async()=>{
 const calls=[],kinds=[];const secrets={async read(kind){kinds.push(kind);return kind==='phone'?String.fromCharCode(43)+'1'.repeat(9):kind==='code'?'1'.repeat(5):'TEST_ONLY_PASSWORD';}};
 const states=['authorizationStateWaitTdlibParameters','authorizationStateWaitPhoneNumber','authorizationStateWaitCode','authorizationStateWaitPassword','authorizationStateReady'];
 assert.equal(await authenticate(setup(states,calls),context(),secrets),'1');assert.deepEqual(kinds,['phone','code','password']);assert.deepEqual(calls,['setTdlibParameters','setAuthenticationPhoneNumber','checkAuthenticationCode','checkAuthenticationPassword']);
});
test('fresh repeated state, unsupported auth, cancellation and OTP/2FA failure never retry',async()=>{
 const secrets={async read(){throw new Error('TEST_ONLY_CANCEL');}};
 for(const state of ['authorizationStateWaitCode','authorizationStateWaitPassword','authorizationStateWaitEmailAddress'])await assert.rejects(authenticate(setup([state]),context(),secrets));
 const controller=new AbortController();controller.abort();await assert.rejects(authenticate(setup(['authorizationStateReady']),context(),undefined,controller.signal));
 await assert.rejects(authenticate(setup(['authorizationStateWaitTdlibParameters','authorizationStateWaitTdlibParameters']),context(),secrets),/RETRY_FORBIDDEN/);
});
test('reopen auth controller refuses all interactive states even with injected secret reader',async()=>{
 let prompts=0;for(const state of ['authorizationStateWaitPhoneNumber','authorizationStateWaitCode','authorizationStateWaitPassword'])await assert.rejects(authenticate(setup([state]),context('reopen'),{async read(){prompts++;return 'TEST_ONLY';}}),/REAUTH_REQUIRED/);assert.equal(prompts,0);
 assert.equal(await authenticate(setup(['authorizationStateReady']),context('reopen')),'1');
});
test('API credential reader validates private inputs without accepting argv/MCP fields',async()=>{
 const values=['1','a'.repeat(32)];assert.deepEqual(await readApiCredentials({async read(){return values.shift();}}),{apiId:1,apiHash:'a'.repeat(32)});
 await assert.rejects(readApiCredentials({async read(){return 'TEST_ONLY_INVALID';}}),/API_INPUT_REJECTED/);
});
test('private terminal never echoes, restores raw/paused mode on success, abort and timeout',async()=>{
 const t=terminal();const success=t.reader.read('password');t.input.emit('data',Buffer.from('TEST_ONLY_SECRET\r'));assert.equal(await success,'TEST_ONLY_SECRET');assert(!t.output().includes('TEST_ONLY_SECRET'));assert.equal(t.input.isRaw,false);assert.equal(t.input.paused,true);
 const cancelled=terminal();const c=cancelled.reader.read('code');cancelled.input.emit('data',Buffer.from([3]));await assert.rejects(c);assert.equal(cancelled.input.isRaw,false);
 const aborted=terminal();const abort=new AbortController();const a=aborted.reader.read('password',abort.signal);abort.abort();await assert.rejects(a);assert.equal(aborted.input.isRaw,false);
 const timed=terminal(10);await assert.rejects(timed.reader.read('password'));assert.equal(timed.input.isRaw,false);
});
test('private terminal non-TTY and restoration errors fail closed',async()=>{
 const t=terminal();t.input.isTTY=false;await assert.rejects(t.reader.read('code'),/TTY_REQUIRED/);
 const broken=terminal();broken.input.throwRestore=true;const pending=broken.reader.read('password');broken.input.emit('data',Buffer.from('TEST_ONLY_SECRET\r'));await assert.rejects(pending,/RESTORATION_FAILED/);assert(!broken.output().includes('TEST_ONLY_SECRET'));
});
test('session fresh commit/reopen mock vault binds account, root and native manifest',()=>disposable(async dir=>{
 const state=join(dir,'state'),v=vault(),c=credentials();const fresh=acquireSession(state,'fresh',v,[]);await fresh.commit(c,'1');fresh.release();
 const opened=acquireSession(state,'reopen',v,[]);try{const saved=await opened.load(c.nativeBundle);assert.doesNotThrow(()=>saved.verifyIdentity('1'));assert.throws(()=>saved.verifyIdentity('2'));await assert.rejects(opened.load('c'.repeat(64)));}finally{opened.release();}
 assert(!readFileSync(join(state,'session.json'),'utf8').includes(c.apiHash));assert(!readFileSync(join(state,'vault.bin'),'utf8').includes(c.apiHash));
}));
test('duplicate session ownership fails until exact owned lock released',()=>disposable(async dir=>{
 const state=join(dir,'state'),v=vault(),s=acquireSession(state,'fresh',v,[]);
 assert.throws(()=>acquireSession(state,'reopen',v,[]));s.release();assert(!existsSync(join(state,'writer.lock')));s.release();
}));
test('DPAPI mock protect/unseal failures leave no usable session and never fall back plaintext',()=>disposable(async dir=>{
 const state=join(dir,'bad'),bad={async protect(){throw new Error('TEST_ONLY_DPAPI');},async unprotect(){throw new Error('TEST_ONLY_DPAPI');}};
 const s=acquireSession(state,'fresh',bad,[]);try{await assert.rejects(s.commit(credentials(),'1'));assert(!existsSync(join(state,'vault.bin')));assert(!existsSync(join(state,'session.json')));}finally{s.release();}
 const other=join(dir,'other'),v=vault(),fresh=acquireSession(other,'fresh',v,[]);await fresh.commit(credentials(),'1');fresh.release();
 const reopened=acquireSession(other,'reopen',bad,[]);try{await assert.rejects(reopened.load(credentials().nativeBundle));}finally{reopened.release();}
}));
test('corrupted manifest, transplanted state and vault bytes fail closed',()=>disposable(async dir=>{
 const state=join(dir,'state'),v=vault(),fresh=acquireSession(state,'fresh',v,[]);await fresh.commit(credentials(),'1');fresh.release();
 const clone=join(dir,'transplant');mkdirSync(clone);mkdirSync(join(clone,'tdlib-db'));mkdirSync(join(clone,'tdlib-files'));writeFileSync(join(clone,'session.json'),readFileSync(join(state,'session.json')));writeFileSync(join(clone,'vault.bin'),readFileSync(join(state,'vault.bin')));const copied=acquireSession(clone,'reopen',v,[]);try{await assert.rejects(copied.load(credentials().nativeBundle));}finally{copied.release();}
 const manifest=readFileSync(join(state,'session.json'));writeFileSync(join(state,'session.json'),'{}');let s=acquireSession(state,'reopen',v,[]);try{await assert.rejects(s.load(credentials().nativeBundle));}finally{s.release();}
 writeFileSync(join(state,'session.json'),manifest);writeFileSync(join(state,'vault.bin'),'TEST_ONLY_CORRUPTED');s=acquireSession(state,'reopen',v,[]);try{await assert.rejects(s.load(credentials().nativeBundle));}finally{s.release();}
}));
test('dedicated root traversal, repository overlap, parent overlap and junction are denied',()=>disposable(dir=>{
 const repo=join(dir,'repo');mkdirSync(repo);assert.throws(()=>validateRoot(join(repo,'..evil'),[repo],false));assert.throws(()=>validateRoot(repo,[repo],true));assert.throws(()=>validateRoot(dir,[repo],true));assert.throws(()=>validateRoot(dir+'/x/../new',[],false));
 const target=join(dir,'target');mkdirSync(target);const alias=join(dir,'alias');symlinkSync(target,alias,'junction');assert.throws(()=>validateRoot(join(alias,'new'),[],false));assert.throws(()=>validateRoot(alias,[],true));
}));
test('native source build HOLD prevents CLI provider from touching arbitrary state',()=>disposable(async dir=>{
 const absent=join(dir,'absent');assert.throws(()=>requireQualifiedNativeBuild(),/NATIVE_BUILD_HOLD/);
 await assert.rejects(reopenPortable({state:absent,nativeManifest:'TEST_ONLY_UNREAD',python:'TEST_ONLY_UNREAD'}),/NATIVE_BUILD_HOLD/);assert(!existsSync(absent));
 assert.throws(()=>parsePortableOptions(['--api-hash','TEST_ONLY']));
 const result=spawnSync(process.execPath,['dist/login.js','--help'],{cwd:root,encoding:'utf8'});assert.equal(result.status,0);
 const nonTTY=spawnSync(process.execPath,['dist/login.js'],{cwd:root,encoding:'utf8'});assert.equal(nonTTY.status,1);assert.match(nonTTY.stderr,/PRIVATE_LOGIN_UNAVAILABLE/);
}));
test('mock native channel/auth/read lifecycle integrates without exposing setup to MCP read transport',async()=>{
 const wire=new Wire(),channel=createNativeChannel(wire,'fresh'),session=createReadSession(channel.read);
 wire.reply=m=>{const method=m.payload['@type'];wire.frame({kind:'response',id:m.id,payload:method==='getMe'?{'@type':'user',id:1,type:{'@type':'userTypeRegular'}}:{'@type':'ok'}});if(method==='setTdlibParameters')wire.auth('authorizationStateReady');};
 await session.start();wire.auth('authorizationStateWaitTdlibParameters');
 try{assert.equal(await authenticate(channel.setup,context(),undefined),'1');await assert.rejects(channel.read.send({'@type':'checkAuthenticationCode','@extra':'TEST_ONLY'}));assert.equal(wire.written.some(x=>x.payload['@type']==='sendMessage'),false);}finally{await session.stop();await channel.stop();assert.equal(wire.stops,1);}
});


test('native read errors preserve safe provider code but never expose provider text, duplicate correlation fails',async()=>{
 const wire=new Wire(),channel=createNativeChannel(wire,'reopen');await channel.read.start();let response;
 channel.read.subscribe(e=>{if(e.kind==='response')response=e.payload;});
 const pending=channel.read.send({'@type':'loadChats','@extra':'TEST_ONLY_CODE'});const id=wire.written.at(-1).id;
 wire.frame({kind:'response',id,payload:{'@type':'error',code:404,message:'TEST_ONLY_PROVIDER_TEXT'}});await pending;
 assert.equal(response.code,404);assert(!JSON.stringify(response).includes('TEST_ONLY_PROVIDER_TEXT'));
 wire.frame({kind:'response',id,payload:{'@type':'ok'}});await tick();assert.equal(channel.read.getLifecycleState(),'failed');
});


test('cancellation racing a secret return prevents auth submission',async()=>{
 const abort=new AbortController();let submitted=0;
 const port={async waitState(){return 'authorizationStateWaitCode';},async request(){submitted++;return {'@type':'ok'};}};
 const secrets={async read(){abort.abort();return '1'.repeat(5);}};
 await assert.rejects(authenticate(port,context(),secrets,abort.signal),/AUTH_CANCELLED/);assert.equal(submitted,0);
});
test('unconfirmed native shutdown is failed, never reported as cleanly closed',async()=>{
 const wire=new Wire();wire.stop=async()=>{throw new Error('TEST_ONLY_STOP_FAILURE');};const channel=createNativeChannel(wire,'reopen');await channel.read.start();await assert.rejects(channel.stop(),/STOP_UNCONFIRMED/);assert.equal(channel.read.getLifecycleState(),'failed');
});
test('fake bundle integrity validates manifest only, detects tamper and unlisted DLL without loading',()=>disposable(dir=>{
 const native=join(dir,'native');mkdirSync(native);const dll=join(native,'tdjson.dll'),wrapper=join(dir,'TEST_ONLY_wrapper.py'),python=join(dir,'TEST_ONLY_python.exe');
 writeFileSync(dll,'TEST_ONLY_NOT_A_DLL');writeFileSync(wrapper,'# TEST_ONLY');writeFileSync(python,'TEST_ONLY_NOT_EXECUTED');
 const digest=createHash('sha256').update(readFileSync(dll)).digest('hex');const manifest=join(native,'manifest.json');
 writeFileSync(manifest,JSON.stringify({schema:1,platform:'win32-x64',protocol:1,upstream:'https://github.com/tdlib/td',upstreamCommit:'a'.repeat(40),api:'td-json-1.x',noticeReview:'OWNER_REVIEW_REQUIRED',artifacts:{'tdjson.dll':digest}}));
 assert.equal(verifyNativeBundle(manifest,wrapper,python,[]).dll,dll);writeFileSync(dll,'TEST_ONLY_TAMPERED');assert.throws(()=>verifyNativeBundle(manifest,wrapper,python,[]));
 writeFileSync(dll,'TEST_ONLY_NOT_A_DLL');writeFileSync(join(native,'other.dll'),'TEST_ONLY');assert.throws(()=>verifyNativeBundle(manifest,wrapper,python,[]));
}));


test('private terminal preserves split UTF8 password without echo',async()=>{
 const t=terminal();const expected='TEST_ONLY_'+String.fromCharCode(233);const bytes=Buffer.from(expected);const result=t.reader.read('password');
 t.input.emit('data',bytes.subarray(0,bytes.length-1));t.input.emit('data',bytes.subarray(bytes.length-1));t.input.emit('data',Buffer.from([13]));assert.equal(await result,expected);assert(!t.output().includes(expected));
});


test('reopen rejects linked TDLib subdirectories before native startup',()=>disposable(async dir=>{
 const state=join(dir,'state'),v=vault(),fresh=acquireSession(state,'fresh',v,[]);await fresh.commit(credentials(),'1');fresh.release();
 rmSync(join(state,'tdlib-db'),{recursive:true});const target=join(dir,'target');mkdirSync(target);symlinkSync(target,join(state,'tdlib-db'),'junction');assert.throws(()=>acquireSession(state,'reopen',v,[]));
}));
