import { DomainError } from './errors.js';
const CANONICAL_DECIMAL_INT_REGEX = /^(?:0|-?[1-9]\d*)$/;
export function isValidDecimalIntegerString(value) {
    if (typeof value !== 'string') {
        return false;
    }
    if (value.length === 0 || value.length > 32) {
        return false;
    }
    return CANONICAL_DECIMAL_INT_REGEX.test(value);
}
export function parseAndValidateSafeId(value, name = 'ID') {
    if (typeof value !== 'string') {
        throw new DomainError('INVALID_ID', `${name} must be a string representation of a decimal integer`);
    }
    if (value.length === 0 || value.length > 32) {
        throw new DomainError('INVALID_ID', `${name} length must be between 1 and 32 characters`);
    }
    if (!CANONICAL_DECIMAL_INT_REGEX.test(value)) {
        throw new DomainError('INVALID_ID', `${name} must be a canonical decimal integer string without leading zeros, whitespace, or symbols`);
    }
    let bigVal;
    try {
        bigVal = BigInt(value);
    }
    catch {
        throw new DomainError('INVALID_ID', `Failed to parse ${name} as a valid integer`);
    }
    const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
    if (bigVal < minSafe || bigVal > maxSafe) {
        throw new DomainError('INVALID_ID', `${name} value "${value}" is outside safe integer range [-2^53 + 1, 2^53 - 1] and cannot be safely processed`);
    }
    const numberId = Number(bigVal);
    if (BigInt(numberId) !== bigVal) {
        throw new DomainError('INVALID_ID', `${name} value "${value}" suffered precision loss during conversion`);
    }
    return Object.freeze({
        stringId: value,
        numberId,
    });
}
export const MIN_INT32 = -2_147_483_648;
export const MAX_INT32 = 2_147_483_647;
export function parseAndValidateSafeInt32Id(value, name = 'file_id') {
    if (typeof value !== 'string') {
        throw new DomainError('INVALID_ID', `${name} must be a string representation of a decimal integer`);
    }
    if (value.length === 0 || value.length > 32) {
        throw new DomainError('INVALID_ID', `${name} length must be between 1 and 32 characters`);
    }
    if (!CANONICAL_DECIMAL_INT_REGEX.test(value)) {
        throw new DomainError('INVALID_ID', `${name} must be a canonical decimal integer string without leading zeros, whitespace, or symbols`);
    }
    let bigVal;
    try {
        bigVal = BigInt(value);
    }
    catch {
        throw new DomainError('INVALID_ID', `Failed to parse ${name} as a valid integer`);
    }
    const minInt32 = BigInt(MIN_INT32);
    const maxInt32 = BigInt(MAX_INT32);
    if (bigVal < minInt32 || bigVal > maxInt32) {
        throw new DomainError('INVALID_ID', `${name} value "${value}" is outside 32-bit signed integer range [-2^31, 2^31 - 1]`);
    }
    const numberId = Number(bigVal);
    if (BigInt(numberId) !== bigVal) {
        throw new DomainError('INVALID_ID', `${name} value "${value}" suffered precision loss during conversion`);
    }
    return Object.freeze({
        stringId: value,
        numberId,
    });
}
