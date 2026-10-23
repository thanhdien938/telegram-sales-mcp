import { spawn } from 'node:child_process';
import type { Vault } from './session-store.js';
/** Private helper stdin/stdout is not MCP stdin/stdout. Never use argv/env for material. */
export function createWindowsVault(python:string,helper:string):Vault {
  const run=(mode:'protect'|'unprotect',value:Buffer,context:string):Promise<Buffer>=>new Promise((resolve,reject)=>{
    if(process.platform!=='win32'){reject(new Error('WINDOWS_DPAPI_REQUIRED'));return;}
    const child=spawn(python,['-I','-B',helper,mode],{stdio:'pipe',windowsHide:true,env:{SystemRoot:process.env.SystemRoot??''}});
    let output=Buffer.alloc(0),settled=false;
    const timer=setTimeout(()=>finish(),10000);
    const finish=(ok=false)=>{if(settled)return;settled=true;clearTimeout(timer);if(!ok){child.kill();output.fill(0);reject(new Error('DPAPI_OPERATION_FAILED'));return;}try{const result:unknown=JSON.parse(output.toString());if(typeof result!=='object'||result===null||!('value' in result)||typeof result.value!=='string')throw new Error();resolve(Buffer.from(result.value,'base64'));}catch{reject(new Error('DPAPI_RESPONSE_REJECTED'));}finally{output.fill(0);}};
    child.stdout.on('data',(b:Buffer)=>{output=Buffer.concat([output,b]);if(output.length>65536)finish();});
    child.stderr.on('data',()=>finish());child.on('error',()=>finish());child.on('exit',code=>finish(code===0));
    child.stdin.on('error',()=>finish());child.stdin.end(JSON.stringify({value:value.toString('base64'),context}));
  });
  return Object.freeze({protect:(value:Buffer,context:string)=>run('protect',value,context),unprotect:(value:Buffer,context:string)=>run('unprotect',value,context)});
}
