import type { ITdlibTransport } from './transport.js';
import { type SafeAccountIdentity, type SafeErrorType, type TdlibAuthorizationState, type TdlibChatsRaw, type TdlibDownloadFileParams, type TdlibFoundChatMessagesRaw, type TdlibFoundMessagesRaw, type TdlibFoundPublicPostsRaw, type TdlibGetChatHistoryParams, type TdlibGetChatsParams, type TdlibGetMessageParams, type TdlibLoadChatsParams, type TdlibLoadChatsResult, type TdlibMessagesRaw, type TdlibSearchChatMessagesParams, type TdlibSearchContactsParams, type TdlibSearchMessagesParams, type TdlibSearchPublicMessagesByTagParams, type TdlibSearchPublicPostsParams, type TdlibTransportLifecycleState, type TdlibUsersRaw } from './types.js';
import type { ApprovedMediaDescriptor } from '../../domain/messaging-write/approved-media-registry.js';
export declare const MAX_CHATS_FETCH_LIMIT = 2000;
export declare const MAX_SUPERGROUP_MEMBERS_PAGE_LIMIT = 50;
export declare const MAX_SUPERGROUP_MEMBERS_OFFSET = 10000;
/** Narrow P6B read-only group/channel surface; deliberately separate from ITdlibAdapter. */
export interface ITdlibGroupReadAdapter {
    getChat(chatId: number): Promise<Readonly<Record<string, unknown>>>;
    getSupergroup(supergroupId: number): Promise<Readonly<Record<string, unknown>>>;
    getSupergroupFullInfo(supergroupId: number): Promise<Readonly<Record<string, unknown>>>;
    getChatMember(params: {
        chatId: number;
        userId: number;
    }): Promise<Readonly<Record<string, unknown>>>;
    getSupergroupMembers(params: {
        supergroupId: number;
        offset: number;
        limit: number;
    }): Promise<Readonly<Record<string, unknown>>>;
}
export interface TdlibAdapterOptions {
    readonly transport: ITdlibTransport;
    readonly requestTimeoutMs?: number;
    readonly maxPendingRequests?: number;
}
export interface TdlibAdapterHealth {
    readonly transport_status: TdlibTransportLifecycleState;
    readonly authorization_state: TdlibAuthorizationState | 'unknown';
    readonly update_supervisor_running: boolean;
    readonly pending_request_count: number;
    readonly update_count: number;
    readonly last_error_type: SafeErrorType | null;
}
export interface ITdlibAdapter {
    start(): Promise<void>;
    stop(): Promise<void>;
    getAuthorizationState(options?: {
        refresh?: boolean;
    }): Promise<TdlibAuthorizationState>;
    getOwnAccountIdentity(): Promise<SafeAccountIdentity>;
    subscribeAuthorizationState(listener: (state: TdlibAuthorizationState) => void): () => void;
    getRuntimeHealth(): TdlibAdapterHealth;
    loadChats(params: TdlibLoadChatsParams): Promise<TdlibLoadChatsResult>;
    getChats(params: TdlibGetChatsParams): Promise<TdlibChatsRaw>;
    getChat(chatId: number): Promise<Readonly<Record<string, unknown>>>;
    getChatHistory(params: TdlibGetChatHistoryParams): Promise<TdlibMessagesRaw>;
    getMessage(params: TdlibGetMessageParams): Promise<Readonly<Record<string, unknown>>>;
    searchChatMessages(params: TdlibSearchChatMessagesParams): Promise<TdlibFoundChatMessagesRaw>;
    searchMessages(params: TdlibSearchMessagesParams): Promise<TdlibFoundMessagesRaw>;
    searchPublicChat(username: string): Promise<Readonly<Record<string, unknown>>>;
    searchPublicChats(params: {
        query: string;
    }): Promise<TdlibChatsRaw>;
    searchPublicPosts(params: TdlibSearchPublicPostsParams): Promise<TdlibFoundPublicPostsRaw>;
    searchPublicMessagesByTag(params: TdlibSearchPublicMessagesByTagParams): Promise<TdlibFoundMessagesRaw>;
    searchContacts(params: TdlibSearchContactsParams): Promise<TdlibUsersRaw>;
    getUser(userId: number): Promise<Readonly<Record<string, unknown>>>;
    getFile(fileId: number): Promise<Readonly<Record<string, unknown>>>;
    downloadFile(params: TdlibDownloadFileParams): Promise<Readonly<Record<string, unknown>>>;
    sendText(params: {
        chatId: number;
        text: string;
        replyMessageId?: number;
    }): Promise<{
        messageId: string;
    }>;
    sendControlled(params: {
        chatId: number;
        text?: string;
        media?: ApprovedMediaDescriptor;
        caption?: string;
        sendAt?: number;
    }): Promise<{
        messageId: string;
    }>;
    editText(params: {
        chatId: number;
        messageId: number;
        text: string;
    }): Promise<{
        messageId: string;
    }>;
    deleteMessage(params: {
        chatId: number;
        messageId: number;
        revoke: boolean;
    }): Promise<{
        messageId: string;
    }>;
    forwardMessage(params: {
        targetChatId: number;
        sourceChatId: number;
        messageId: number;
    }): Promise<{
        messageId: string;
    }>;
    addEmojiReaction(params: {
        chatId: number;
        messageId: number;
        emoji: string;
    }): Promise<{
        messageId: string;
    }>;
    removeEmojiReaction(params: {
        chatId: number;
        messageId: number;
        emoji: string;
    }): Promise<{
        messageId: string;
    }>;
    pinMessage(params: {
        chatId: number;
        messageId: number;
        disableNotification: boolean;
        onlyForSelf: boolean;
    }): Promise<{
        messageId: string;
    }>;
    unpinMessage(params: {
        chatId: number;
        messageId: number;
    }): Promise<{
        messageId: string;
    }>;
    markMessageRead(params: {
        chatId: number;
        messageId: number;
    }): Promise<{
        messageId: string;
    }>;
}
export declare class TdlibWriteError extends Error {
    readonly kind: 'REJECTED' | 'UNCERTAIN' | 'PRE_DISPATCH';
    constructor(kind: 'REJECTED' | 'UNCERTAIN' | 'PRE_DISPATCH');
}
type PrivateReadyIdentity = Readonly<{
    kind: 'regular-user';
    id: string;
}>;
/** Explicit local-owner import only; deliberately absent from the public adapter interface. */
export declare function bindLocalOwnerPrivateIdentity(adapter: TdlibAdapter): {
    readReadyRegularUser(): Promise<PrivateReadyIdentity>;
};
export declare class TdlibAdapter implements ITdlibAdapter {
    #private;
    private readonly transport;
    sendControlled(params: {
        chatId: number;
        text?: string;
        media?: ApprovedMediaDescriptor;
        caption?: string;
        sendAt?: number;
    }): Promise<{
        messageId: string;
    }>;
    private schedulingStateMatches;
    private readonly requestTimeoutMs;
    private readonly maxPendingRequests;
    private readonly updateSupervisor;
    private lifecycleState;
    private unsubscribeTransport;
    private readonly pendingRequests;
    private requestSeq;
    private lastErrorType;
    private queriedAuthorizationState;
    private privateIdentityEpoch;
    private dispatchMutation;
    private assertMutationIds;
    private confirmedOkMutation;
    private assertEmoji;
    addEmojiReaction(params: {
        chatId: number;
        messageId: number;
        emoji: string;
    }): Promise<{
        messageId: string;
    }>;
    removeEmojiReaction(params: {
        chatId: number;
        messageId: number;
        emoji: string;
    }): Promise<{
        messageId: string;
    }>;
    pinMessage(params: {
        chatId: number;
        messageId: number;
        disableNotification: boolean;
        onlyForSelf: boolean;
    }): Promise<{
        messageId: string;
    }>;
    unpinMessage(params: {
        chatId: number;
        messageId: number;
    }): Promise<{
        messageId: string;
    }>;
    markMessageRead(params: {
        chatId: number;
        messageId: number;
    }): Promise<{
        messageId: string;
    }>;
    private isReadableMessage;
    private parseLastReadInbox;
    private confirmedMessage;
    editText(params: {
        chatId: number;
        messageId: number;
        text: string;
    }): Promise<{
        messageId: string;
    }>;
    deleteMessage(params: {
        chatId: number;
        messageId: number;
        revoke: boolean;
    }): Promise<{
        messageId: string;
    }>;
    private isExactMessage;
    forwardMessage(params: {
        targetChatId: number;
        sourceChatId: number;
        messageId: number;
    }): Promise<{
        messageId: string;
    }>;
    sendText(params: {
        chatId: number;
        text: string;
        replyMessageId?: number;
    }): Promise<{
        messageId: string;
    }>;
    private confirmSend;
    constructor(options: TdlibAdapterOptions);
    start(): Promise<void>;
    stop(): Promise<void>;
    getAuthorizationState(options?: {
        refresh?: boolean;
    }): Promise<TdlibAuthorizationState>;
    getOwnAccountIdentity(): Promise<SafeAccountIdentity>;
    subscribeAuthorizationState(listener: (state: TdlibAuthorizationState) => void): () => void;
    getRuntimeHealth(): TdlibAdapterHealth;
    loadChats(params: TdlibLoadChatsParams): Promise<TdlibLoadChatsResult>;
    getChats(params: TdlibGetChatsParams): Promise<TdlibChatsRaw>;
    getChat(chatId: number): Promise<Readonly<Record<string, unknown>>>;
    getChatHistory(params: TdlibGetChatHistoryParams): Promise<TdlibMessagesRaw>;
    getMessage(params: TdlibGetMessageParams): Promise<Readonly<Record<string, unknown>>>;
    searchChatMessages(params: TdlibSearchChatMessagesParams): Promise<TdlibFoundChatMessagesRaw>;
    searchMessages(params: TdlibSearchMessagesParams): Promise<TdlibFoundMessagesRaw>;
    searchPublicChat(username: string): Promise<Readonly<Record<string, unknown>>>;
    searchPublicChats(params: {
        query: string;
    }): Promise<TdlibChatsRaw>;
    searchPublicPosts(params: TdlibSearchPublicPostsParams): Promise<TdlibFoundPublicPostsRaw>;
    searchPublicMessagesByTag(params: TdlibSearchPublicMessagesByTagParams): Promise<TdlibFoundMessagesRaw>;
    searchContacts(params: TdlibSearchContactsParams): Promise<TdlibUsersRaw>;
    getUser(userId: number): Promise<Readonly<Record<string, unknown>>>;
    getSupergroup(supergroupId: number): Promise<Readonly<Record<string, unknown>>>;
    getSupergroupFullInfo(supergroupId: number): Promise<Readonly<Record<string, unknown>>>;
    getChatMember(params: {
        chatId: number;
        userId: number;
    }): Promise<Readonly<Record<string, unknown>>>;
    getSupergroupMembers(params: {
        supergroupId: number;
        offset: number;
        limit: number;
    }): Promise<Readonly<Record<string, unknown>>>;
    private assertPositiveSafeInt;
    private readRequestOnce;
    getFile(fileId: number): Promise<Readonly<Record<string, unknown>>>;
    downloadFile(params: TdlibDownloadFileParams): Promise<Readonly<Record<string, unknown>>>;
    private assertReadyForReads;
    private assertOperational;
    private getAdapterLifecycleState;
    private unsubscribeFromTransport;
    private generateCorrelationId;
    private sendInternalRequest;
    private handleTransportEvent;
    private cleanupPendingRequests;
    private extractAuthorizationState;
}
export {};
