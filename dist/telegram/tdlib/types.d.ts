export declare const TDLIB_AUTH_STATES: readonly ["authorizationStateWaitTdlibParameters", "authorizationStateWaitPhoneNumber", "authorizationStateWaitEmailAddress", "authorizationStateWaitEmailCode", "authorizationStateWaitCode", "authorizationStateWaitOtherDeviceConfirmation", "authorizationStateWaitRegistration", "authorizationStateWaitPassword", "authorizationStateReady", "authorizationStateLoggingOut", "authorizationStateClosing", "authorizationStateClosed"];
export type TdlibAuthorizationState = (typeof TDLIB_AUTH_STATES)[number];
export declare function isTdlibAuthorizationState(value: unknown): value is TdlibAuthorizationState;
export type TdlibTransportLifecycleState = 'stopped' | 'starting' | 'running' | 'stopping' | 'closed' | 'failed';
export type TdlibSanitizedErrorCode = 'TRANSPORT_NOT_STARTED' | 'TRANSPORT_STOPPED' | 'TRANSPORT_FAILED' | 'REQUEST_TIMEOUT' | 'REQUEST_CANCELLED' | 'PENDING_REQUEST_OVERFLOW' | 'ACCOUNT_NOT_READY' | 'IDENTITY_UNAVAILABLE' | 'TDLIB_ERROR' | 'INVALID_RESPONSE' | 'LIFECYCLE_ERROR' | 'RUNTIME_INTEGRITY_MISMATCH' | 'CONFIG_ERROR' | 'DPAPI_ERROR' | 'AUTH_ACTION_FORBIDDEN' | 'NOT_FOUND' | 'INVALID_ARGUMENT';
export interface TdlibSanitizedError {
    readonly code: TdlibSanitizedErrorCode;
    readonly message: string;
    readonly details?: string | null;
}
export type SafeErrorType = 'NONE' | 'TIMEOUT' | 'TRANSPORT_ERROR' | 'OVERFLOW' | 'UNAUTHORIZED' | 'INTERNAL_ERROR';
export interface SafeAccountIdentity {
    readonly own_identity_read: boolean;
    readonly user_object_type: 'user' | 'unknown';
    readonly user_id_present: boolean;
    readonly is_bot: boolean | null;
}
export type TdlibTransportEvent = {
    readonly kind: 'update';
    readonly payload: Readonly<Record<string, unknown>>;
} | {
    readonly kind: 'response';
    readonly extra: string;
    readonly payload: Readonly<Record<string, unknown>>;
} | {
    readonly kind: 'lifecycle';
    readonly state: TdlibTransportLifecycleState;
    readonly error?: TdlibSanitizedError | null | undefined;
} | {
    readonly kind: 'error';
    readonly error: TdlibSanitizedError;
};
export interface TdlibClientPayload {
    readonly '@type': string;
    readonly '@extra'?: string;
    readonly [key: string]: unknown;
}
export interface RequestCorrelationMetadata {
    readonly extra: string;
    readonly requestType: string;
    readonly createdAt: number;
}
export declare function parseSafeAccountIdentity(response: unknown): SafeAccountIdentity;
export interface TdlibLoadChatsParams {
    readonly chatList?: 'main' | 'archive' | undefined;
    readonly limit: number;
}
export interface TdlibLoadChatsResult {
    readonly all_chats_loaded: boolean;
    readonly end_of_list: boolean;
}
export interface TdlibGetChatsParams {
    readonly chatList?: 'main' | 'archive' | undefined;
    readonly limit: number;
}
export interface TdlibChatsRaw {
    readonly total_count: number;
    readonly chat_ids: readonly (number | string)[];
}
export interface TdlibGetChatHistoryParams {
    readonly chatId: number;
    readonly fromMessageId?: number | undefined;
    readonly offset?: number | undefined;
    readonly limit: number;
    readonly onlyLocal?: boolean | undefined;
}
export interface TdlibMessagesRaw {
    readonly total_count: number;
    readonly messages: readonly Readonly<Record<string, unknown>>[];
}
export interface TdlibGetMessageParams {
    readonly chatId: number;
    readonly messageId: number;
}
export interface TdlibSearchChatMessagesParams {
    readonly chatId: number;
    readonly query?: string | undefined;
    readonly senderId?: Readonly<Record<string, unknown>> | undefined;
    readonly fromMessageId?: number | undefined;
    readonly offset?: number | undefined;
    readonly limit: number;
    readonly filter?: Readonly<Record<string, unknown>> | null | undefined;
}
export interface TdlibFoundChatMessagesRaw {
    readonly total_count: number;
    readonly messages: readonly Readonly<Record<string, unknown>>[];
    readonly next_from_message_id: number | string;
}
export interface TdlibSearchMessagesParams {
    readonly chatList?: 'main' | 'archive' | null | undefined;
    readonly query: string;
    readonly offset?: string | undefined;
    readonly limit: number;
    readonly filter?: Readonly<Record<string, unknown>> | null | undefined;
    readonly minDate?: number | undefined;
    readonly maxDate?: number | undefined;
}
export interface TdlibFoundMessagesRaw {
    readonly total_count: number;
    readonly messages: readonly Readonly<Record<string, unknown>>[];
    readonly next_offset: string;
}
export interface TdlibSearchPublicPostsParams {
    readonly query: string;
    readonly offset?: string | undefined;
    readonly limit: number;
}
export interface TdlibFoundPublicPostsRaw {
    readonly messages: readonly Readonly<Record<string, unknown>>[];
    readonly next_offset: string;
    readonly are_limits_exceeded: boolean;
}
export interface TdlibSearchPublicMessagesByTagParams {
    readonly tag: string;
    readonly offset?: string | undefined;
    readonly limit: number;
}
export interface TdlibSearchContactsParams {
    readonly query: string;
    readonly limit: number;
}
export interface TdlibUsersRaw {
    readonly total_count: number;
    readonly user_ids: readonly (number | string)[];
}
export interface TdlibDownloadFileParams {
    readonly fileId: number;
    readonly priority?: number | undefined;
    readonly offset?: number | undefined;
    readonly limit?: number | undefined;
    readonly synchronous?: boolean | undefined;
}
