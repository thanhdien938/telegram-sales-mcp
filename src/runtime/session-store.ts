import { lstatSync, realpathSync, existsSync, mkdirSync, openSync, closeSync, writeFileSync, readFileSync, unlinkSync, fstatSync } from 'node:fs';
import { resolve, dirname, isAbsolute, relative, parse, join, basename } from 'node:path';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
export interface Vault { protect(value:Buffer,context:string):Promise<Buffer>; unprotect(value:Buffer,context:string):Promise<Buffer>; }
export interface Credentials { apiId:number; apiHash:string; databaseKey:string; nativeBundle:string; }
const APP='UNOFFICIAL_TELEGRAM_READ_SESSION_V1';
function fail():never{throw new Error('SESSION_BOUNDARY_REJECTED');}
function plain(path:string,directory:boolean):void{
  const s=lstatSync(path);if(s.isSymbolicLink()|| (directory?!s.isDirectory():!s.isFile()))fail();
  if(realpathSync(path).toLowerCase()!==resolve(path).toLowerCase())fail();
  if(!directory&&s.nlink!==1)fail();
}
export function validateRoot(raw:string,protectedRoots:readonly string[],existing:boolean):string{
  if(typeof raw!=='string'||!isAbsolute(raw)||raw.includes('\0')||raw.split(/[\\/]/).some(x=>x==='.'||x==='..')||raw.startsWith('\\\\'))fail();
  const root=resolve(raw);if(root===parse(root).root)fail();
  for(const p of protectedRoots){const q=resolve(p), a=relative(q,root),b=relative(root,q);const outside=(x:string)=>x==='..'||x.startsWith('../')||x.startsWith('..\\')||isAbsolute(x);if(!outside(a)||!outside(b))fail();}
  let at=existing?root:dirname(root);for(;;){plain(at,true);const p=dirname(at);if(p===at)break;at=p;}
  if(!existing&&existsSync(root))fail();return existing?realpathSync(root):join(realpathSync(dirname(root)),basename(root));
}
function readBounded(file:string,max:number):Buffer{plain(file,false);if(lstatSync(file).size>max)fail();return readFileSync(file);}
function parseCredentials(raw:unknown):Credentials{
  if(typeof raw!=='object'||raw===null)fail();const x=raw as Record<string,unknown>;
  if(!Number.isSafeInteger(x.apiId)||Number(x.apiId)<=0||Number(x.apiId)>2**31-1||typeof x.apiHash!=='string'||!/^[a-f0-9]{32}$/i.test(x.apiHash)||typeof x.databaseKey!=='string'||Buffer.from(x.databaseKey,'base64').length!==32||Buffer.from(x.databaseKey,'base64').toString('base64')!==x.databaseKey||typeof x.nativeBundle!=='string'||!/^[a-f0-9]{64}$/.test(x.nativeBundle))fail();
  return {apiId:Number(x.apiId),apiHash:x.apiHash,databaseKey:x.databaseKey,nativeBundle:x.nativeBundle};
}
function mac(credentials:Credentials,value:string):string{return createHmac('sha256',Buffer.from(credentials.databaseKey,'base64')).update(value).digest('hex');}
function equal(a:unknown,b:string):boolean{return typeof a==='string'&&/^[a-f0-9]{64}$/.test(a)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));}
export function acquireSession(raw:string,mode:'fresh'|'reopen',vault:Vault,protectedRoots:readonly string[]){
  const root=validateRoot(raw,protectedRoots,mode==='reopen');if(mode==='fresh')mkdirSync(root,{mode:0o700});plain(root,true);
  const lock=join(root,'writer.lock'),nonce=randomUUID();const fd=openSync(lock,'wx',0o600);try{writeFileSync(fd,nonce);}catch{closeSync(fd);throw new Error('SESSION_LOCK_UNAVAILABLE');}const owned=fstatSync(fd);let released=false;
  const databaseDirectory=join(root,'tdlib-db'),filesDirectory=join(root,'tdlib-files');
  try{if(mode==='fresh'){mkdirSync(databaseDirectory,{mode:0o700});mkdirSync(filesDirectory,{mode:0o700});}plain(databaseDirectory,true);plain(filesDirectory,true);}catch{closeSync(fd);throw new Error('SESSION_DIRECTORY_REJECTED');}
  function recheck(){plain(root,true);const current=lstatSync(lock);if(current.isSymbolicLink()||current.ino!==owned.ino||current.dev!==owned.dev)fail();}
  const release=()=>{if(released)return;released=true;try{recheck();if(readBounded(lock,128).toString()!==nonce)fail();unlinkSync(lock);}finally{closeSync(fd);}};
  return Object.freeze({root,
    databaseDirectory,filesDirectory,
    async commit(credentials:Credentials,identity:string){
      recheck();if(mode!=='fresh'||!/^\d{1,20}$/.test(identity)||BigInt(identity)<=0n)fail();const c=parseCredentials(credentials);
      const body=Buffer.from(JSON.stringify({app:APP,root,credentials:c}));let sealed:Buffer;
      try{sealed=await vault.protect(body,APP+root);}finally{body.fill(0);}
      if(sealed.length===0||sealed.length>32768)fail();
      writeFileSync(join(root,'vault.bin'),sealed,{flag:'wx',mode:0o600,flush:true});
      writeFileSync(join(root,'session.json'),JSON.stringify({schema:1,app:APP,rootBinding:mac(c,root),accountBinding:mac(c,identity),nativeBundle:c.nativeBundle}),{flag:'wx',mode:0o600,flush:true});
    },
    async load(expectedNativeBundle:string){
      recheck();if(mode!=='reopen')fail();
      const manifest:unknown=JSON.parse(readBounded(join(root,'session.json'),2048).toString());
      if(typeof manifest!=='object'||manifest===null)fail();const m=manifest as Record<string,unknown>;
      if(m.schema!==1||m.app!==APP||m.nativeBundle!==expectedNativeBundle)fail();
      const sealed=readBounded(join(root,'vault.bin'),32768);let body:Buffer|undefined;
      try{body=await vault.unprotect(sealed,APP+root);if(body.length>16384)fail();const data:unknown=JSON.parse(body.toString());
        if(typeof data!=='object'||data===null)fail();const d=data as Record<string,unknown>;
        if(d.app!==APP||d.root!==root)fail();const c=parseCredentials(d.credentials);
        if(c.nativeBundle!==expectedNativeBundle||!equal(m.rootBinding,mac(c,root)))fail();
        return Object.freeze({credentials:c,verifyIdentity(identity:string){if(!/^\d{1,20}$/.test(identity)||BigInt(identity)<=0n||!equal(m.accountBinding,mac(c,identity)))fail();}});
      }finally{body?.fill(0);}
    },release,
  });
}
