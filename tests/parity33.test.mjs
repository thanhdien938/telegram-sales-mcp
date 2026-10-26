import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createPublicServer } from '../dist/mcp/public-server.js';
import { LocalSalesStore } from '../dist/sales/local-sales-store.js';
import { initializeCrm, CRM_ACKNOWLEDGMENT } from '../dist/runtime/crm-consent.js';
import { SINGLE_USER_WRITE_TOOL_NAMES } from '../dist/mcp/single-user-write.js';
import { SALES_TOOL_NAMES } from '../dist/mcp/single-user-sales.js';
import { P4B_TOOL_NAMES } from '../dist/mcp/tools.js';
import {
  MessagingWriteService,
  MemoryWriteLedger,
  MemoryWriteAuditSink,
} from '../dist/domain/messaging-write/index.js';
import { runDoctor } from '../dist/doctor.js';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const qa = join(root, '.qa');
mkdirSync(qa, { recursive: true });

function disposable(fn) {
  const dir = mkdtempSync(join(qa, 'TEST_PARITY33_'));
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => rmSync(dir, { recursive: true, force: true }));
}

async function createClientServerSession(options) {
  const server = createPublicServer(options);
  const client = new Client({ name: 'TEST_PARITY_CLIENT', version: '1.0' });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  await client.connect(c);
  return {
    client,
    server,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

// Full 33 tools list as specified in v1 acceptance inventory
const EXPECTED_33_TOOLS = Object.freeze([
  // 11 Read tools
  'telegram_health',
  'telegram_capabilities',
  'telegram_account',
  'telegram_chats_list',
  'telegram_chat_get',
  'telegram_inbox',
  'telegram_messages_get',
  'telegram_messages_search',
  'telegram_public_search',
  'telegram_contacts',
  'telegram_file_get',
  // 13 Telegram Action tools
  'telegram_message_send',
  'telegram_message_reply',
  'telegram_message_edit',
  'telegram_message_delete',
  'telegram_message_forward',
  'telegram_message_reaction_add',
  'telegram_message_reaction_remove',
  'telegram_message_pin',
  'telegram_message_unpin',
  'telegram_message_mark_read',
  'telegram_message_media_send',
  'telegram_message_text_schedule',
  'telegram_message_media_schedule',
  // 9 Sales CRM tools
  'telegram_sales_lead_upsert',
  'telegram_sales_lead_get',
  'telegram_sales_leads_list',
  'telegram_sales_group_track',
  'telegram_sales_groups_list',
  'telegram_sales_quick_reply_upsert',
  'telegram_sales_quick_replies_list',
  'telegram_sales_quick_reply_preview',
  'telegram_sales_quick_reply_send',
]);

function createMockAccountService(id = 123456) {
  return {
    getRuntimeHealth: () => ({ runtime_status: 'ready', authenticated: true, reauth_required: false }),
    getReauthState: () => ({ reauth_required: false }),
    getAccountSnapshot: async () => ({ runtime_status: 'ready' }),
    getMe: async () => ({ id, first_name: 'Test Owner', is_bot: false }),
  };
}

function createMockActionAdapter(recorded) {
  return {
    sendText: async (p) => { recorded.push({ method: 'sendText', p }); return { messageId: '100' }; },
    sendControlled: async (p) => { recorded.push({ method: 'sendControlled', p }); return { messageId: '101' }; },
    editText: async (p) => { recorded.push({ method: 'editText', p }); return { messageId: '102' }; },
    deleteMessage: async (p) => { recorded.push({ method: 'deleteMessage', p }); return { messageId: '103' }; },
    forwardMessage: async (p) => { recorded.push({ method: 'forwardMessage', p }); return { messageId: '104' }; },
    addEmojiReaction: async (p) => { recorded.push({ method: 'addEmojiReaction', p }); return { messageId: '105' }; },
    removeEmojiReaction: async (p) => { recorded.push({ method: 'removeEmojiReaction', p }); return { messageId: '106' }; },
    pinMessage: async (p) => { recorded.push({ method: 'pinMessage', p }); return { messageId: '107' }; },
    unpinMessage: async (p) => { recorded.push({ method: 'unpinMessage', p }); return { messageId: '108' }; },
    markMessageRead: async (p) => { recorded.push({ method: 'markMessageRead', p }); return { messageId: '109' }; },
  };
}

test('1. Contract snapshot: exactly 33 unique tools discovered under fully configured profile', () => disposable(async (dir) => {
  assert.equal(EXPECTED_33_TOOLS.length, 33);
  assert.equal(new Set(EXPECTED_33_TOOLS).size, 33);

  // Setup disposable CRM
  const crmDir = join(dir, 'crm');
  initializeCrm(crmDir, CRM_ACKNOWLEDGMENT);
  const salesStore = new LocalSalesStore(join(crmDir, 'sales.sqlite'));

  const recordedDispatches = [];
  const mockAdapter = createMockActionAdapter(recordedDispatches);
  const messagingWriteService = new MessagingWriteService(
    mockAdapter,
    new MemoryWriteLedger(),
    new MemoryWriteAuditSink(),
    { resolve: () => ({ kind: 'document', tdlibFileId: 1 }) },
  );

  const mockAccountService = createMockAccountService(123456);
  const mockServices = {
    accountService: mockAccountService,
    chatsService: {
      listChats: async () => ({ chats: [] }),
      getChat: async () => ({ id: '123' }),
      getInbox: async () => ({ conversations: [], returned_count: 0, unread_in_scan: 0, raw_scanned_count: 0 }),
    },
    messagesService: {
      getHistory: async () => ({ messages: [] }),
      getContext: async () => ({ messages: [], has_earlier: false, has_later: false }),
    },
    searchService: {
      searchMessages: async () => ({ messages: [] }),
      searchPublic: async () => ({ results: [] }),
    },
    contactsService: {
      searchContacts: async () => ({ contacts: [] }),
    },
    fileService: {
      getFile: async () => ({ file_id: '1' }),
    },
  };

  const singleUserWriteConfig = {
    enabled: true,
    boundChatId: '123456',
    boundChatNumberId: 123456,
  };

  const session = await createClientServerSession({
    services: mockServices,
    salesStore,
    singleUserWriteConfig,
    messagingWriteService,
    accountService: mockAccountService,
  });

  try {
    const listResult = await session.client.listTools();
    const discoveredNames = listResult.tools.map((t) => t.name).sort();
    const expectedSorted = [...EXPECTED_33_TOOLS].sort();

    assert.equal(discoveredNames.length, 33, `Expected 33 tools, found ${discoveredNames.length}`);
    assert.deepEqual(discoveredNames, expectedSorted);

    // Group counts
    const readFound = discoveredNames.filter((n) => P4B_TOOL_NAMES.includes(n));
    const actionFound = discoveredNames.filter((n) => SINGLE_USER_WRITE_TOOL_NAMES.includes(n));
    const salesFound = discoveredNames.filter((n) => SALES_TOOL_NAMES.includes(n));

    assert.equal(readFound.length, 11, 'Must have 11 read tools');
    assert.equal(actionFound.length, 13, 'Must have 13 action tools');
    assert.equal(salesFound.length, 9, 'Must have 9 sales CRM tools');
  } finally {
    await session.close();
    salesStore.close();
  }
}));

test('2. Synthetic positive/error execution for all 11 Telegram Read tools', () => disposable(async (dir) => {
  const mockAccountService = createMockAccountService(999);
  const mockServices = {
    accountService: mockAccountService,
    chatsService: {
      listChats: async () => ({ chats: [{ id: '10', title: 'Sales Chat' }], total_count: 1 }),
      getChat: async (args) => ({ id: args.chatId ?? '10', title: 'Sales Chat', type: 'private' }),
      getInbox: async () => ({ conversations: [{ chat_id: '10', title: 'Sales Chat' }], returned_count: 1, unread_in_scan: 0, raw_scanned_count: 1 }),
    },
    messagesService: {
      getHistory: async () => ({ messages: [{ id: '100', text: 'Hello' }], total_count: 1 }),
      getContext: async () => ({ messages: [{ id: '100', text: 'Hello' }], has_earlier: false, has_later: false }),
    },
    searchService: {
      searchMessages: async () => ({ messages: [{ id: '100', text: 'Search result' }], total_count: 1 }),
      searchPublic: async () => ({ results: [{ id: '200', title: 'Public Group' }], total_count: 1 }),
    },
    contactsService: {
      getContacts: async () => ({ contacts: [{ id: '300', first_name: 'Lead User' }] }),
    },
    fileService: {
      getFile: async (req) => ({ file_id: typeof req === 'string' ? req : req.fileId, size: 1024, mime_type: 'image/png' }),
    },
  };

  const session = await createClientServerSession({ services: mockServices });
  try {
    // 1. health
    const health = await session.client.callTool({ name: 'telegram_health', arguments: {} });
    assert.equal(health.isError, undefined);
    assert.equal(health.structuredContent.ok, true);

    // 2. capabilities
    const caps = await session.client.callTool({ name: 'telegram_capabilities', arguments: {} });
    assert.equal(caps.isError, undefined);
    assert.equal(caps.structuredContent.mcp_foundation, true);

    // 3. account
    const acc = await session.client.callTool({ name: 'telegram_account', arguments: {} });
    assert.equal(acc.isError, undefined);
    assert.equal(acc.structuredContent.ok, true);
    assert.equal(acc.structuredContent.runtime_status, 'ready');

    // 4. chats_list
    const chats = await session.client.callTool({ name: 'telegram_chats_list', arguments: { limit: 10 } });
    assert.equal(chats.isError, undefined);
    assert(Array.isArray(chats.structuredContent.chats));

    // 5. chat_get
    const chat = await session.client.callTool({ name: 'telegram_chat_get', arguments: { chat_id: '10' } });
    assert.equal(chat.isError, undefined);

    // 6. inbox
    const inbox = await session.client.callTool({ name: 'telegram_inbox', arguments: { limit: 5 } });
    assert.equal(inbox.isError, undefined);

    // 7. messages_get
    const msgs = await session.client.callTool({ name: 'telegram_messages_get', arguments: { chat_id: '10', limit: 5 } });
    assert.equal(msgs.isError, undefined);

    // 8. messages_search
    const search = await session.client.callTool({ name: 'telegram_messages_search', arguments: { scope: 'account', query: 'test' } });
    assert.equal(search.isError, undefined);

    // 9. public_search (with mode: 'chats' and query: 'public')
    const pubSearch = await session.client.callTool({ name: 'telegram_public_search', arguments: { mode: 'chats', query: 'public' } });
    assert.equal(pubSearch.isError, undefined);

    // 10. contacts
    const contacts = await session.client.callTool({ name: 'telegram_contacts', arguments: { mode: 'search', query: 'lead' } });
    assert.equal(contacts.isError, undefined);

    // 11. file_get
    const file = await session.client.callTool({ name: 'telegram_file_get', arguments: { file_id: '123', mode: 'metadata' } });
    assert.equal(file.isError, undefined);
  } finally {
    await session.close();
  }
}));

test('3. Synthetic execution for all 13 Telegram Action tools (strictly bound target, no arbitrary send)', () => disposable(async (dir) => {
  const recorded = [];
  const mockAdapter = createMockActionAdapter(recorded);

  const messagingWriteService = new MessagingWriteService(
    mockAdapter,
    new MemoryWriteLedger(),
    new MemoryWriteAuditSink(),
    { resolve: () => ({ kind: 'document', tdlibFileId: 1 }) },
  );

  const mockAccountService = createMockAccountService(100);
  const boundTarget = '5551234';
  const singleUserWriteConfig = {
    enabled: true,
    boundChatId: boundTarget,
    boundChatNumberId: 5551234,
  };

  const session = await createClientServerSession({
    singleUserWriteConfig,
    messagingWriteService,
    accountService: mockAccountService,
  });

  try {
    // 1. send
    const r1 = await session.client.callTool({ name: 'telegram_message_send', arguments: { text: 'Test send', request_key: 'req_1' } });
    assert.equal(r1.isError, undefined);

    // 2. reply
    const r2 = await session.client.callTool({ name: 'telegram_message_reply', arguments: { reply_message_id: '10', text: 'Test reply', request_key: 'req_2' } });
    assert.equal(r2.isError, undefined);

    // 3. edit
    const r3 = await session.client.callTool({ name: 'telegram_message_edit', arguments: { message_id: '10', text: 'Edited text', request_key: 'req_3' } });
    assert.equal(r3.isError, undefined);

    // 4. delete (with required revoke: true)
    const r4 = await session.client.callTool({ name: 'telegram_message_delete', arguments: { message_id: '10', revoke: true, request_key: 'req_4' } });
    assert.equal(r4.isError, undefined);

    // 5. forward (forward within bound chat)
    const r5 = await session.client.callTool({ name: 'telegram_message_forward', arguments: { message_id: '10', request_key: 'req_5' } });
    assert.equal(r5.isError, undefined);

    // 6. reaction_add
    const r6 = await session.client.callTool({ name: 'telegram_message_reaction_add', arguments: { message_id: '10', emoji: '👍', request_key: 'req_6' } });
    assert.equal(r6.isError, undefined);

    // 7. reaction_remove
    const r7 = await session.client.callTool({ name: 'telegram_message_reaction_remove', arguments: { message_id: '10', emoji: '👍', request_key: 'req_7' } });
    assert.equal(r7.isError, undefined);

    // 8. pin
    const r8 = await session.client.callTool({ name: 'telegram_message_pin', arguments: { message_id: '10', disable_notification: false, only_for_self: false, request_key: 'req_8' } });
    assert.equal(r8.isError, undefined);

    // 9. unpin
    const r9 = await session.client.callTool({ name: 'telegram_message_unpin', arguments: { message_id: '10', request_key: 'req_9' } });
    assert.equal(r9.isError, undefined);

    // 10. mark_read
    const r10 = await session.client.callTool({ name: 'telegram_message_mark_read', arguments: { message_id: '10', request_key: 'req_10' } });
    assert.equal(r10.isError, undefined);

    // 11. media_send
    const r11 = await session.client.callTool({ name: 'telegram_message_media_send', arguments: { media_ref: 'doc1', request_key: 'req_11' } });
    assert.equal(r11.isError, undefined);

    // 12. text_schedule
    const futureSec = Math.floor(Date.now() / 1000) + 3600;
    const r12 = await session.client.callTool({ name: 'telegram_message_text_schedule', arguments: { text: 'Scheduled text', send_at: futureSec, request_key: 'req_12' } });
    assert.equal(r12.isError, undefined);

    // 13. media_schedule
    const r13 = await session.client.callTool({ name: 'telegram_message_media_schedule', arguments: { media_ref: 'doc1', send_at: futureSec, request_key: 'req_13' } });
    assert.equal(r13.isError, undefined);

    // PROOF: Every single dispatch was strictly addressed to the bound chat!
    assert.equal(recorded.length, 13);
    for (const d of recorded) {
      const targetChat = d.p.chatId ?? d.p.targetChatId;
      assert.equal(String(targetChat), boundTarget, `Dispatched mutation must target bound chat ${boundTarget}`);
    }
  } finally {
    await session.close();
  }
}));

test('4. Synthetic execution for all 9 Sales CRM tools (including telegram_sales_quick_reply_send)', () => disposable(async (dir) => {
  const crmDir = join(dir, 'crm');
  initializeCrm(crmDir, CRM_ACKNOWLEDGMENT);
  const salesStore = new LocalSalesStore(join(crmDir, 'sales.sqlite'));

  const recordedSends = [];
  const mockAdapter = createMockActionAdapter(recordedSends);

  const messagingWriteService = new MessagingWriteService(
    mockAdapter,
    new MemoryWriteLedger(),
    new MemoryWriteAuditSink(),
  );

  const mockAccountService = createMockAccountService(1);
  const boundTarget = '999888';
  const singleUserWriteConfig = {
    enabled: true,
    boundChatId: boundTarget,
    boundChatNumberId: 999888,
  };

  const session = await createClientServerSession({
    salesStore,
    singleUserWriteConfig,
    messagingWriteService,
    accountService: mockAccountService,
  });

  try {
    // 1. lead_upsert
    const l1 = await session.client.callTool({
      name: 'telegram_sales_lead_upsert',
      arguments: { user_id: '12345', display_name: 'Alice Customer', stage: 'NEW', notes: 'VIP inquiry' },
    });
    assert.equal(l1.isError, undefined);
    assert.equal(l1.structuredContent.ok, true);

    // 2. lead_get
    const l2 = await session.client.callTool({
      name: 'telegram_sales_lead_get',
      arguments: { user_id: '12345' },
    });
    assert.equal(l2.isError, undefined);
    assert.equal(l2.structuredContent.ok, true);
    assert.equal(l2.structuredContent.lead.displayName, 'Alice Customer');

    // 3. leads_list
    const l3 = await session.client.callTool({
      name: 'telegram_sales_leads_list',
      arguments: { stage: 'NEW' },
    });
    assert.equal(l3.isError, undefined);
    assert.equal(l3.structuredContent.ok, true);
    assert.equal(l3.structuredContent.leads.length, 1);

    // 4. group_track
    const g1 = await session.client.callTool({
      name: 'telegram_sales_group_track',
      arguments: { chat_id: '999888', label: 'VIP Sales Group', priority: 'HIGH' },
    });
    assert.equal(g1.isError, undefined);
    assert.equal(g1.structuredContent.ok, true);

    // 5. groups_list
    const g2 = await session.client.callTool({
      name: 'telegram_sales_groups_list',
      arguments: { limit: 10 },
    });
    assert.equal(g2.isError, undefined);
    assert.equal(g2.structuredContent.ok, true);
    assert.equal(g2.structuredContent.groups.length, 1);

    // 6. quick_reply_upsert
    const t1 = await session.client.callTool({
      name: 'telegram_sales_quick_reply_upsert',
      arguments: {
        code: 'welcome_quote',
        title: 'Welcome Quote Template',
        text: 'Xin chao {{customer}}, bao gia cho tuyen {{route}} vao ngay {{date}} la {{fare}}.',
      },
    });
    assert.equal(t1.isError, undefined);
    assert.equal(t1.structuredContent.ok, true);

    // 7. quick_replies_list
    const t2 = await session.client.callTool({
      name: 'telegram_sales_quick_replies_list',
      arguments: {},
    });
    assert.equal(t2.isError, undefined);
    assert.equal(t2.structuredContent.ok, true);
    assert.equal(t2.structuredContent.templates.length, 1);

    // 8. quick_reply_preview (never dispatches to Telegram)
    const p1 = await session.client.callTool({
      name: 'telegram_sales_quick_reply_preview',
      arguments: {
        template_code: 'welcome_quote',
        variables: { customer: 'Anh Nam', route: 'HN-DN', date: '2026-11-01', fare: '1,500,000 VND' },
      },
    });
    assert.equal(p1.isError, undefined);
    assert.equal(p1.structuredContent.ok, true);
    assert.match(p1.structuredContent.final_text, /Anh Nam/);
    assert.equal(recordedSends.length, 0, 'Preview must never dispatch to Telegram');

    // 9. quick_reply_send (dispatches to bound chat via MessagingWriteService)
    const s1 = await session.client.callTool({
      name: 'telegram_sales_quick_reply_send',
      arguments: {
        template_code: 'welcome_quote',
        variables: { customer: 'Anh Nam', route: 'HN-DN', date: '2026-11-01', fare: '1,500,000 VND' },
        request_key: 'qr_send_key_1',
      },
    });
    assert.equal(s1.isError, undefined);
    assert.equal(s1.structuredContent.state, 'CONFIRMED');
    assert.equal(recordedSends.length, 1, 'Quick reply send must invoke messaging write service');
    assert.equal(String(recordedSends[0].p.chatId), boundTarget, 'Must dispatch to bound target');
    assert.match(recordedSends[0].p.text, /Anh Nam/);
  } finally {
    await session.close();
    salesStore.close();
  }
}));

test('5. Real doctor diagnostic accurately reports unmet requirements and repair steps', () => {
  const report = runDoctor();
  assert.equal(typeof report.toolsAvailable, 'number');
  assert(report.summary.includes('Doctor Result'));
  const checks = report.checks;
  assert(checks.some((c) => c.name === 'Node.js Runtime'));
  assert(checks.some((c) => c.name === 'Operating System'));
  assert(checks.some((c) => c.name === 'Native TDLib Bundle'));
});

test('6. Fresh-clone CLI smoke test: doctor, help, CRM init and launch commands', () => disposable((dir) => {
  // Test doctor CLI
  const doc = spawnSync(process.execPath, ['dist/cli.js', 'doctor'], { cwd: root, encoding: 'utf8' });
  assert.equal(doc.status, 0);
  assert(doc.stdout.includes('TELEGRAM SALES MCP DOCTOR'));

  // Test help CLI
  const help = spawnSync(process.execPath, ['dist/cli.js', '--help'], { cwd: root, encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert(help.stdout.includes('33-tool single-user runtime'));

  // Test CRM init in disposable directory
  const crmDir = join(dir, 'fresh_crm');
  initializeCrm(crmDir, CRM_ACKNOWLEDGMENT);
  assert(existsSync(join(crmDir, 'sales.sqlite')));
  assert(existsSync(join(crmDir, 'consent.json')));
}));
