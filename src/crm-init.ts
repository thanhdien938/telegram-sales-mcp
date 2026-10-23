import { createInterface } from 'node:readline/promises';
import { initializeCrm, CRM_ACKNOWLEDGMENT } from './runtime/crm-consent.js';
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write('node dist/crm-init.js ABSOLUTE_ABSENT_DIRECTORY (interactive terminal only)\n');
} else {
  let terminal: ReturnType<typeof createInterface> | undefined;
  try {
    if (args.length !== 1 || !args[0] || !process.stdin.isTTY || !process.stdout.isTTY) throw new Error();
    terminal = createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write('Creates local CRM storage. Contacts, notes and templates may be returned to your MCP/AI client. Review that client retention policy. No Telegram send is enabled.\n');
    const answer = await terminal.question('Type '+CRM_ACKNOWLEDGMENT+' to proceed: ');
    initializeCrm(args[0], answer); process.stdout.write('CRM_INITIALIZED\n');
  } catch { process.stderr.write('CRM_INITIALIZATION_REJECTED\n'); process.exitCode = 1; }
  finally { terminal?.close(); }
}
