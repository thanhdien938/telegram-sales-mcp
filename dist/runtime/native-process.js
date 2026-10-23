import { spawn } from 'node:child_process';
/** Only fixed generic wrapper and verified explicit bundle files; secrets never in argv/env. */
export function spawnNativeWire(python, wrapper, dll, mode) {
    const child = spawn(python, ['-I', '-B', wrapper, '--dll', dll, '--mode', mode], { stdio: 'pipe', windowsHide: true, env: { SystemRoot: process.env.SystemRoot ?? '', PATH: process.env.PATH ?? '' } });
    let stderrBytes = 0, stopped, ended = false;
    child.stderr.on('data', (b) => { stderrBytes += b.length; if (stderrBytes > 4096)
        child.kill(); });
    child.on('error', () => { ended = true; });
    child.on('exit', () => { ended = true; });
    return Object.freeze({
        write(line) { return new Promise((resolve, reject) => { if (ended || child.stdin.destroyed) {
            reject(new Error('NATIVE_WRITE_REJECTED'));
            return;
        } child.stdin.write(line, e => e ? reject(new Error('NATIVE_WRITE_REJECTED')) : resolve()); }); },
        onData(fn) { child.stdout.on('data', fn); return () => { child.stdout.off('data', fn); }; },
        onExit(fn) { if (ended)
            queueMicrotask(fn); child.on('exit', fn); child.on('error', fn); return () => { child.off('exit', fn); child.off('error', fn); }; },
        stop() {
            return stopped ??= new Promise((resolve, reject) => {
                if (ended) {
                    resolve();
                    return;
                }
                let final;
                const timer = setTimeout(() => { child.kill(); final = setTimeout(() => reject(new Error('NATIVE_STOP_UNCONFIRMED')), 2000); }, 2000);
                child.once('exit', () => { clearTimeout(timer); if (final)
                    clearTimeout(final); resolve(); });
                child.stdin.end();
            });
        },
    });
}
