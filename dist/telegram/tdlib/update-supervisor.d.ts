import { type TdlibAuthorizationState } from './types.js';
export interface UpdateSupervisorMetrics {
    readonly isRunning: boolean;
    readonly currentAuthorizationState: TdlibAuthorizationState | null;
    readonly updateCount: number;
    readonly unknownUpdateCount: number;
    readonly lastUpdateAt: number | null;
}
export declare class UpdateSupervisor {
    private isRunning;
    private currentAuthorizationState;
    private updateCount;
    private unknownUpdateCount;
    private lastUpdateAt;
    private readonly listeners;
    start(): void;
    stop(): void;
    handleUpdate(payload: Readonly<Record<string, unknown>>): void;
    getCurrentAuthorizationState(): TdlibAuthorizationState | null;
    subscribeAuthorizationState(listener: (state: TdlibAuthorizationState) => void): () => void;
    getMetrics(): UpdateSupervisorMetrics;
}
