import type { ITdlibTransport } from '../telegram/tdlib/transport.js';
import { type NativeMode } from './native-policy.js';
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
export declare function createNativeChannel(wire: WirePort, mode: NativeMode, limits?: {
    timeoutMs?: number;
    maxBytes?: number;
    maxPending?: number;
}): Readonly<{
    read: ITdlibTransport;
    setup: SetupPort;
    stop: () => Promise<void>;
    clearState(): void;
}>;
