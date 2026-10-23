export declare class PublicWriteDisabledError extends Error {
    readonly code = "PUBLIC_TELEGRAM_WRITES_DISABLED";
    constructor();
}
export declare function denyTelegramWrite(): void;
export declare function assertReadRpc(method: unknown): void;
