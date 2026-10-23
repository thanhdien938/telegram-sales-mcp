export declare const MAX_CURSOR_OFFSET = 2000;
export declare const MAX_CURSOR_STRING_LENGTH = 512;
export declare const SUPPORTED_CURSOR_VERSION = 1;
export interface PaginationCursorData {
    readonly offset: number;
    readonly chatList?: 'main' | 'archive' | undefined;
    readonly unreadOnly?: boolean | undefined;
    readonly v: number;
}
export declare function encodePaginationCursor(data: {
    readonly offset: number;
    readonly chatList?: 'main' | 'archive' | undefined;
    readonly unreadOnly?: boolean | undefined;
    readonly v?: number | undefined;
}): string;
export declare function decodePaginationCursor(cursorStr: string | undefined): PaginationCursorData | null;
