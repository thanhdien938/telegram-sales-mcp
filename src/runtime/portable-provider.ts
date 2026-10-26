import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { requireQualifiedNativeBuild } from './native-policy.js';
import { verifyNativeBundle } from './native-integrity.js';
import { spawnNativeWire } from './native-process.js';
import { createNativeChannel } from './native-channel.js';
import { acquireSession, type Credentials } from './session-store.js';
import { createWindowsVault } from './windows-vault.js';
import { createTerminalSecrets } from './terminal-secrets.js';
import { authenticate, readApiCredentials } from './auth-controller.js';
import { createReadSession } from './read-session.js';
export interface PortableOptions { state:string; nativeManifest:string; python:string; }
const projectRoot=fileURLToPath(new URL('../../',import.meta.url));
function checked(options:PortableOptions){
  requireQualifiedNativeBuild(options.nativeManifest);
  return verifyNativeBundle(options.nativeManifest,join(projectRoot,'native','tdjson_wrapper.py'),options.python,[projectRoot,dirname(projectRoot)]);
}
function privateIdentity(payload:Readonly<Record<string,unknown>>):string{
  const kind=payload.type;
  if(payload['@type']!=='user'||typeof kind!=='object'||kind===null||(kind as Record<string,unknown>)['@type']!=='userTypeRegular'||!['string','number'].includes(typeof payload.id)||!/^\d+$/.test(String(payload.id)))throw new Error('ACCOUNT_IDENTITY_REJECTED');
  if(typeof payload.id==='number'&&!Number.isSafeInteger(payload.id))throw new Error('ACCOUNT_IDENTITY_REJECTED');
  if(String(payload.id).length>20||BigInt(String(payload.id))<=0n)throw new Error('ACCOUNT_IDENTITY_REJECTED');
  return String(payload.id);
}
async function open(options:PortableOptions,mode:'fresh'|'reopen',signal?:AbortSignal,writesEnabled = false){
  const native=checked(options),vault=createWindowsVault(native.python,join(projectRoot,'native','windows_vault.py'));
  const store=acquireSession(options.state,mode,vault,[projectRoot,dirname(projectRoot),dirname(native.dll)]);
  let channel:ReturnType<typeof createNativeChannel>|undefined,session:ReturnType<typeof createReadSession>|undefined;
  let closing:Promise<void>|undefined;
  const close=()=>closing??=(async()=>{let confirmed=false;try{await session?.stop();await channel?.stop();confirmed=true;}finally{signal?.removeEventListener('abort',abortStop);if(confirmed)store.release();}})();
  const abortStop=()=>{void close().catch(()=>undefined);};signal?.addEventListener('abort',abortStop,{once:true});
  try{
    const terminal=mode==='fresh'?createTerminalSecrets():undefined;
    let credentials:Credentials, verify:(identity:string)=>void=()=>{};
    if(mode==='fresh'){
      const acknowledgment=await terminal!.read('consent',signal);if(acknowledgment!=='CREATE_NEW_PRIVATE_SESSION')throw new Error('SESSION_CONSENT_REJECTED');
      const api=await readApiCredentials(terminal!,signal);credentials={...api,databaseKey:randomBytes(32).toString('base64'),nativeBundle:native.bundleId};
    }else{const saved=await store.load(native.bundleId);credentials=saved.credentials;verify=saved.verifyIdentity;}
    if(signal?.aborted)throw new Error('AUTH_CANCELLED');
    const wire=spawnNativeWire(native.python,native.wrapper,native.dll,mode,writesEnabled);channel=createNativeChannel(wire,mode,{writesEnabled});session=createReadSession(channel.read,{writesEnabled});
    await session.start();await session.adapter.getAuthorizationState();
    const readIdentity=async()=>{
      let identity='';let response:Readonly<Record<string,unknown>>|undefined;
      const extra='identity-'+Date.now().toString(36);
      const unsubscribe=channel!.read.subscribe(event=>{if(event.kind==='response'&&event.extra===extra)response=event.payload;});
      try{await channel!.read.send({'@type':'getMe','@extra':extra});if(!response)throw new Error();identity=privateIdentity(response);}finally{unsubscribe();}
      return identity;
    };
    const identity=await authenticate(channel.setup,{mode,credentials,databaseDirectory:store.databaseDirectory,filesDirectory:store.filesDirectory,readIdentity},terminal,signal);
    if(mode==='fresh')await store.commit(credentials,identity);else verify(identity);
    const services={accountService:session.accountService,chatsService:session.chatsService,messagesService:session.messagesService,searchService:session.searchService,contactsService:session.contactsService,fileService:session.fileService};
    return Object.freeze({services,adapter:session.adapter,accountService:session.accountService,stop:close});
  }catch{await close();throw new Error(mode==='fresh'?'PRIVATE_LOGIN_FAILED':'REOPEN_REQUIRED_USE_PRIVATE_TERMINAL');}
}
export async function loginPortable(options:PortableOptions,signal?:AbortSignal):Promise<void>{const runtime=await open(options,'fresh',signal);await runtime.stop();}
export const reopenPortable=(options:PortableOptions,signal?:AbortSignal,writesEnabled = false)=>open(options,'reopen',signal,writesEnabled);
export function parsePortableOptions(args:readonly string[]):PortableOptions{
  const result:Record<string,string>={};if(args.length!==6)throw new Error('PORTABLE_OPTIONS_REJECTED');
  for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];if(!key||!value||!['--state','--native-manifest','--python'].includes(key)||result[key])throw new Error('PORTABLE_OPTIONS_REJECTED');result[key]=value;}
  return {state:result['--state']!,nativeManifest:result['--native-manifest']!,python:result['--python']!};
}
