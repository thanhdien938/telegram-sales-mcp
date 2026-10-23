export type NormalizedChatType = 'private' | 'basic_group' | 'supergroup' | 'channel' | 'secret' | 'unknown';
export interface NormalizedLastMessage {
    readonly message_id: string;
    readonly date: number;
    readonly outgoing: boolean;
    readonly sender_type: 'user' | 'chat' | 'unknown';
    readonly sender_id: string | null;
    readonly content_type: string;
    readonly text_preview: string;
}
export interface NormalizedChatSummary {
    readonly chat_id: string;
    readonly title: string;
    readonly chat_type: NormalizedChatType;
    readonly unread_count: number;
    readonly unread_mention_count: number;
    readonly unread_reaction_count: number;
    readonly has_protected_content: boolean;
    readonly is_marked_as_unread: boolean;
    readonly can_send_messages: boolean | null;
    readonly can_read_history: boolean | null;
    readonly last_message: NormalizedLastMessage | null;
}
export interface ListChatsOptions {
    readonly limit?: number | undefined;
    readonly cursor?: string | undefined;
    readonly chatList?: 'main' | 'archive' | undefined;
}
export interface ChatsListResult {
    readonly chats: readonly NormalizedChatSummary[];
    readonly next_cursor: string | null;
    readonly total_count: number;
}
export interface InboxOptions {
    readonly limit?: number | undefined;
    readonly cursor?: string | undefined;
    readonly unreadOnly?: boolean | undefined;
}
export interface InboxResult {
    readonly conversations: readonly NormalizedChatSummary[];
    readonly returned_count: number;
    readonly unread_in_scan: number;
    readonly raw_scanned_count: number;
    readonly next_cursor: string | null;
}
