import { DomainError } from './errors.js';
export const MAX_CURSOR_OFFSET = 2000;
export const MAX_CURSOR_STRING_LENGTH = 512;
export const SUPPORTED_CURSOR_VERSION = 1;
export function encodePaginationCursor(data) {
    const payload = JSON.stringify({
        offset: data.offset,
        ...(data.chatList !== undefined ? { chatList: data.chatList } : {}),
        ...(data.unreadOnly !== undefined ? { unreadOnly: data.unreadOnly } : {}),
        v: data.v ?? SUPPORTED_CURSOR_VERSION,
    });
    return Buffer.from(payload, 'utf8').toString('base64url');
}
export function decodePaginationCursor(cursorStr) {
    if (cursorStr === undefined || cursorStr === '') {
        return null;
    }
    if (cursorStr.length > MAX_CURSOR_STRING_LENGTH) {
        throw new DomainError('INVALID_CURSOR', 'Pagination cursor exceeds maximum allowed length');
    }
    try {
        const jsonStr = Buffer.from(cursorStr, 'base64url').toString('utf8');
        const parsed = JSON.parse(jsonStr);
        if (typeof parsed !== 'object' ||
            parsed === null ||
            Array.isArray(parsed)) {
            throw new DomainError('INVALID_CURSOR', 'Invalid or corrupted pagination cursor');
        }
        const record = parsed;
        // 1. Version validation
        if (record.v === undefined) {
            throw new DomainError('INVALID_CURSOR', 'Cursor version is missing');
        }
        if (typeof record.v !== 'number' || record.v !== SUPPORTED_CURSOR_VERSION) {
            const vRepr = typeof record.v === 'number' || typeof record.v === 'string'
                ? String(record.v)
                : typeof record.v;
            throw new DomainError('INVALID_CURSOR', `Unsupported cursor version: ${vRepr}`);
        }
        // 2. Reject unknown keys
        const allowedKeys = new Set(['offset', 'chatList', 'unreadOnly', 'v']);
        for (const key of Object.keys(record)) {
            if (!allowedKeys.has(key)) {
                throw new DomainError('INVALID_CURSOR', `Cursor contains unrecognized field '${key}'`);
            }
        }
        // 3. Offset validation
        if (typeof record.offset !== 'number' ||
            !Number.isInteger(record.offset) ||
            record.offset < 0 ||
            record.offset > MAX_CURSOR_OFFSET) {
            throw new DomainError('INVALID_CURSOR', `Invalid or out-of-bound cursor offset: must be an integer between 0 and ${String(MAX_CURSOR_OFFSET)}`);
        }
        // 4. chatList validation: must not silently ignore invalid values
        let chatList;
        if ('chatList' in record && record.chatList !== undefined) {
            if (record.chatList !== 'main' && record.chatList !== 'archive') {
                throw new DomainError('INVALID_CURSOR', `Invalid chatList in cursor: must be 'main' or 'archive'`);
            }
            chatList = record.chatList;
        }
        // 5. unreadOnly validation: must not silently ignore invalid types
        let unreadOnly;
        if ('unreadOnly' in record && record.unreadOnly !== undefined) {
            if (typeof record.unreadOnly !== 'boolean') {
                throw new DomainError('INVALID_CURSOR', 'Invalid unreadOnly in cursor: must be a boolean');
            }
            unreadOnly = record.unreadOnly;
        }
        return Object.freeze({
            offset: record.offset,
            ...(chatList !== undefined ? { chatList } : {}),
            ...(unreadOnly !== undefined ? { unreadOnly } : {}),
            v: record.v,
        });
    }
    catch (err) {
        if (err instanceof DomainError) {
            throw err;
        }
        throw new DomainError('INVALID_CURSOR', 'Malformed pagination cursor could not be decoded');
    }
}
