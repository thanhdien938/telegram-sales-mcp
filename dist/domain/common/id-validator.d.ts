export declare function isValidDecimalIntegerString(value: unknown): value is string;
export interface ValidatedSafeId {
    readonly stringId: string;
    readonly numberId: number;
}
export declare function parseAndValidateSafeId(value: unknown, name?: string): ValidatedSafeId;
export declare const MIN_INT32 = -2147483648;
export declare const MAX_INT32 = 2147483647;
export declare function parseAndValidateSafeInt32Id(value: unknown, name?: string): ValidatedSafeId;
