import { loginPortable, parsePortableOptions } from './runtime/portable-provider.js';
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--help')process.stdout.write('Private Windows login: --state ABSOLUTE_ABSENT_ROOT --native-manifest ABSOLUTE_REVIEWED_MANIFEST --python ABSOLUTE_PYTHON. Native build currently HOLD; no actual login qualified.\n');
else{
  const abort=new AbortController();const interrupt=()=>abort.abort();const timer=setTimeout(interrupt,180000);
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  try{if(!process.stdin.isTTY||!process.stderr.isTTY)throw new Error('PRIVATE_TTY_REQUIRED');await loginPortable(parsePortableOptions(args),abort.signal);process.stdout.write('PRIVATE_SETUP_COMPLETE\n');}
  catch{process.stderr.write('PRIVATE_LOGIN_UNAVAILABLE_NATIVE_BUILD_OR_SETUP_HOLD\n');process.exitCode=1;}
  finally{clearTimeout(timer);process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);}
}
