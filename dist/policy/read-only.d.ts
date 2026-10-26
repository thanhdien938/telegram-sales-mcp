export declare const READ_RPC: Set<string>;
export declare const WRITE_RPC: Set<string>;
export declare class PublicWriteDisabledError extends Error {
    readonly code = "PUBLIC_TELEGRAM_WRITES_DISABLED";
    constructor(message?: string);
}
export declare function denyTelegramWrite(): void;
export declare function assertReadRpc(method: unknown): void;
export declare function assertRpcAllowed(method: unknown, writesEnabled?: boolean): void;
export declare function isWriteRpc(method: unknown): boolean;
