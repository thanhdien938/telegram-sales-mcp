import type { ReadStream, WriteStream } from 'node:tty';
export type SecretKind = 'api_id' | 'api_hash' | 'phone' | 'code' | 'password' | 'consent';
export interface SecretReader {
    read(kind: SecretKind, signal?: AbortSignal): Promise<string>;
}
/** No readline fallback: redirected stdin/stdout and failure to restore raw mode are fatal. */
export declare function createTerminalSecrets(input?: ReadStream, output?: WriteStream, timeoutMs?: number): SecretReader;
