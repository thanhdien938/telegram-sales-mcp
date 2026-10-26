import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { WirePort } from './native-channel.js';
import type { NativeMode } from './native-policy.js';
/** Only fixed generic wrapper and verified explicit bundle files; secrets never in argv/env. */
export function spawnNativeWire(python:string, wrapper:string, dll:string, mode:NativeMode, writesEnabled = false):WirePort {
  const args = ['-I', '-B', wrapper, '--dll', dll, '--mode', mode];
  if (writesEnabled) args.push('--enable-writes');
  const child=spawn(python,args,{stdio:'pipe',windowsHide:true,env:{SystemRoot:process.env.SystemRoot??'',PATH:process.env.PATH??''}}) as ChildProcessWithoutNullStreams;
  let stderrBytes=0, stopped:Promise<void>|undefined, ended=false;
  child.stderr.on('data',(b:Buffer)=>{stderrBytes+=b.length;if(stderrBytes>4096)child.kill();});
  child.on('error',()=>{ended=true;});child.on('exit',()=>{ended=true;});
  return Object.freeze({
    write(line:string){return new Promise<void>((resolve,reject)=>{if(ended||child.stdin.destroyed){reject(new Error('NATIVE_WRITE_REJECTED'));return;}child.stdin.write(line,e=>e?reject(new Error('NATIVE_WRITE_REJECTED')):resolve());});},
    onData(fn:(b:Buffer)=>void){child.stdout.on('data',fn);return()=>{child.stdout.off('data',fn);};},
    onExit(fn:()=>void){if(ended)queueMicrotask(fn);child.on('exit',fn);child.on('error',fn);return()=>{child.off('exit',fn);child.off('error',fn);};},
    stop(){return stopped??=new Promise<void>((resolve,reject)=>{
      if(ended){resolve();return;}let final:ReturnType<typeof setTimeout>|undefined;
      const timer=setTimeout(()=>{child.kill();final=setTimeout(()=>reject(new Error('NATIVE_STOP_UNCONFIRMED')),2000);},2000);
      child.once('exit',()=>{clearTimeout(timer);if(final)clearTimeout(final);resolve();});child.stdin.end();
    });},
  });
}
