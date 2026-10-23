import { StringDecoder } from 'node:string_decoder';
/** No readline fallback: redirected stdin/stdout and failure to restore raw mode are fatal. */
export function createTerminalSecrets(input = process.stdin, output = process.stderr, timeoutMs = 60000) {
    return Object.freeze({ read(kind, signal) {
            if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function')
                return Promise.reject(new Error('PRIVATE_TTY_REQUIRED'));
            return new Promise((resolve, reject) => {
                const previous = input.isRaw, wasPaused = input.isPaused();
                const decoder = new StringDecoder('utf8');
                let value = '', finished = false;
                const done = (ok) => {
                    if (finished)
                        return;
                    finished = true;
                    clearTimeout(timer);
                    input.off('data', data);
                    signal?.removeEventListener('abort', abort);
                    try {
                        input.setRawMode(previous);
                        if (wasPaused)
                            input.pause();
                        output.write('\n');
                    }
                    catch {
                        value = '';
                        reject(new Error('TERMINAL_RESTORATION_FAILED'));
                        return;
                    }
                    const result = value;
                    value = '';
                    if (ok)
                        resolve(result);
                    else
                        reject(new Error('PRIVATE_PROMPT_CANCELLED'));
                };
                const abort = () => done(false);
                const data = (chunk) => { for (const c of (typeof chunk === 'string' ? chunk : decoder.write(chunk))) {
                    if (c === '\u0003' || c === '\u0004') {
                        done(false);
                        return;
                    }
                    if (c === '\r' || c === '\n') {
                        done(true);
                        return;
                    }
                    if (c === '\b' || c === '\u007f') {
                        value = value.slice(0, -1);
                        continue;
                    }
                    if (c >= ' ' && c !== '\u007f')
                        value += c;
                    if (value.length > 4096) {
                        done(false);
                        return;
                    }
                } };
                const timer = setTimeout(() => done(false), timeoutMs);
                try {
                    input.setRawMode(true);
                    input.on('data', data);
                    signal?.addEventListener('abort', abort, { once: true });
                    output.write('Private ' + kind + ': ');
                    input.resume();
                    if (signal?.aborted)
                        done(false);
                }
                catch {
                    done(false);
                }
            });
        } });
}
