import type { ITdlibAdapter } from '../../telegram/tdlib/adapter.js';
import type { ChatsListResult, InboxOptions, InboxResult, ListChatsOptions, NormalizedChatSummary, NormalizedChatType, NormalizedLastMessage } from './types.js';
export declare function normalizeChatType(typeObj: unknown): NormalizedChatType;
export declare function normalizeLastMessage(msgObj: unknown): NormalizedLastMessage | null;
export declare function extractCanSendMessages(permissions: unknown): boolean | null;
export declare function normalizeChatSummary(rawChat: Readonly<Record<string, unknown>>): NormalizedChatSummary;
export declare class ChatsService {
    private readonly adapter;
    constructor(adapter: ITdlibAdapter);
    /**
     * Loads chats from TDLib into local state until at least targetCount chats
     * are known or until TDLib reports all chats are loaded (404 end-of-list).
     * Enforces a hard work bound (MAX_LOAD_CYCLES) to prevent unbounded loops/network.
     * Throws PAGINATION_INCOMPLETE if progress stalls or work bound is exhausted
     * before targetCount is satisfied and endOfList is false.
     */
    private ensureChatsLoaded;
    /**
     * Performs an explicit, bounded probe to determine if the provider has reached
     * end-of-list when the loaded prefix reaches MAX_CURSOR_OFFSET (2000 chats).
     * Distinguishes exact 2000 chats (truthful EOF) from >2000 chats (PAGINATION_LIMIT_EXCEEDED).
     */
    private probeBoundaryEndOfList;
    /**
     * Lists recent chats with bounded pagination and normalized summaries.
     * Note on Ordering: Chat ordering follows TDLib getChats beginning-order for the current
     * loaded state (sorted by chat.position.order, chat.id in descending order). Chat order
     * can naturally change between calls due to Telegram updates received in the background.
     */
    listChats(options?: ListChatsOptions): Promise<ChatsListResult>;
    getChat(chatId: string): Promise<NormalizedChatSummary>;
    /**
     * Returns a read-only projection of conversations for sales/care inbox attention.
     * Uses a bounded, progress-safe raw scan window across TDLib's chat list.
     * Note on Ordering: Chat order follows TDLib beginning-order for loaded state and may
     * shift as new messages or updates arrive from Telegram.
     */
    getInbox(options?: InboxOptions): Promise<InboxResult>;
}
