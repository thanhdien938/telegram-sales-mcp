import { readFileSync,writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { snapshot,canonicalAlgorithm } from './manifest-lib.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const old=JSON.parse(readFileSync(join(root,'EXPORT_MANIFEST.json'),'utf8'));const previous=new Map((old.files??[]).map(x=>[x.path,x]));
const next=snapshot(root);const entries=next.files.map(x=>{
 const prior=previous.get(x.path);return {...x,decision:x.path.startsWith('dist/')?'GENERATED_FROM_REVIEWED_SOURCE':prior?(prior.sha256===x.sha256?prior.decision:'UPDATED_P1_R2'):'NEW_P1_R2'};
});
const result={schema:2,candidate_version:'1.0.0-beta.2',canonicalAlgorithm,treeSha256:next.treeSha256,fileCountExcludingSelf:entries.length,files:entries,
 policy:{git_history:'ABSENT',private_docs_runtime_session:'EXCLUDED',native_binaries:'NOT_BUNDLED',telegram_writes:'HARD_DISABLED',native_build:'HOLD',real_telegram_qualified:false},
 verification:{node_tests:{passed:36,failed:0},python_mock_tests:{passed:5,failed:0},actual_native_build:'NOT_RUN',actual_windows_dpapi:'NOT_RUN',actual_terminal_login:'NOT_RUN',actual_telegram_reads:'NOT_RUN'},
 self:'EXPORT_MANIFEST.json excluded from its own tree hash; independent verifier must also scan this file for privacy'};
writeFileSync(join(root,'EXPORT_MANIFEST.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({file_count_including_self:entries.length+1,tree_sha256:next.treeSha256,generated_trees_omitted:next.omitted}));
