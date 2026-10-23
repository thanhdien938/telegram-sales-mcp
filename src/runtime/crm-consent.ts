import { mkdirSync, lstatSync, existsSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve, dirname, join, isAbsolute } from 'node:path';
import { LocalSalesStore } from '../sales/local-sales-store.js';
const ACK = 'I_ACCEPT_LOCAL_CRM_AND_MCP_DATA_DISCLOSURE';
export const CRM_ACKNOWLEDGMENT = ACK;
function fail(): never { throw new Error('CRM_CONSENT_OR_PATH_REJECTED'); }
function plainAncestors(path: string): void {
  let at = resolve(path);
  for (;;) {
    const st = lstatSync(at); if (st.isSymbolicLink() || !st.isDirectory()) fail();
    if (resolve(realpathSync(at)).toLowerCase() !== at.toLowerCase()) fail();
    const parent = dirname(at); if (parent === at) break; at = parent;
  }
}
function directory(input: string): string {
  if (!isAbsolute(input)) fail();
  const dir = resolve(input); if (dir === dirname(dir)) fail(); return dir;
}
function plainFile(file: string): void {
  const st = lstatSync(file); if (st.isSymbolicLink() || !st.isFile()) fail();
  if (resolve(realpathSync(file)).toLowerCase() !== resolve(file).toLowerCase()) fail();
}
/** The interactive CLI obtains this acknowledgment outside MCP/model fields. */
export function initializeCrm(input: string, acknowledgment: string): void {
  if (acknowledgment !== ACK) fail();
  const dir = directory(input); if (existsSync(dir)) fail();
  plainAncestors(dirname(dir)); mkdirSync(dir); plainAncestors(dir);
  const store = new LocalSalesStore(join(dir, 'sales.sqlite')); store.close();
  writeFileSync(join(dir, 'consent.json'), JSON.stringify({ schema: 1, local_mutation_accepted: true, mcp_disclosure_accepted: true })+'\n', { flag: 'wx', mode: 0o600 });
}
/** No constructor/schema initialization before consent and non-link checks. */
export function openConsentedCrm(input: string): LocalSalesStore {
  const dir = directory(input); plainAncestors(dir);
  const marker = join(dir, 'consent.json'); const db = join(dir, 'sales.sqlite');
  plainFile(marker); plainFile(db);
  for (const suffix of ['-wal', '-shm', '-journal']) if (existsSync(db+suffix)) plainFile(db+suffix);
  if (lstatSync(marker).size > 512) fail();
  const m: unknown = JSON.parse(readFileSync(marker, 'utf8'));
  if (typeof m !== 'object' || m === null || !('schema' in m) || m.schema !== 1 || !('local_mutation_accepted' in m) || m.local_mutation_accepted !== true || !('mcp_disclosure_accepted' in m) || m.mcp_disclosure_accepted !== true) fail();
  return new LocalSalesStore(db);
}
