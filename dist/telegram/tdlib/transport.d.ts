import type { TdlibClientPayload, TdlibTransportEvent, TdlibTransportLifecycleState } from './types.js';
export interface ITdlibTransport {
    start(): Promise<void>;
    stop(): Promise<void>;
    getLifecycleState(): TdlibTransportLifecycleState;
    send(payload: TdlibClientPayload): Promise<void>;
    subscribe(listener: (event: TdlibTransportEvent) => void): () => void;
}
export type TdlibTransportFactory = () => ITdlibTransport;
