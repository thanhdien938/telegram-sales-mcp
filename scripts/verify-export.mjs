import { lstatSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const omitted=new Set(['node_modules','.npm-cache','.qa']);
const findings=[]; const reviewedFalsePositives=[]; const files=[];let generatedDependencyFiles=0;
function walk(dir) {
  for(const name of readdirSync(dir)) {
    const abs=join(dir,name);const st=lstatSync(abs);const rel=relative(root,abs).replaceAll('\\','/');
    if(st.isSymbolicLink()||(st.isFile()&&st.nlink!==1)){ findings.push({path:rel,category:'LINK_REJECTED'});continue; }
    if(st.isDirectory()) {
      if((dir===root&&['.runtime','runtime','auth','sessions','credentials','secrets','local-state','tdlib-db','tdlib-files','state'].includes(name))||name==='.git'){findings.push({path:rel,category:'GIT_HISTORY_REJECTED'});continue;}
      if(dir===root && omitted.has(name)){generatedDependencyFiles++;continue;}
      walk(abs);
    } else files.push(rel);
  }
}
walk(root);
for(const path of files) {
  const b=readFileSync(join(root,path)); const t=b.toString('utf8');
  const check=(category,pat)=>{ if(pat.test(t)) findings.push({path,category}); };
  if(/\.(?:sqlite|sqlite3|db|session|pem|key|png|jpe?g|dll|exe|log|bin|lock)(?:$|-)/i.test(path))findings.push({path,category:'FORBIDDEN_ARTIFACT'});
  if(/^\.env(?:\.|$)/.test(path)&&path!=='.env.example')findings.push({path,category:'ENV_FILE_REJECTED'});
  if(b.includes(0))findings.push({path,category:'BINARY_REVIEW'});
  // Exclude this scanner's own pattern definitions from literal-content matching.
  if(path!=='scripts/verify-export.mjs') {
    check('PRIVATE_KEY',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/);
    check('BOT_TOKEN',/\b\d{7,12}:[A-Za-z0-9_-]{30,}\b/);
    check('JWT',/\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
    check('OPERATOR_PATH',/[DE]:[\\/]|C:[\\/]Users[\\/]/i);
    for (const m of t.matchAll(/(?<!\w)(?:\+\d{9,15}|-\d{9,14})(?!\w)/g)) {
      const line=(t.slice(0,m.index).split('\n').at(-1)+t.slice(m.index).split('\n')[0]).replace(/\r$/, '');
      if(path==='dist/domain/common/id-validator.d.ts' && /^export declare const MIN_INT32 = -\d+;$/.test(line) && Number(m[0])===-(2**31)) reviewedFalsePositives.push({path,category:'GENERATED_SIGNED_INTEGER_BOUND'});
      else findings.push({path,category:'PHONE_CHAT_SHAPE'});
    }
    check('SOURCE_PRIVATE_REFERENCE',/telegram-sales-plugin|owner-production-readonly|production-factory|\.\.\/\.\.\/\.\.\/telegram/);
  }
  if(path.startsWith('src/') && /from\s*['"]|import\s*\(/.test(t)) {
    for(const m of t.matchAll(/(?:from\s*|import\s*\(|import\s*)['"](\.[^'"]+)['"]/g)) {
      const target=resolve(dirname(join(root,path)),m[1].replace(/\.js$/,'.ts'));
      if(!target.startsWith(root+'/')&&!target.startsWith(root+'\\')) findings.push({path,category:'IMPORT_ESCAPES_CANDIDATE'});
      else if(!existsSync(target))findings.push({path,category:'IMPORT_MISSING'});
    }
  }
}
console.log(JSON.stringify({files_scanned:files.length,generated_trees_omitted:generatedDependencyFiles,reviewed_false_positives:reviewedFalsePositives,findings}));
process.exitCode=findings.length?1:0;
