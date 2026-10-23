import type { ITdlibAdapter } from '../../telegram/tdlib/adapter.js';
import { type AccountRuntimeHealth, type AccountSnapshot, type ReauthStateReport } from './types.js';
export declare class AccountService {
    private readonly adapter;
    private isStarted;
    private isClosed;
    private cachedIdentity;
    constructor(adapter: ITdlibAdapter);
    start(): Promise<void>;
    stop(): Promise<void>;
    getAccountSnapshot(): Promise<AccountSnapshot>;
    getReauthState(): ReauthStateReport;
    getRuntimeHealth(): AccountRuntimeHealth;
    private assertOperational;
}
