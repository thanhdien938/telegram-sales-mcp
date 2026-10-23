import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { snapshot,canonicalAlgorithm } from './manifest-lib.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));const m=JSON.parse(readFileSync(join(root,'EXPORT_MANIFEST.json'),'utf8'));const actual=snapshot(root);
const shape=x=>({path:x.path,sha256:x.sha256});
if(m.schema!==2||m.canonicalAlgorithm!==canonicalAlgorithm||m.treeSha256!==actual.treeSha256||m.fileCountExcludingSelf!==actual.files.length||JSON.stringify(m.files.map(shape))!==JSON.stringify(actual.files))throw new Error('EXPORT_MANIFEST_MISMATCH');
console.log(JSON.stringify({manifest:'PASS',files_including_self:actual.files.length+1,tree_sha256:actual.treeSha256,generated_trees_omitted:actual.omitted}));
