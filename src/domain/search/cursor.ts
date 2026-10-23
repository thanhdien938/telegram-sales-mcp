import { DomainError } from '../common/errors.js';

export const MAX_SEARCH_CURSOR_STRING_LENGTH = 512;
export const MAX_PROVIDER_OFFSET_LENGTH = 256;
export const SEARCH_CURSOR_VERSION = 1;

export interface ChatMessageSearchCursorPayload {
  readonly v: 1;
  readonly scope: 'chat';
  readonly chat_id: string;
  readonly query: string;
  readonly sender_user_id?: string | undefined;
  readonly filter?: string | undefined;
  readonly next_from_message_id: string;
}

export interface AccountMessageSearchCursorPayload {
  readonly v: 1;
  readonly scope: 'account';
  readonly query: string;
  readonly chat_list?: 'main' | 'archive' | 'all' | undefined;
  readonly filter?: string | undefined;
  readonly min_date?: number | undefined;
  readonly max_date?: number | undefined;
  readonly next_offset: string;
}

export type MessageSearchCursorPayload =
  ChatMessageSearchCursorPayload | AccountMessageSearchCursorPayload;

export interface PublicPostsSearchCursorPayload {
  readonly v: 1;
  readonly mode: 'posts';
  readonly query: string;
  readonly next_offset: string;
}

export interface PublicTagSearchCursorPayload {
  readonly v: 1;
  readonly mode: 'tag';
  readonly tag: string;
  readonly next_offset: string;
}

export function encodeMessageSearchCursor(
  payload: MessageSearchCursorPayload,
): string {
  const jsonStr = JSON.stringify(payload);
  return Buffer.from(jsonStr, 'utf8').toString('base64url');
}

