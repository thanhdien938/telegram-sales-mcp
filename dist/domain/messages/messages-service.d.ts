import type { ITdlibAdapter } from '../../telegram/tdlib/adapter.js';
import type { MessagesContextOptions, MessagesContextResult, MessagesHistoryOptions, MessagesHistoryResult, NormalizedMessage } from './types.js';
export declare function normalizeMessage(rawMsg: Readonly<Record<string, unknown>>): NormalizedMessage;
export declare class MessagesService {
    private readonly adapter;
    constructor(adapter: ITdlibAdapter);
    getHistory(options: MessagesHistoryOptions): Promise<MessagesHistoryResult>;
    getContext(options: MessagesContextOptions): Promise<MessagesContextResult>;
    getMessage(chatId: string, messageId: string): Promise<NormalizedMessage>;
}
