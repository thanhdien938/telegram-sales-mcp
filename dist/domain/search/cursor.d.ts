export declare const MAX_SEARCH_CURSOR_STRING_LENGTH = 512;
export declare const MAX_PROVIDER_OFFSET_LENGTH = 256;
export declare const SEARCH_CURSOR_VERSION = 1;
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
export type MessageSearchCursorPayload = ChatMessageSearchCursorPayload | AccountMessageSearchCursorPayload;
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
export declare function encodeMessageSearchCursor(payload: MessageSearchCursorPayload): string;
export declare function decodeMessageSearchCursor(cursorStr: string | undefined, expectedScope: 'chat' | 'account'): MessageSearchCursorPayload | null;
export declare function encodePublicPostsCursor(payload: PublicPostsSearchCursorPayload): string;
export declare function decodePublicPostsCursor(cursorStr: string | undefined): PublicPostsSearchCursorPayload | null;
/**
 * Canonicalizes tag search requests per TDLib MessageQueryManager.cpp contract:
 * - '#news' and bare 'news' canonicalize to '#news' (hashtag)
 * - '$TSLA' canonicalizes to '$TSLA' (cashtag)
 * - Bare tags are treated as hashtags, preserving Telegram semantics
 * - Unicode content is preserved without overfitting ASCII
 */
export declare function canonicalizeSearchTag(rawTag: unknown): string;
export declare function encodePublicTagCursor(payload: PublicTagSearchCursorPayload): string;
export declare function decodePublicTagCursor(cursorStr: string | undefined): PublicTagSearchCursorPayload | null;