export function decodeMessageSearchCursor(
  cursorStr: string | undefined,
  expectedScope: 'chat' | 'account',
): MessageSearchCursorPayload | null {
  if (cursorStr === undefined || cursorStr === '') {
    return null;
  }

  if (cursorStr.length > MAX_SEARCH_CURSOR_STRING_LENGTH) {
    throw new DomainError(
      'INVALID_CURSOR',
      'Search cursor exceeds maximum allowed length',
    );
  }

  let parsed: unknown;
  try {
    const jsonStr = Buffer.from(cursorStr, 'base64url').toString('utf8');
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new DomainError(
      'INVALID_CURSOR',
      'Malformed search cursor could not be decoded',
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new DomainError(
      'INVALID_CURSOR',
      'Invalid or corrupted search cursor',
    );
  }

  const record = parsed as Record<string, unknown>;

  if (record.v === undefined) {
    throw new DomainError('INVALID_CURSOR', 'Cursor version is missing');
  }
  if (record.v !== SEARCH_CURSOR_VERSION) {
    const vRepr =
      typeof record.v === 'number' || typeof record.v === 'string'
        ? String(record.v)
        : typeof record.v;
    throw new DomainError(
      'INVALID_CURSOR',
      `Unsupported cursor version: ${vRepr}`,
    );
  }

  if (record.scope !== expectedScope) {
    throw new DomainError(
      'INVALID_CURSOR',
      `Cursor scope "${String(record.scope)}" does not match requested scope "${expectedScope}"`,
    );
  }

  if (expectedScope === 'chat') {
    const allowedKeys = new Set([
      'v',
      'scope',
      'chat_id',
      'query',
      'sender_user_id',
      'filter',
      'next_from_message_id',
    ]);
    for (const key of Object.keys(record)) {
      if (!allowedKeys.has(key)) {
        throw new DomainError(
          'INVALID_CURSOR',
          `Cursor contains unrecognized field '${key}'`,
        );
      }
    }

    if (typeof record.chat_id !== 'string' || record.chat_id.length === 0) {
      throw new DomainError('INVALID_CURSOR', 'Cursor missing chat_id');
    }
    if (typeof record.query !== 'string') {
      throw new DomainError('INVALID_CURSOR', 'Cursor query must be a string');
    }
    if (
      'sender_user_id' in record &&
      record.sender_user_id !== undefined &&
      typeof record.sender_user_id !== 'string'
    ) {
      throw new DomainError(
        'INVALID_CURSOR',
        'Cursor sender_user_id must be a string',
      );
    }
    if (
      'filter' in record &&
      record.filter !== undefined &&
      typeof record.filter !== 'string'
    ) {
      throw new DomainError('INVALID_CURSOR', 'Cursor filter must be a string');
    }
    if (
      typeof record.next_from_message_id !== 'string' ||
      record.next_from_message_id.length === 0 ||
      record.next_from_message_id.length > MAX_PROVIDER_OFFSET_LENGTH
    ) {
      throw new DomainError(
        'INVALID_CURSOR',
        'Invalid or oversized next_from_message_id in cursor',
      );
    }

    return Object.freeze({
      v: 1,
      scope: 'chat',
      chat_id: record.chat_id,
      query: record.query,
      ...(record.sender_user_id !== undefined
        ? { sender_user_id: record.sender_user_id as string }
        : {}),
      ...(record.filter !== undefined
        ? { filter: record.filter as string }
        : {}),
      next_from_message_id: record.next_from_message_id,
    });
  } else {
    const allowedKeys = new Set([
      'v',
      'scope',
      'query',
      'chat_list',
      'filter',
      'min_date',
      'max_date',
      'next_offset',
    ]);
    for (const key of Object.keys(record)) {
      if (!allowedKeys.has(key)) {
        throw new DomainError(
          'INVALID_CURSOR',
          `Cursor contains unrecognized field '${key}'`,
        );
      }
    }

    if (typeof record.query !== 'string' || record.query.length === 0) {
      throw new DomainError('INVALID_CURSOR', 'Cursor missing non-empty query');
    }
    if (
      'chat_list' in record &&
      record.chat_list !== undefined &&
      record.chat_list !== 'main' &&
      record.chat_list !== 'archive' &&
      record.chat_list !== 'all'
    ) {
      throw new DomainError('INVALID_CURSOR', 'Invalid chat_list in cursor');
    }
    if (
      'filter' in record &&
      record.filter !== undefined &&
      typeof record.filter !== 'string'
    ) {
      throw new DomainError('INVALID_CURSOR', 'Cursor filter must be a string');
    }
    if (
      'min_date' in record &&
      record.min_date !== undefined &&
      (!Number.isInteger(record.min_date) || (record.min_date as number) < 0)
    ) {
      throw new DomainError(
        'INVALID_CURSOR',
        'Cursor min_date must be a non-negative integer',
      );
    }
    if (
      'max_date' in record &&
      record.max_date !== undefined &&
      (!Number.isInteger(record.max_date) || (record.max_date as number) < 0)
    ) {
      throw new DomainError(
        'INVALID_CURSOR',
        'Cursor max_date must be a non-negative integer',
      );
    }
    if (
      typeof record.next_offset !== 'string' ||
      record.next_offset.length > MAX_PROVIDER_OFFSET_LENGTH
    ) {
      throw new DomainError(
        'INVALID_CURSOR',
        'Invalid or oversized next_offset in cursor',
      );
    }

    return Object.freeze({
      v: 1,
      scope: 'account',
      query: record.query,
      ...(record.chat_list !== undefined
        ? {
            chat_list: record.chat_list as 'main' | 'archive' | 'all',
          }
        : {}),
      ...(record.filter !== undefined
        ? { filter: record.filter as string }
        : {}),
      ...(record.min_date !== undefined
        ? { min_date: record.min_date as number }
        : {}),
      ...(record.max_date !== undefined
        ? { max_date: record.max_date as number }
        : {}),
      next_offset: record.next_offset,
    });
  }
}

export function encodePublicPostsCursor(
  payload: PublicPostsSearchCursorPayload,
): string {
  const jsonStr = JSON.stringify(payload);
  return Buffer.from(jsonStr, 'utf8').toString('base64url');
}

export function decodePublicPostsCursor(
  cursorStr: string | undefined,
): PublicPostsSearchCursorPayload | null {
  if (cursorStr === undefined || cursorStr === '') {
    return null;
  }

  if (cursorStr.length > MAX_SEARCH_CURSOR_STRING_LENGTH) {
    throw new DomainError(
      'INVALID_CURSOR',
      'Posts search cursor exceeds maximum allowed length',
    );
  }

  let parsed: unknown;
  try {
    const jsonStr = Buffer.from(cursorStr, 'base64url').toString('utf8');
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new DomainError(
      'INVALID_CURSOR',
      'Malformed posts search cursor could not be decoded',
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new DomainError(
      'INVALID_CURSOR',
      'Invalid or corrupted posts search cursor',
    );
  }

  const record = parsed as Record<string, unknown>;

  if (record.v !== SEARCH_CURSOR_VERSION) {
    throw new DomainError(
      'INVALID_CURSOR',
      `Unsupported cursor version: ${String(record.v)}`,
    );
  }
  if (record.mode !== 'posts') {
    throw new DomainError('INVALID_CURSOR', 'Cursor mode must be "posts"');
  }

  const allowedKeys = new Set(['v', 'mode', 'query', 'next_offset']);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      throw new DomainError(
        'INVALID_CURSOR',
        `Cursor contains unrecognized field '${key}'`,
      );
    }
  }

  if (typeof record.query !== 'string' || record.query.length === 0) {
    throw new DomainError('INVALID_CURSOR', 'Cursor missing query');
  }
  if (
    typeof record.next_offset !== 'string' ||
    record.next_offset.length > MAX_PROVIDER_OFFSET_LENGTH
  ) {
    throw new DomainError(
      'INVALID_CURSOR',
      'Invalid or oversized next_offset in posts cursor',
    );
  }

  return Object.freeze({
    v: 1,
    mode: 'posts',
    query: record.query,
    next_offset: record.next_offset,
  });
}

