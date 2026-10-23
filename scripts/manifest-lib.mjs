import { readdirSync,lstatSync,readFileSync } from 'node:fs';
import { join,relative } from 'node:path';
import { createHash } from 'node:crypto';
export function snapshot(root){
 const files=[];let omitted=0;
 function walk(dir){for(const name of readdirSync(dir)){
  const path=join(dir,name),st=lstatSync(path),rel=relative(root,path).replaceAll('\\','/').normalize('NFC');
  if(st.isSymbolicLink()||(st.isFile()&&st.nlink!==1))throw new Error('MANIFEST_LINK_REJECTED');
  if(st.isDirectory()){
   if(name==='.git')throw new Error('GIT_HISTORY_REJECTED');
   if(dir===root&&['node_modules','.npm-cache','.qa'].includes(name)){omitted++;continue;}
   walk(path);
  }else if(rel!=='EXPORT_MANIFEST.json')files.push({path:rel,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')});
 }}
 walk(root);files.sort((a,b)=>Buffer.compare(Buffer.from(a.path,'utf8'),Buffer.from(b.path,'utf8')));
 const serialized=files.map(x=>x.path+'\0'+x.sha256+'\n').join('');
 return {files,treeSha256:createHash('sha256').update(serialized,'utf8').digest('hex'),omitted};
}
export const canonicalAlgorithm='SHA256 of UTF-8 records: NFC POSIX relative path + U+0000 + lowercase SHA256(raw file bytes) + LF, sorted by UTF-8 path bytes; exclude EXPORT_MANIFEST.json itself and generated node_modules/.npm-cache/.qa trees; reject links and Git history';
