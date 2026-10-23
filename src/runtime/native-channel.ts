import { randomUUID } from 'node:crypto';
import type { ITdlibTransport } from '../telegram/tdlib/transport.js';
import type { TdlibClientPayload, TdlibTransportEvent } from '../telegram/tdlib/types.js';
import { assertNativeRpc, type NativeMode } from './native-policy.js';
export interface WirePort {
  write(line: string): Promise<void>;
  onData(fn: (chunk: Buffer) => void): () => void;
  onExit(fn: () => void): () => void;
  stop(): Promise<void>;
}
export interface SetupPort {
  request(method: string, params?: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
  waitState(signal?: AbortSignal): Promise<string>;
}
/** Private wire state lives in closures; the read facade cannot obtain the setup port. */
export function createNativeChannel(wire: WirePort, mode: NativeMode, limits: { timeoutMs?: number; maxBytes?: number; maxPending?: number } = {}) {
  const timeout = limits.timeoutMs ?? 15000, max = limits.maxBytes ?? 1024*1024, pendingMax = limits.maxPending ?? 32;
  if (![timeout,max,pendingMax].every(n=>Number.isSafeInteger(n)&&n>0)) throw new Error('NATIVE_LIMITS_REJECTED');
  const pending = new Map<string,{scope:'read'|'setup';resolve:(v:Readonly<Record<string,unknown>>)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  const listeners = new Set<(e:TdlibTransportEvent)=>void>();
  let buffer=Buffer.alloc(0), state: 'stopped'|'running'|'failed'|'closed'='stopped', authState: string|undefined; const authQueue:string[]=[];
  const stateWaiters = new Set<(value?: string)=>void>();
  let wasReady=false;
  let stopPromise:Promise<void>|undefined; let removeData=()=>{};let removeExit=()=>{};
  const emit=(e:TdlibTransportEvent)=>{for(const fn of listeners){try{fn(e);}catch{ /* isolate listener */ }}};
  const rejectAll=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('NATIVE_CHANNEL_CLOSED'));}pending.clear();for(const fn of [...stateWaiters])fn();};
  const stop=()=>stopPromise??=(async()=>{if(state!=='failed')state='closed';removeData();removeExit();buffer=Buffer.alloc(0);rejectAll();try{await wire.stop();}catch{state='failed';throw new Error('NATIVE_STOP_UNCONFIRMED');}})();
  const fail=()=>{if(state==='closed'||state==='failed')return;state='failed';rejectAll();emit({kind:'error',error:{code:'TRANSPORT_FAILED',message:'Native channel unavailable'}});void stop().catch(()=>undefined);};
  const publishState=(value:string)=>{ if((mode==='reopen'&& !['authorizationStateWaitTdlibParameters','authorizationStateReady','authorizationStateClosing','authorizationStateClosed'].includes(value))||(wasReady && value!=='authorizationStateReady'&&!['authorizationStateClosing','authorizationStateClosed'].includes(value))){fail();return;}if(value==='authorizationStateReady')wasReady=true; if(value===authState)return;authState=value; if(stateWaiters.size){for(const fn of [...stateWaiters])fn(value);}else{authQueue.push(value);if(authQueue.length>16)fail();} };
  const receive=(chunk:Buffer)=>{
    if(state!=='running')return;
    if(chunk.length>max||buffer.length+chunk.length>max*2){fail();return;}
    buffer=Buffer.concat([buffer,chunk]);
    for(;;){const end=buffer.indexOf(10);if(end<0)break;if(end>max){fail();return;}
      const line=buffer.subarray(0,end);buffer=buffer.subarray(end+1);if(line.length===0){fail();return;}
      let raw:unknown;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(line));}catch{fail();return;}
      if(typeof raw!=='object'||raw===null||Array.isArray(raw)){fail();return;}
      const msg=raw as Record<string,unknown>,payload=msg.payload;
      if(msg.kind==='ready'&&msg.protocol===1)continue;
      if(typeof payload!=='object'||payload===null||Array.isArray(payload)||typeof (payload as Record<string,unknown>)['@type']!=='string'){fail();return;}
      const body=payload as Record<string,unknown>;
      if(msg.kind==='response'){
        if(typeof msg.id!=='string'){fail();return;}
        const p=pending.get(msg.id);if(!p){fail();return;}pending.delete(msg.id);clearTimeout(p.timer);
        if(typeof body['@type']==='string' && String(body['@type']).startsWith('authorizationState'))publishState(body['@type'] as string);
        if(body['@type']==='error'){if(p.scope==='setup')p.reject(new Error('NATIVE_REQUEST_REJECTED'));else{const code=Number.isInteger(body.code)&&Number(body.code)>=100&&Number(body.code)<=599?Number(body.code):400;p.resolve({'@type':'error',code,message:String(code)});}}else p.resolve(body);
      }else if(msg.kind==='update'){
        if(body['@type']==='updateAuthorizationState'){
          const a=body.authorization_state;
          if(typeof a!=='object'||a===null||typeof (a as Record<string,unknown>)['@type']!=='string'){fail();return;}
          publishState((a as Record<string,unknown>)['@type'] as string);
        }
        emit({kind:'update',payload:body});
      }else{fail();return;}
    }
    if(buffer.length>max)fail();
  };
  async function request(scope:'read'|'setup', method:string, params:Readonly<Record<string,unknown>>={}):Promise<Readonly<Record<string,unknown>>>{
    assertNativeRpc(scope,method,mode);
    if(scope==='setup'){const expected:Record<string,string>={setTdlibParameters:'authorizationStateWaitTdlibParameters',setAuthenticationPhoneNumber:'authorizationStateWaitPhoneNumber',checkAuthenticationCode:'authorizationStateWaitCode',checkAuthenticationPassword:'authorizationStateWaitPassword'};if(wasReady||expected[method]!==authState)throw new Error('AUTH_PHASE_REJECTED');}
    if(state!=='running')throw new Error('NATIVE_NOT_RUNNING');
    if(pending.size>=pendingMax)throw new Error('NATIVE_PENDING_LIMIT');
    const id=randomUUID(), line=JSON.stringify({kind:'request',id,scope,payload:{...params,'@type':method}})+'\n';
    if(Buffer.byteLength(line)>max)throw new Error('NATIVE_PAYLOAD_LIMIT');
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(id);reject(new Error('NATIVE_REQUEST_TIMEOUT'));fail();},timeout);
      pending.set(id,{scope,resolve,reject,timer});void wire.write(line).catch(()=>fail());
    });
  }
  const read:ITdlibTransport=Object.freeze({
    async start(){if(state!=='stopped')throw new Error('NATIVE_START_REJECTED');state='running';removeData=wire.onData(receive);removeExit=wire.onExit(fail);},
    stop,getLifecycleState:()=>state,
    async send(payload:TdlibClientPayload){
      assertNativeRpc('read',payload['@type'],mode);
      if(typeof payload['@extra']!=='string')throw new Error('NATIVE_CORRELATION_REQUIRED');
      const response=await request('read',payload['@type'],payload);emit({kind:'response',extra:payload['@extra'],payload:response});
    },
    subscribe(fn:(event:TdlibTransportEvent)=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},
  });
  const setup:SetupPort=Object.freeze({request:(method:string,params?:Readonly<Record<string,unknown>>)=>request('setup',method,params),
    waitState(signal?:AbortSignal):Promise<string>{
      const queued=authQueue.shift();if(queued)return Promise.resolve(queued);
      if(state!=='running'||stateWaiters.size) return Promise.reject(new Error('AUTH_STATE_UNAVAILABLE'));
      return new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>finish(),timeout);
        const abort=()=>finish();
        const finish=(value?:string)=>{clearTimeout(timer);stateWaiters.delete(finish);signal?.removeEventListener('abort',abort);if(value)resolve(value);else reject(new Error('AUTH_STATE_UNAVAILABLE'));};
        stateWaiters.add(finish);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)finish();
      });
    },
  });
  return Object.freeze({read,setup,stop,
    clearState(){authState=undefined;authQueue.length=0;},
  });
}