/**
 * Canonicalizes tag search requests per TDLib MessageQueryManager.cpp contract:
 * - '#news' and bare 'news' canonicalize to '#news' (hashtag)
 * - '$TSLA' canonicalizes to '$TSLA' (cashtag)
 * - Bare tags are treated as hashtags, preserving Telegram semantics
 * - Unicode content is preserved without overfitting ASCII
 */
export function canonicalizeSearchTag(rawTag: unknown): string {
  if (typeof rawTag !== 'string' || rawTag.trim().length === 0) {
    throw new DomainError(
      'INVALID_ARGUMENT',
      'tag is required and cannot be empty',
    );
  }
  const trimmed = rawTag.trim();
  const isCashtag = trimmed.startsWith('$');
  const isHashtag = trimmed.startsWith('#');
  const bareTag = isCashtag || isHashtag ? trimmed.slice(1) : trimmed;

  if (bareTag.length === 0) {
    throw new DomainError(
      'INVALID_ARGUMENT',
      'tag cannot be empty after prefix',
    );
  }
  if (bareTag.length > 100) {
    throw new DomainError(
      'INVALID_ARGUMENT',
      'tag exceeds maximum length of 100 characters',
    );
  }

  return isCashtag ? `$${bareTag}` : `#${bareTag}`;
}

export function encodePublicTagCursor(
  payload: PublicTagSearchCursorPayload,
): string {
  const canonicalTag = canonicalizeSearchTag(payload.tag);
  const jsonStr = JSON.stringify({
    ...payload,
    tag: canonicalTag,
  });
  return Buffer.from(jsonStr, 'utf8').toString('base64url');
}

export function decodePublicTagCursor(
  cursorStr: string | undefined,
): PublicTagSearchCursorPayload | null {
  if (cursorStr === undefined || cursorStr === '') {
    return null;
  }

  if (cursorStr.length > MAX_SEARCH_CURSOR_STRING_LENGTH) {
    throw new DomainError(
      'INVALID_CURSOR',
      'Tag search cursor exceeds maximum allowed length',
    );
  }

  let parsed: unknown;
  try {
    const jsonStr = Buffer.from(cursorStr, 'base64url').toString('utf8');
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new DomainError(
      'INVALID_CURSOR',
      'Malformed tag search cursor could not be decoded',
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new DomainError(
      'INVALID_CURSOR',
      'Invalid or corrupted tag search cursor',
    );
  }

  const record = parsed as Record<string, unknown>;

  if (record.v !== SEARCH_CURSOR_VERSION) {
    throw new DomainError(
      'INVALID_CURSOR',
      `Unsupported cursor version: ${String(record.v)}`,
    );
  }
  if (record.mode !== 'tag') {
    throw new DomainError('INVALID_CURSOR', 'Cursor mode must be "tag"');
  }

  const allowedKeys = new Set(['v', 'mode', 'tag', 'next_offset']);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      throw new DomainError(
        'INVALID_CURSOR',
        `Cursor contains unrecognized field '${key}'`,
      );
    }
  }

  if (typeof record.tag !== 'string' || record.tag.length === 0) {
    throw new DomainError('INVALID_CURSOR', 'Cursor missing tag');
  }
  if (
    typeof record.next_offset !== 'string' ||
    record.next_offset.length > MAX_PROVIDER_OFFSET_LENGTH
  ) {
    throw new DomainError(
      'INVALID_CURSOR',
      'Invalid or oversized next_offset in tag cursor',
    );
  }

  const canonicalTag = canonicalizeSearchTag(record.tag);

  return Object.freeze({
    v: 1,
    mode: 'tag',
    tag: canonicalTag,
    next_offset: record.next_offset,
  });
}
