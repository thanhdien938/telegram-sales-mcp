import { reopenPortable, parsePortableOptions } from './runtime/portable-provider.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createPublicServer } from './mcp/public-server.js';
import { openConsentedCrm } from './runtime/crm-consent.js';
const args = process.argv.slice(2);
if (args.includes('--help')) {
  process.stdout.write('Source beta: node dist/cli.js [--crm ABSOLUTE_NEW_CRM_DIRECTORY]\nTelegram is NOT_CONFIGURED. Native build HOLD; private login/reopen source is present but gated. No Telegram write dispatch.\n');
} else {
  let store: ReturnType<typeof openConsentedCrm> | undefined;
  let server: ReturnType<typeof createPublicServer> | undefined;
  let native: Awaited<ReturnType<typeof reopenPortable>> | undefined;
  let storeClosed = false;
  const closeStore = () => { if (!storeClosed) { storeClosed = true; store?.close(); } };
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => { try { await server?.close(); } finally { closeStore(); await native?.stop(); } })();
  try {
    const options=[...args];let crmPath:string|undefined;
    const crm=options.indexOf('--crm');
    if(crm>=0){const path=options[crm+1];if(!path)throw new Error();crmPath=path;options.splice(crm,2);}
    if(options.length)native=await reopenPortable(parsePortableOptions(options));
    if(crmPath)store=openConsentedCrm(crmPath);
    server=createPublicServer({ ...(store?{salesStore:store}:{}), ...(native?{services:native.services}:{}) });
    process.once('SIGINT', () => { void close().then(() => { process.exitCode = 0; }); });
    process.once('SIGTERM', () => { void close().then(() => { process.exitCode = 0; }); });
    const transport = new StdioServerTransport();
    server.server.onclose = () => { closeStore(); void native?.stop().catch(()=>undefined); };
    await server.connect(transport);
  } catch {
    await close(); process.stderr.write('PUBLIC_START_REJECTED\n'); process.exitCode = 1;
  }
}
