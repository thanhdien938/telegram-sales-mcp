import type { TdlibSanitizedError, TdlibSanitizedErrorCode } from './types.js';
export declare function sanitizeTdlibErrorMessage(code?: unknown, rawMessage?: unknown): string;
export declare class TdlibError extends Error implements TdlibSanitizedError {
    readonly code: TdlibSanitizedErrorCode;
    readonly details: string | null;
    constructor(code: TdlibSanitizedErrorCode, message: string, details?: string | null);
    toJSON(): TdlibSanitizedError;
}
