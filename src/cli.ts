import { reopenPortable, parsePortableOptions } from './runtime/portable-provider.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createPublicServer } from './mcp/public-server.js';
import { openConsentedCrm } from './runtime/crm-consent.js';
import {
  loadSingleUserWriteConfigFromEnv,
  type SingleUserWriteConfig,
} from './mcp/single-user-write.js';
import {
  loadMediaCatalogFromEnv,
  MemoryWriteAuditSink,
  MemoryWriteLedger,
  MessagingWriteService,
  SqliteWritePersistence,
  type WritePersistence,
} from './domain/messaging-write/index.js';
import { runDoctor } from './doctor.js';

const args = process.argv.slice(2);

if (args[0] === 'doctor') {
  let crm: string | undefined;
  let state: string | undefined;
  let manifest: string | undefined;
  let python: string | undefined;
  let chatId: string | undefined;
  let writesEnabled = false;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--crm') crm = args[++i];
    else if (args[i] === '--state') state = args[++i];
    else if (args[i] === '--native-manifest') manifest = args[++i];
    else if (args[i] === '--python') python = args[++i];
    else if (args[i] === '--chat-id') chatId = args[++i];
    else if (args[i] === '--writes') writesEnabled = true;
  }

  const report = runDoctor({ crm, state, manifest, python, chatId, writesEnabled });
  process.stdout.write(`\n=== TELEGRAM SALES MCP DOCTOR ===\n\n`);
  for (const c of report.checks) {
    const icon = c.status === 'PASS' ? '[PASS]' : c.status === 'WARN' ? '[WARN]' : '[FAIL]';
    process.stdout.write(`${icon} ${c.name}: ${c.message}\n`);
    if (c.repairStep) {
      process.stdout.write(`       Repair: ${c.repairStep}\n`);
    }
  }
  process.stdout.write(`\n${report.summary}\n\n`);
  process.exit(0);
} else if (args.includes('--help')) {
  process.stdout.write(
    'Telegram Sales MCP — 33-tool single-user runtime\n\n' +
    'Commands:\n' +
    '  Stdio MCP server:\n' +
    '    node dist/cli.js [--crm ABSOLUTE_CRM_DIRECTORY] [--state ABSOLUTE_STATE_DIR --native-manifest MANIFEST_PATH --python PYTHON_PATH] [--writes --chat-id TARGET_CHAT_ID]\n\n' +
    '  Doctor check:\n' +
    '    node dist/cli.js doctor\n\n' +
    '  Private Terminal Login:\n' +
    '    node dist/login.js --state ABSOLUTE_STATE_DIR --native-manifest MANIFEST_PATH --python PYTHON_PATH\n\n' +
    '  Consented CRM Init:\n' +
    '    node dist/crm-init.js ABSOLUTE_NEW_CRM_DIRECTORY\n\n' +
    'Tool capabilities: 11 Read + 13 Action + 9 Sales CRM = 33 tools total.\n'
  );
} else {
  let store: ReturnType<typeof openConsentedCrm> | undefined;
  let server: ReturnType<typeof createPublicServer> | undefined;
  let native: Awaited<ReturnType<typeof reopenPortable>> | undefined;
  let storeClosed = false;
  const closeStore = () => { if (!storeClosed) { storeClosed = true; store?.close(); } };
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => { try { await server?.close(); } finally { closeStore(); await native?.stop(); } })();

  try {
    if (args.includes('--enable-writes')) {
      throw new Error('FLAG_REJECTED');
    }

    const options = [...args];
    let crmPath: string | undefined;
    let writesExplicit = false;
    let boundChatId: string | undefined;
    let writeDbPath: string | undefined;
    let mediaCatalogPath: string | undefined;

    // Parse CLI options
    for (let i = 0; i < options.length;) {
      if (options[i] === '--crm') {
        crmPath = options[i + 1];
        if (!crmPath) throw new Error('Missing --crm argument');
        options.splice(i, 2);
      } else if (options[i] === '--writes') {
        writesExplicit = true;
        options.splice(i, 1);
      } else if (options[i] === '--chat-id') {
        boundChatId = options[i + 1];
        if (!boundChatId) throw new Error('Missing --chat-id argument');
        options.splice(i, 2);
      } else if (options[i] === '--write-db') {
        writeDbPath = options[i + 1];
        options.splice(i, 2);
      } else if (options[i] === '--media-catalog') {
        mediaCatalogPath = options[i + 1];
        options.splice(i, 2);
      } else {
        i++;
      }
    }

    if (boundChatId) {
      process.env.TELEGRAM_SINGLE_USER_CHAT_ID = boundChatId;
    }
    if (writesExplicit) {
      process.env.TELEGRAM_SINGLE_USER_WRITES = '1';
    }

    let writesRequested = false;
    if (writesExplicit) {
      if (!boundChatId && !process.env.TELEGRAM_SINGLE_USER_CHAT_ID) {
        throw new Error('WRITES_REQUIRE_CHAT_ID');
      }
      writesRequested = true;
    } else if (process.env.TELEGRAM_SINGLE_USER_WRITES === '1') {
      if (process.env.TELEGRAM_SINGLE_USER_CHAT_ID) {
        writesRequested = true;
      }
    }

    // Reopen portable Telegram account runtime if options provided
    if (options.length > 0) {
      native = await reopenPortable(parsePortableOptions(options), undefined, writesRequested);
    }

    // If writes requested explicitly via CLI but no native runtime provided, reject
    if (writesExplicit && !native) {
      throw new Error('WRITES_REQUIRE_ACCOUNT_RUNTIME');
    }

    let singleUserWriteConfig: SingleUserWriteConfig | undefined;
    let messagingWriteService: MessagingWriteService | undefined;

    if (writesRequested && native) {
      singleUserWriteConfig = loadSingleUserWriteConfigFromEnv();
      if (singleUserWriteConfig) {
        const dbPath = writeDbPath ?? process.env.TELEGRAM_SINGLE_USER_WRITE_DB;
        let persistence: WritePersistence | undefined;
        if (dbPath) {
          persistence = new SqliteWritePersistence(dbPath, { createIfMissing: true });
        }

        const mediaCatalog = mediaCatalogPath ?? process.env.TELEGRAM_SINGLE_USER_MEDIA_CATALOG;
        const mediaRegistry = mediaCatalog ? loadMediaCatalogFromEnv({ TELEGRAM_SINGLE_USER_MEDIA_CATALOG: mediaCatalog }) : undefined;

        messagingWriteService = new MessagingWriteService(
          native.adapter,
          new MemoryWriteLedger(),
          new MemoryWriteAuditSink(),
          mediaRegistry,
          undefined,
          persistence,
        );
      }
    }

    // Open consented CRM store if path provided or configured via env
    const crmTarget = crmPath ?? process.env.TELEGRAM_SINGLE_USER_SALES_DB;
    if (crmTarget) {
      store = openConsentedCrm(crmTarget);
    }

    server = createPublicServer({
      services: native?.services,
      salesStore: store,
      singleUserWriteConfig,
      messagingWriteService,
      accountService: native?.accountService,
    });

    process.once('SIGINT', () => { void close().then(() => { process.exitCode = 0; }); });
    process.once('SIGTERM', () => { void close().then(() => { process.exitCode = 0; }); });

    const transport = new StdioServerTransport();
    server.server.onclose = () => { closeStore(); void native?.stop().catch(() => undefined); };
    await server.connect(transport);
  } catch {
    await close();
    process.stderr.write('PUBLIC_START_REJECTED\n');
    process.exitCode = 1;
  }
}
