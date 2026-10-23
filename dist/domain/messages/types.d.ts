export type NormalizedContentType = 'text' | 'photo' | 'video' | 'document' | 'voice' | 'audio' | 'animation' | 'sticker' | 'contact' | 'location' | 'unsupported';
export interface NormalizedMessageSender {
    readonly type: 'user' | 'chat' | 'unknown';
    readonly id: string | null;
}
export interface NormalizedFileDescriptor {
    readonly file_id: string;
    readonly size: number;
    readonly expected_size: number;
    readonly mime_type: string | null;
    readonly file_name: string | null;
    readonly is_downloaded: boolean;
}
export interface NormalizedReplyReference {
    readonly chat_id: string;
    readonly message_id: string;
}
export interface NormalizedMessage {
    readonly chat_id: string;
    readonly message_id: string;
    readonly date: number;
    readonly edit_date: number;
    readonly outgoing: boolean;
    readonly sender: NormalizedMessageSender;
    readonly content_type: NormalizedContentType;
    readonly text: string | null;
    readonly caption: string | null;
    readonly reply_to: NormalizedReplyReference | null;
    readonly file: NormalizedFileDescriptor | null;
    readonly unsupported_type?: string | null | undefined;
}
export interface MessagesHistoryOptions {
    readonly chatId: string;
    readonly limit?: number | undefined;
    readonly fromMessageId?: string | undefined;
    readonly offset?: number | undefined;
}
export interface MessagesHistoryResult {
    readonly mode: 'history';
    readonly chat_id: string;
    readonly messages: readonly NormalizedMessage[];
    readonly total_count: number;
    readonly order: 'chronological';
    readonly next_from_message_id: string | null;
}
export interface MessagesContextOptions {
    readonly chatId: string;
    readonly messageId: string;
    readonly before?: number | undefined;
    readonly after?: number | undefined;
}
export interface MessagesContextResult {
    readonly mode: 'context';
    readonly chat_id: string;
    readonly anchor_message_id: string;
    readonly messages: readonly NormalizedMessage[];
    readonly before_count: number;
    readonly after_count: number;
    readonly total_count: number;
    readonly order: 'chronological';
}
