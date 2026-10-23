import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, existsSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createPublicServer } from '../dist/mcp/public-server.js';
import { createReadSession } from '../dist/runtime/read-session.js';
import { initializeCrm, openConsentedCrm, CRM_ACKNOWLEDGMENT } from '../dist/runtime/crm-consent.js';
import { assertReadRpc } from '../dist/policy/read-only.js';
import { MessagingWriteService, MemoryWriteLedger, MemoryWriteAuditSink } from '../dist/domain/messaging-write/index.js';
import { registerSingleUserWriteTool } from '../dist/mcp/single-user-write.js';
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const qa = join(root, '.qa'); mkdirSync(qa, { recursive: true });
function disposable(fn) {
  const dir = mkdtempSync(join(qa, 'TEST_ONLY_'));
  assert.equal(dirname(dir), qa);
  return Promise.resolve().then(() => fn(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}
async function memory(options, fn) {
  const server = createPublicServer(options); const client = new Client({ name: 'TEST_ONLY', version: '1' });
  const [c,s] = InMemoryTransport.createLinkedPair();
  try { await server.connect(s); await client.connect(c); return await fn(client); }
  finally { await client.close(); await server.close(); }
}
const writes = ['sendMessage','sendMessageAlbum','editMessageText','editMessageCaption','deleteMessages',
 'forwardMessages','addMessageReaction','removeMessageReaction','pinChatMessage','unpinChatMessage',
 'viewMessages','setChatTitle','setChatDescription','addChatMember','banChatMember','leaveChat',
 'setMessageSchedulingState','downloadFile','setTdlibParameters','checkAuthenticationCode','unknownMethod'];
class FakeTransport {
  state = 'stopped'; listeners = new Set(); sent = [];
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(e) { for (const fn of this.listeners) fn(e); }
  async start() { this.state='running'; this.emit({kind:'update', payload:{'@type':'updateAuthorizationState', authorization_state:{'@type':'authorizationStateReady'}}}); }
  async stop() { this.state='closed'; }
  getLifecycleState() { return this.state; }
  async send(payload) {
    this.sent.push(payload['@type']); let body;
    switch(payload['@type']) {
      case 'getAuthorizationState': body={'@type':'authorizationStateReady'}; break;
      case 'getMe': body={'@type':'user', id:1, type:{'@type':'userTypeRegular'}}; break;
      case 'loadChats': body={'@type':'error',code:404,message:'TEST_ONLY not found'}; break;
      case 'getChats': body={'@type':'chats', total_count:0, chat_ids:[]}; break;
      case 'getChatHistory': body={'@type':'messages', total_count:0, messages:[]}; break;
      default: throw new Error('TEST_ONLY_UNEXPECTED_RPC');
    }
    queueMicrotask(() => this.emit({kind:'response',extra:payload['@extra'],payload:body}));
  }
}
test('lower RPC boundary rejects every write, unknown, login and download with no opt-in', () => {
  for (const method of writes) assert.throws(() => assertReadRpc(method), {code:'PUBLIC_TELEGRAM_WRITES_DISABLED'});
  assert.doesNotThrow(() => assertReadRpc('getChatHistory'));
});
test('adapter direct/private request and mutation bypass reaches no provider write', async () => {
  const fake=new FakeTransport(); const session=createReadSession(fake); await session.start();
  try {
    for (const method of writes) await assert.rejects(session.adapter.sendInternalRequest(method), {code:'PUBLIC_TELEGRAM_WRITES_DISABLED'});
    await assert.rejects(session.adapter.dispatchMutation('sendMessage',{}), {code:'PUBLIC_TELEGRAM_WRITES_DISABLED'});
    assert.equal(fake.sent.length,0);
    assert.deepEqual(await session.adapter.getChats({limit:2}), {total_count:0,chat_ids:[]});
    assert(fake.sent.includes('getChats')); assert(!fake.sent.some(x=>writes.includes(x)));
  } finally { await session.stop(); }
});
test('all retained message-write classes are hard disabled even with arbitrary adapter', async () => {
  let dispatches=0; const provider=new Proxy({}, {get:()=>()=>{ dispatches++; throw new Error('TEST_ONLY'); }});
  const service=new MessagingWriteService(provider,new MemoryWriteLedger(),new MemoryWriteAuditSink());
  for (const method of ['sendText','replyText','editText','deleteMessage','forwardMessage','addEmojiReaction','removeEmojiReaction','pinMessage','unpinMessage','markMessageRead','sendMedia','scheduleText','scheduleMedia']) {
    assert.equal(typeof service[method], 'function');
    await assert.rejects(service[method]({requestKey:'TEST_ONLY_REQUEST',chatId:'1'}), {code:'PUBLIC_TELEGRAM_WRITES_DISABLED'});
  }
  assert.equal(dispatches,0);
  assert.throws(() => registerSingleUserWriteTool({}, service, {enabled:true,boundChatId:'1',boundChatNumberId:1}), {code:'PUBLIC_TELEGRAM_WRITES_DISABLED'});
});
test('default MCP lists eleven read tools, reports unconfigured, and cannot send', async () => {
  await memory({}, async client => {
    const tools=(await client.listTools()).tools; assert.equal(tools.length,11);
    assert(!tools.some(x=>/send|reply|delete|schedule|pin|mark_read/.test(x.name)));
    const health=await client.callTool({name:'telegram_health',arguments:{}});
    assert.equal(health.structuredContent.telegram_provider_status,'NOT_CONFIGURED');assert.equal(health.structuredContent.native_build_status,'HOLD');
    const caps=await client.callTool({name:'telegram_capabilities',arguments:{}});
    assert.equal(caps.structuredContent.telegram_writes,false); assert.equal(caps.structuredContent.sales_local,false);
    const unavailable=await client.callTool({name:'telegram_chats_list',arguments:{limit:2}}); assert.equal(unavailable.isError,true);
    const denied=await client.callTool({name:'telegram_message_send',arguments:{text:'TEST_ONLY'}}); assert.equal(denied.isError,true);
  });
});
test('programmatic fake read services retain bounded MCP reads while consent flags cannot enable writes', async () => {
  const fake=new FakeTransport(); const session=createReadSession(fake); await session.start();
  try {
    await memory({services:{...session,singleUserWritesEnabled:true}}, async client => {
      const caps=await client.callTool({name:'telegram_capabilities',arguments:{}});
      assert.equal(caps.structuredContent.telegram_writes,false); assert.equal(caps.structuredContent.streamable_http,false);
      const chats=await client.callTool({name:'telegram_chats_list',arguments:{limit:2}}); assert.notEqual(chats.isError,true, JSON.stringify(chats));
    });
  } finally { await session.stop(); }
});
test('CRM missing acknowledgment never creates or opens a database', () => disposable(dir => {
  const absent=join(dir,'new'); assert.throws(()=>initializeCrm(absent,'MODEL_CONFIRM_TRUE')); assert(!existsSync(absent));
  const existing=join(dir,'existing'); mkdirSync(existing);
  assert.throws(()=>openConsentedCrm(existing)); assert(!existsSync(join(existing,'sales.sqlite')));
  assert.throws(()=>initializeCrm(existing,CRM_ACKNOWLEDGMENT));
}));
test('acknowledged disposable CRM exposes eight local tools, stores synthetic data, preview never sends', () => disposable(async dir => {
  const dbdir=join(dir,'crm'); initializeCrm(dbdir,CRM_ACKNOWLEDGMENT); const store=openConsentedCrm(dbdir);
  try {
    await memory({salesStore:store}, async client => {
      const tools=(await client.listTools()).tools; assert.equal(tools.length,19); assert.equal(tools.filter(x=>x.name.startsWith('telegram_sales_')).length,8);
      const caps=await client.callTool({name:'telegram_capabilities',arguments:{}}); assert.equal(caps.structuredContent.sales_local,true); assert.equal(caps.structuredContent.telegram_writes,false);
      const upsert=await client.callTool({name:'telegram_sales_lead_upsert',arguments:{user_id:'1',display_name:'TEST_ONLY_SYNTHETIC',notes:'TEST_ONLY_NOT_A_CUSTOMER'}}); assert.notEqual(upsert.isError,true);
      assert.equal(store.getLead('1').displayName,'TEST_ONLY_SYNTHETIC');
      await client.callTool({name:'telegram_sales_quick_reply_upsert',arguments:{code:'test_only',title:'TEST_ONLY',text:'TEST_ONLY {{customer}}'}});
      const preview=await client.callTool({name:'telegram_sales_quick_reply_preview',arguments:{template_code:'test_only',variables:{customer:'TEST_ONLY'}}});
      assert.notEqual(preview.isError,true); assert.equal(preview.structuredContent.final_text,'TEST_ONLY TEST_ONLY');
      const send=await client.callTool({name:'telegram_sales_quick_reply_send',arguments:{template_code:'test_only',request_key:'TEST_ONLY'}}); assert.equal(send.isError,true);
    });
  } finally { store.close(); }
  const reopened=openConsentedCrm(dbdir); try { assert.equal(reopened.getLead('1').displayName,'TEST_ONLY_SYNTHETIC'); } finally { reopened.close(); }
}));
test('CRM parent junction cannot redirect initialization or opening', () => disposable(dir => {
  const target=join(dir,'target'); mkdirSync(target); const alias=join(dir,'alias'); symlinkSync(target,alias,'junction');
  assert.throws(()=>initializeCrm(join(alias,'new'),CRM_ACKNOWLEDGMENT)); assert(!existsSync(join(target,'new')));
  assert.throws(()=>openConsentedCrm(alias)); assert(existsSync(target));
}));
test('CRM consent tampering and database link fail closed before constructor', () => disposable(dir => {
  const dbdir=join(dir,'crm'); initializeCrm(dbdir,CRM_ACKNOWLEDGMENT);
  writeFileSync(join(dbdir,'consent.json'),'{}'); assert.throws(()=>openConsentedCrm(dbdir));
  const sentinel=join(dir,'sentinel');writeFileSync(sentinel,'TEST_ONLY');
  rmSync(join(dbdir,'sales.sqlite'));symlinkSync(sentinel,join(dbdir,'sales.sqlite'),'file');
  assert.throws(()=>openConsentedCrm(dbdir));assert.equal(readFileSync(sentinel,'utf8'),'TEST_ONLY');
}));
test('stdio subprocess provides local protocol only; write env does not add tools', async () => {
  const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TELEGRAM_SINGLE_USER_WRITES:'1'};
  const transport=new StdioClientTransport({command:process.execPath,args:['dist/cli.js'],cwd:root,env,stderr:'pipe'});
  const client=new Client({name:'TEST_ONLY_STDIO',version:'1'});
  try { await client.connect(transport); assert.equal((await client.listTools()).tools.length,11); }
  finally { await client.close(); await transport.close(); }
});
test('noninteractive CRM CLI cannot fabricate local acknowledgment and write flags are rejected', () => disposable(dir => {
  const absent=join(dir,'crm');
  const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot};
  const init=spawnSync(process.execPath,['dist/crm-init.js',absent],{cwd:root,env,encoding:'utf8'});
  assert.equal(init.status,1);assert(!existsSync(absent));
  const cli=spawnSync(process.execPath,['dist/cli.js','--enable-writes'],{cwd:root,env,encoding:'utf8'});
  assert.equal(cli.status,1);assert.equal(cli.stdout,'');assert.match(cli.stderr,/PUBLIC_START_REJECTED/);
}));
