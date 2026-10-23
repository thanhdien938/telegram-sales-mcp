import { NATIVE_BUILD_STATUS } from '../runtime/native-policy.js';
import { z } from 'zod';
import { DomainError, MESSAGE_SEARCH_FILTERS, } from '../domain/index.js';
export const P2_HEALTH_RESPONSE = Object.freeze({
    ok: true,
    service: 'unofficial-telegram-sales-mcp',
    phase: 'PUBLIC_SOURCE_BETA',
    native_build_status: NATIVE_BUILD_STATUS,
    mcp_transport_status: 'READY',
    telegram_provider_status: 'NOT_CONFIGURED',
    bot_provider_status: 'NOT_CONFIGURED',
    write_capabilities_enabled: false,
});
export const P2_CAPABILITIES_RESPONSE = Object.freeze({
    mcp_foundation: true,
    native_build_status: NATIVE_BUILD_STATUS,
    streamable_http: false,
    telegram_user_runtime: false,
    authenticated_account: false,
    telegram_reads: false,
    telegram_writes: false,
    bot_api: false,
    telegram_business: false,
    sales_local: false,
    integrations: false,
    write_classes_enabled: Object.freeze([]),
    next_phase: 'NATIVE_LOGIN_NOT_QUALIFIED',
});
export const emptyBoundedInputSchema = z.object({}).strict();
export const P2_TOOL_NAMES = Object.freeze([
    'telegram_health',
    'telegram_capabilities',
]);
export const P3_TOOL_NAMES = Object.freeze([
    'telegram_health',
    'telegram_capabilities',
    'telegram_account',
]);
export const P4A_TOOL_NAMES = Object.freeze([
    'telegram_health',
    'telegram_capabilities',
    'telegram_account',
    'telegram_chats_list',
    'telegram_chat_get',
    'telegram_inbox',
    'telegram_messages_get',
]);
export const P4B_TOOL_NAMES = Object.freeze([
    'telegram_health',
    'telegram_capabilities',
    'telegram_account',
    'telegram_chats_list',
    'telegram_chat_get',
    'telegram_inbox',
    'telegram_messages_get',
    'telegram_messages_search',
    'telegram_public_search',
    'telegram_contacts',
    'telegram_file_get',
]);
export function buildRuntimeAwareHealth(accountService, chatsService, p4bServices, singleUserWritesEnabled = false) {
    singleUserWritesEnabled = false;
    if (!accountService) {
        return P2_HEALTH_RESPONSE;
    }
    const health = accountService.getRuntimeHealth();
    const runtimeStatus = health.runtime_status;
    let providerStatus;
    switch (runtimeStatus) {
        case 'ready':
            providerStatus = 'READY';
            break;
        case 'reauth_required':
            providerStatus = 'REAUTH_REQUIRED';
            break;
        case 'degraded':
            providerStatus = 'DEGRADED';
            break;
        case 'failed':
            providerStatus = 'FAILED';
            break;
        case 'stopped':
            providerStatus = 'STOPPED';
            break;
        case 'closed':
        case 'closing':
            providerStatus = 'CLOSED';
            break;
        case 'starting':
            providerStatus = 'STARTING';
            break;
        default:
            providerStatus = 'NOT_CONFIGURED';
    }
    const hasP4B = p4bServices?.searchService !== undefined ||
        p4bServices?.contactsService !== undefined ||
        p4bServices?.fileService !== undefined;
    const completeP4 = Boolean(chatsService &&
        p4bServices?.messagesService &&
        p4bServices.searchService &&
        p4bServices.contactsService &&
        p4bServices.fileService);
    const phase = completeP4
        ? 'P4_TELEGRAM_READ_SURFACE'
        : hasP4B
            ? 'P4B_SEARCH_CONTACTS_FILES'
            : chatsService
                ? 'P4A_READ_CORE_FOUNDATION'
                : 'P3_ACCOUNT_RUNTIME';
    return Object.freeze({
        ok: runtimeStatus === 'ready',
        service: 'unofficial-telegram-sales-mcp',
        native_build_status: NATIVE_BUILD_STATUS,
        phase,
        mcp_transport_status: 'READY',
        telegram_provider_status: providerStatus,
        bot_provider_status: 'NOT_CONFIGURED',
        write_capabilities_enabled: singleUserWritesEnabled && runtimeStatus === 'ready',
        account_runtime: Object.freeze({
            runtime_status: runtimeStatus,
            authorization_state: health.authorization_state,
            authenticated: health.authenticated,
            reauth_required: health.reauth_required,
            own_identity_available: health.own_identity_available,
            transport_status: health.transport_status,
            last_error_type: health.last_error_type,
        }),
    });
}
export function buildRuntimeAwareCapabilities(accountService, chatsService, p4bServices, singleUserWritesEnabled = false, salesLocalEnabled = false) {
    singleUserWritesEnabled = false;
    if (!accountService) {
        return Object.freeze({ ...P2_CAPABILITIES_RESPONSE, sales_local: salesLocalEnabled });
    }
    const health = accountService.getRuntimeHealth();
    const authenticated = health.authenticated;
    const completeP4 = Boolean(chatsService &&
        p4bServices?.messagesService &&
        p4bServices.searchService &&
        p4bServices.contactsService &&
        p4bServices.fileService);
    const hasP4B = p4bServices?.searchService !== undefined ||
        p4bServices?.contactsService !== undefined ||
        p4bServices?.fileService !== undefined;
    const readsReady = completeP4 &&
        authenticated &&
        health.runtime_status === 'ready' &&
        health.authorization_state === 'authorizationStateReady' &&
        !health.reauth_required;
    const writesReady = singleUserWritesEnabled && readsReady;
    return Object.freeze({
        mcp_foundation: true,
        native_build_status: NATIVE_BUILD_STATUS,
        streamable_http: false,
        telegram_user_runtime: true,
        authenticated_account: authenticated,
        telegram_reads: readsReady,
        telegram_writes: writesReady,
        bot_api: false,
        telegram_business: false,
        sales_local: salesLocalEnabled,
        integrations: false,
        write_classes_enabled: writesReady
            ? Object.freeze([
                'SEND_TEXT',
                'REPLY_TEXT',
                'EDIT_TEXT',
                'DELETE_MESSAGE',
                'FORWARD_MESSAGE',
                'ADD_REACTION',
                'REMOVE_REACTION',
                'PIN_MESSAGE',
                'UNPIN_MESSAGE',
                'MARK_READ',
                'SEND_MEDIA',
                'SCHEDULE_TEXT',
                'SCHEDULE_MEDIA',
            ])
            : Object.freeze([]),
        next_phase: completeP4
            ? 'P5_TELEGRAM_MESSAGE_WRITE'
            : hasP4B
                ? 'P4C_LIVE_READ_QUALIFICATION'
                : chatsService
                    ? 'P4B_SEARCH_CONTACTS_FILES'
                    : 'P4_TELEGRAM_READ_SURFACE',
    });
}
export const UNCONFIGURED_ACCOUNT_RESPONSE = Object.freeze({
    ok: false,
    runtime_status: 'stopped',
    authorization_state: 'unknown',
    authenticated: false,
    reauth_required: false,
    reauth_reason: null,
    own_identity_read: false,
    own_identity_available: false,
    user_object_type: 'unknown',
    user_id_present: false,
    is_bot: null,
    transport_status: 'stopped',
    update_supervisor_running: false,
    pending_request_count: 0,
    update_count: 0,
    last_error_type: null,
});
export async function buildRuntimeAwareAccount(accountService) {
    if (!accountService) {
        return UNCONFIGURED_ACCOUNT_RESPONSE;
    }
    try {
        const snapshot = await accountService.getAccountSnapshot();
        const health = accountService.getRuntimeHealth();
        const reauth = accountService.getReauthState();
        return Object.freeze({
            ok: health.runtime_status === 'ready' &&
                snapshot.runtime_status === 'ready',
            runtime_status: snapshot.runtime_status,
            authorization_state: snapshot.authorization_state,
            authenticated: health.authenticated,
            reauth_required: reauth.reauth_required,
            reauth_reason: reauth.reason,
            own_identity_read: snapshot.own_identity_read,
            own_identity_available: health.own_identity_available,
            user_object_type: snapshot.user_object_type,
            user_id_present: snapshot.user_id_present,
            is_bot: snapshot.is_bot,
            transport_status: health.transport_status,
            update_supervisor_running: health.update_supervisor_running,
            pending_request_count: health.pending_request_count,
            update_count: health.update_count,
            last_error_type: health.last_error_type,
        });
    }
    catch {
        const health = accountService.getRuntimeHealth();
        const reauth = accountService.getReauthState();
        // Fail closed safe projection: never leak raw error prose, stack traces, or credentials
        return Object.freeze({
            ok: false,
            runtime_status: health.runtime_status,
            authorization_state: health.authorization_state,
            authenticated: health.authenticated,
            reauth_required: reauth.reauth_required,
            reauth_reason: reauth.reason,
            own_identity_read: false,
            own_identity_available: false,
            user_object_type: 'unknown',
            user_id_present: false,
            is_bot: null,
            transport_status: health.transport_status,
            update_supervisor_running: health.update_supervisor_running,
            pending_request_count: health.pending_request_count,
            update_count: health.update_count,
            last_error_type: health.last_error_type ?? 'TRANSPORT_STOPPED',
        });
    }
}
export function registerP2Tools(server) {
    server.registerTool('telegram_health', {
        description: 'Reports the health and provider status of the Telegram sales plugin foundation.',
        inputSchema: emptyBoundedInputSchema,
    }, 
    // eslint-disable-next-line @typescript-eslint/require-await
    async () => {
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(P2_HEALTH_RESPONSE, null, 2),
                },
            ],
            structuredContent: P2_HEALTH_RESPONSE,
        };
    });
    server.registerTool('telegram_capabilities', {
        description: 'Reports the explicit capability manifest and status for the Telegram sales plugin foundation.',
        inputSchema: emptyBoundedInputSchema,
    }, 
    // eslint-disable-next-line @typescript-eslint/require-await
    async () => {
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(P2_CAPABILITIES_RESPONSE, null, 2),
                },
            ],
            structuredContent: P2_CAPABILITIES_RESPONSE,
        };
    });
}
export function registerP3Tools(server, accountService) {
    server.registerTool('telegram_health', {
        description: 'Reports the health and provider status of the Telegram sales plugin foundation and account runtime.',
        inputSchema: emptyBoundedInputSchema,
    }, 
    // eslint-disable-next-line @typescript-eslint/require-await
    async () => {
        const response = buildRuntimeAwareHealth(accountService);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                },
            ],
            structuredContent: response,
        };
    });
    server.registerTool('telegram_capabilities', {
        description: 'Reports the explicit capability manifest and status for the Telegram sales plugin foundation and account runtime.',
        inputSchema: emptyBoundedInputSchema,
    }, 
    // eslint-disable-next-line @typescript-eslint/require-await
    async () => {
        const response = buildRuntimeAwareCapabilities(accountService);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                },
            ],
            structuredContent: response,
        };
    });
    server.registerTool('telegram_account', {
        description: 'Reports the safe, redacted snapshot, reauth state, and runtime health of the Telegram user account without exposing secrets or identity values.',
        inputSchema: emptyBoundedInputSchema,
    }, async () => {
        const response = await buildRuntimeAwareAccount(accountService);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                },
            ],
            structuredContent: response,
        };
    });
}
export const chatsListInputSchema = z
    .object({
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().max(512).optional(),
    chat_list: z.enum(['main', 'archive']).optional(),
})
    .strict();
export const chatGetInputSchema = z
    .object({
    chat_id: z.string().min(1).max(32),
})
    .strict();
export const inboxInputSchema = z
    .object({
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().max(512).optional(),
    unread_only: z.boolean().optional(),
})
    .strict();
export const messagesGetInputSchema = z
    .object({
    mode: z.enum(['history', 'context']).default('history'),
    chat_id: z.string().min(1).max(32),
    limit: z.number().int().min(1).max(100).optional(),
    from_message_id: z.string().min(1).max(32).optional(),
    offset: z.number().int().min(-100).max(100).optional(),
    message_id: z.string().min(1).max(32).optional(),
    before: z.number().int().min(0).max(50).optional(),
    after: z.number().int().min(0).max(50).optional(),
})
    .strict()
    .superRefine((data, ctx) => {
    if (data.mode === 'context') {
        if (!data.message_id) {
            ctx.addIssue({
                code: 'custom',
                message: 'message_id is required when mode is "context"',
                path: ['message_id'],
            });
        }
        const before = data.before ?? 5;
        const after = data.after ?? 5;
        if (before + after + 1 > 100) {
            ctx.addIssue({
                code: 'custom',
                message: 'Total requested context messages (before + after + 1) cannot exceed 100',
                path: ['before'],
            });
        }
    }
});
export const messagesSearchInputSchema = z
    .object({
    scope: z.enum(['chat', 'account']),
    chat_id: z.string().min(1).max(32).optional(),
    sender_user_id: z.string().min(1).max(32).optional(),
    chat_list: z.enum(['main', 'archive', 'all']).optional(),
    min_date: z.number().int().min(0).optional(),
    max_date: z.number().int().min(0).optional(),
    query: z.string().max(512).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().max(512).optional(),
    filter: z.enum(MESSAGE_SEARCH_FILTERS).optional(),
})
    .strict()
    .superRefine((data, ctx) => {
    if (data.scope === 'chat') {
        if (!data.chat_id) {
            ctx.addIssue({
                code: 'custom',
                message: 'chat_id is required when scope is "chat"',
                path: ['chat_id'],
            });
        }
        if (data.chat_list !== undefined) {
            ctx.addIssue({
                code: 'custom',
                message: 'chat_list is not supported when scope is "chat"',
                path: ['chat_list'],
            });
        }
        if (data.min_date !== undefined) {
            ctx.addIssue({
                code: 'custom',
                message: 'min_date is not supported when scope is "chat"',
                path: ['min_date'],
            });
        }
        if (data.max_date !== undefined) {
            ctx.addIssue({
                code: 'custom',
                message: 'max_date is not supported when scope is "chat"',
                path: ['max_date'],
            });
        }
    }
    else {
        if (!data.query || data.query.trim().length === 0) {
            ctx.addIssue({
                code: 'custom',
                message: 'query is required and cannot be empty when scope is "account"',
                path: ['query'],
            });
        }
        if (data.chat_id !== undefined) {
            ctx.addIssue({
                code: 'custom',
                message: 'chat_id is not supported when scope is "account"',
                path: ['chat_id'],
            });
        }
        if (data.sender_user_id !== undefined) {
            ctx.addIssue({
                code: 'custom',
                message: 'sender_user_id is not supported when scope is "account"',
                path: ['sender_user_id'],
            });
        }
    }
});
export const publicSearchInputSchema = z
    .object({
    mode: z.enum(['username', 'chats', 'posts', 'tag']),
    username: z.string().min(1).max(64).optional(),
    query: z.string().min(1).max(100).optional(),
    tag: z.string().min(1).max(100).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    cursor: z.string().max(512).optional(),
})
    .strict()
    .superRefine((data, ctx) => {
    if (data.mode === 'username') {
        if (!data.username) {
            ctx.addIssue({
                code: 'custom',
                message: 'username is required when mode is "username"',
                path: ['username'],
            });
        }
        if (data.query !== undefined) {
            ctx.addIssue({
                code: 'custom',
                message: 'query is not supported when mode is "username"',
                path: ['query'],
            });
        }
        if (data.tag !== undefined) {
            ctx.addIssue({
                code: 'custom',
                message: 'tag is not supported when mode is "username"',
                path: ['tag'],
            });
        }
        if (data.cursor !== undefined) {
            ctx.addIssue({
                code: 'custom',
                message: 'cursor is not supported when mode is "username"',
                path: ['cursor'],
            });
        }
        if (data.limit !== undefined) {
            ctx.addIssue({
                code: 'custom',
                message: 'limit is not supported when mode is "username"',
                path: ['limit'],
            });
        }
    }
    else if (data.mode === 'chats') {
        if (!data.query) {
            ctx.addIssue({
                code: 'custom',
                message: 'query is required when mode is "chats"',
                path: ['query'],
            });
        }
        if (data.username !== undefined) {
            ctx.addIssue({
                code: 'custom',
                message: 'username is not supported when mode is "chats"',
                path: ['username'],
            });
        }
        if (data.tag !== undefined) {
            ctx.addIssue({
                code: 'custom',
                message: 'tag is not supported when mode is "chats"',
                path: ['tag'],
            });
        }
        if (data.cursor !== undefined) {
            ctx.addIssue({
                code: 'custom',
                message: 'cursor is not supported when mode is "chats"',
                path: ['cursor'],
            });
        }
    }
    else if (data.mode === 'posts') {
        if (!data.query) {
            ctx.addIssue({
                code: 'custom',
                message: 'query is required when mode is "posts"',
                path: ['query'],
            });
        }
        if (data.username !== undefined) {
            ctx.addIssue({
                code: 'custom',
                message: 'username is not supported when mode is "posts"',
                path: ['username'],
            });
        }
        if (data.tag !== undefined) {
            ctx.addIssue({
                code: 'custom',
                message: 'tag is not supported when mode is "posts"',
                path: ['tag'],
            });
        }
    }
    else {
        if (!data.tag) {
            ctx.addIssue({
                code: 'custom',
                message: 'tag is required when mode is "tag"',
                path: ['tag'],
            });
        }
        if (data.username !== undefined) {
            ctx.addIssue({
                code: 'custom',
                message: 'username is not supported when mode is "tag"',
                path: ['username'],
            });
        }
        if (data.query !== undefined) {
            ctx.addIssue({
                code: 'custom',
                message: 'query is not supported when mode is "tag"',
                path: ['query'],
            });
        }
    }
});
export const contactsInputSchema = z
    .object({
    mode: z.enum(['list', 'search']),
    query: z.string().max(100).optional(),
    limit: z.number().int().min(1).max(100).optional(),
})
    .strict()
    .superRefine((data, ctx) => {
    if (data.mode === 'search') {
        if (!data.query || data.query.trim().length === 0) {
            ctx.addIssue({
                code: 'custom',
                message: 'query is required and cannot be empty when mode is "search"',
                path: ['query'],
            });
        }
    }
    else {
        if (data.query !== undefined) {
            ctx.addIssue({
                code: 'custom',
                message: 'query is not supported when mode is "list"',
                path: ['query'],
            });
        }
    }
});
export const fileGetInputSchema = z
    .object({
    file_id: z.string().min(1).max(32),
    mode: z.enum(['metadata', 'content']),
    max_bytes: z.number().int().min(1).max(262144).optional(),
})
    .strict()
    .superRefine((data, ctx) => {
    if (data.mode === 'metadata' && data.max_bytes !== undefined) {
        ctx.addIssue({
            code: 'custom',
            message: 'max_bytes is not applicable when mode is "metadata"',
            path: ['max_bytes'],
        });
    }
});
export function formatSafeErrorResponse(err) {
    let message = 'An unexpected error occurred';
    if (err instanceof DomainError) {
        message = `${err.code}: ${err.message}`;
    }
    else if (typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        typeof err.code === 'string') {
        const errRecord = err;
        const code = String(errRecord.code);
        const sanitizedMsg = typeof errRecord.message === 'string'
            ? errRecord.message
            : 'Operation failed';
        message = `${code}: ${sanitizedMsg}`;
    }
    else if (err instanceof z.ZodError) {
        message = `INVALID_ARGUMENT: ${err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`;
    }
    else if (err instanceof Error) {
        message = 'READ_FAILED: Request failed';
    }
    return {
        isError: true,
        content: [
            {
                type: 'text',
                text: message,
            },
        ],
    };
}
export function registerP4ATools(server, services) {
    // First register the 3 core account/health/capabilities tools
    server.registerTool('telegram_health', {
        description: 'Reports the health and provider status of the Telegram sales plugin foundation and account runtime.',
        inputSchema: emptyBoundedInputSchema,
    }, 
    // eslint-disable-next-line @typescript-eslint/require-await
    async () => {
        const response = buildRuntimeAwareHealth(services?.accountService, services?.chatsService);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                },
            ],
            structuredContent: response,
        };
    });
    server.registerTool('telegram_capabilities', {
        description: 'Reports the explicit capability manifest and status for the Telegram sales plugin foundation and account runtime.',
        inputSchema: emptyBoundedInputSchema,
    }, 
    // eslint-disable-next-line @typescript-eslint/require-await
    async () => {
        const response = buildRuntimeAwareCapabilities(services?.accountService, services?.chatsService);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                },
            ],
            structuredContent: response,
        };
    });
    server.registerTool('telegram_account', {
        description: 'Reports the safe, redacted snapshot, reauth state, and runtime health of the Telegram user account without exposing secrets or identity values.',
        inputSchema: emptyBoundedInputSchema,
    }, async () => {
        const response = await buildRuntimeAwareAccount(services?.accountService);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                },
            ],
            structuredContent: response,
        };
    });
    // Register P4A read tools
    server.registerTool('telegram_chats_list', {
        description: 'Lists recent chats with bounded pagination and normalized summaries. Read only.',
        inputSchema: chatsListInputSchema,
    }, async (args) => {
        if (!services?.chatsService) {
            return formatSafeErrorResponse(new DomainError('TRANSPORT_UNAVAILABLE', 'Chats service is not configured or available'));
        }
        try {
            const result = await services.chatsService.listChats({
                limit: args.limit,
                cursor: args.cursor,
                chatList: args.chat_list,
            });
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
                structuredContent: result,
            };
        }
        catch (err) {
            return formatSafeErrorResponse(err);
        }
    });
    server.registerTool('telegram_chat_get', {
        description: 'Retrieves normalized details and permissions for a specific chat by chat_id. Read only.',
        inputSchema: chatGetInputSchema,
    }, async (args) => {
        if (!services?.chatsService) {
            return formatSafeErrorResponse(new DomainError('TRANSPORT_UNAVAILABLE', 'Chats service is not configured or available'));
        }
        try {
            const result = await services.chatsService.getChat(args.chat_id);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
                structuredContent: result,
            };
        }
        catch (err) {
            return formatSafeErrorResponse(err);
        }
    });
    server.registerTool('telegram_inbox', {
        description: 'Returns a read-only projection of recent and unread conversations without marking anything read. Output contains page/scan-scoped returned_count, unread_in_scan, and raw_scanned_count.',
        inputSchema: inboxInputSchema,
    }, async (args) => {
        if (!services?.chatsService) {
            return formatSafeErrorResponse(new DomainError('TRANSPORT_UNAVAILABLE', 'Chats service is not configured or available'));
        }
        try {
            const result = await services.chatsService.getInbox({
                limit: args.limit,
                cursor: args.cursor,
                unreadOnly: args.unread_only,
            });
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
                structuredContent: result,
            };
        }
        catch (err) {
            return formatSafeErrorResponse(err);
        }
    });
    server.registerTool('telegram_messages_get', {
        description: 'Fetches recent message history or context around a specific message in a chat in deterministic order. Read only.',
        inputSchema: messagesGetInputSchema,
    }, async (args) => {
        if (!services?.messagesService) {
            return formatSafeErrorResponse(new DomainError('TRANSPORT_UNAVAILABLE', 'Messages service is not configured or available'));
        }
        try {
            if (args.mode === 'context') {
                if (!args.message_id) {
                    return formatSafeErrorResponse(new DomainError('INVALID_ARGUMENT', 'message_id is required when mode is "context"'));
                }
                const result = await services.messagesService.getContext({
                    chatId: args.chat_id,
                    messageId: args.message_id,
                    before: args.before,
                    after: args.after,
                });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                    structuredContent: result,
                };
            }
            else {
                const result = await services.messagesService.getHistory({
                    chatId: args.chat_id,
                    limit: args.limit,
                    fromMessageId: args.from_message_id,
                    offset: args.offset,
                });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                    structuredContent: result,
                };
            }
        }
        catch (err) {
            return formatSafeErrorResponse(err);
        }
    });
}
export function registerP4BTools(server, services) {
    // First register the 3 core account/health/capabilities tools
    server.registerTool('telegram_health', {
        description: 'Reports the health and provider status of the Telegram sales plugin foundation and account runtime.',
        inputSchema: emptyBoundedInputSchema,
    }, 
    // eslint-disable-next-line @typescript-eslint/require-await
    async () => {
        const response = buildRuntimeAwareHealth(services?.accountService, services?.chatsService, services, services?.singleUserWritesEnabled);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                },
            ],
            structuredContent: response,
        };
    });
    server.registerTool('telegram_capabilities', {
        description: 'Reports the explicit capability manifest and status for the Telegram sales plugin foundation and account runtime.',
        inputSchema: emptyBoundedInputSchema,
    }, 
    // eslint-disable-next-line @typescript-eslint/require-await
    async () => {
        const response = buildRuntimeAwareCapabilities(services?.accountService, services?.chatsService, services, services?.singleUserWritesEnabled, services?.salesLocalEnabled);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                },
            ],
            structuredContent: response,
        };
    });
    server.registerTool('telegram_account', {
        description: 'Reports the safe, redacted snapshot, reauth state, and runtime health of the Telegram user account without exposing secrets or identity values.',
        inputSchema: emptyBoundedInputSchema,
    }, async () => {
        const response = await buildRuntimeAwareAccount(services?.accountService);
        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(response, null, 2),
                },
            ],
            structuredContent: response,
        };
    });
    // Register P4A read tools
    server.registerTool('telegram_chats_list', {
        description: 'Lists recent chats with bounded pagination and normalized summaries. Read only.',
        inputSchema: chatsListInputSchema,
    }, async (args) => {
        if (!services?.chatsService) {
            return formatSafeErrorResponse(new DomainError('TRANSPORT_UNAVAILABLE', 'Chats service is not configured or available'));
        }
        try {
            const result = await services.chatsService.listChats({
                limit: args.limit,
                cursor: args.cursor,
                chatList: args.chat_list,
            });
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
                structuredContent: result,
            };
        }
        catch (err) {
            return formatSafeErrorResponse(err);
        }
    });
    server.registerTool('telegram_chat_get', {
        description: 'Retrieves normalized details and permissions for a specific chat by chat_id. Read only.',
        inputSchema: chatGetInputSchema,
    }, async (args) => {
        if (!services?.chatsService) {
            return formatSafeErrorResponse(new DomainError('TRANSPORT_UNAVAILABLE', 'Chats service is not configured or available'));
        }
        try {
            const result = await services.chatsService.getChat(args.chat_id);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
                structuredContent: result,
            };
        }
        catch (err) {
            return formatSafeErrorResponse(err);
        }
    });
    server.registerTool('telegram_inbox', {
        description: 'Returns a read-only projection of recent and unread conversations without marking anything read. Output contains page/scan-scoped returned_count, unread_in_scan, and raw_scanned_count.',
        inputSchema: inboxInputSchema,
    }, async (args) => {
        if (!services?.chatsService) {
            return formatSafeErrorResponse(new DomainError('TRANSPORT_UNAVAILABLE', 'Chats service is not configured or available'));
        }
        try {
            const result = await services.chatsService.getInbox({
                limit: args.limit,
                cursor: args.cursor,
                unreadOnly: args.unread_only,
            });
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
                structuredContent: result,
            };
        }
        catch (err) {
            return formatSafeErrorResponse(err);
        }
    });
    server.registerTool('telegram_messages_get', {
        description: 'Fetches recent message history or context around a specific message in a chat in deterministic order. Read only.',
        inputSchema: messagesGetInputSchema,
    }, async (args) => {
        if (!services?.messagesService) {
            return formatSafeErrorResponse(new DomainError('TRANSPORT_UNAVAILABLE', 'Messages service is not configured or available'));
        }
        try {
            if (args.mode === 'context') {
                if (!args.message_id) {
                    return formatSafeErrorResponse(new DomainError('INVALID_ARGUMENT', 'message_id is required when mode is "context"'));
                }
                const result = await services.messagesService.getContext({
                    chatId: args.chat_id,
                    messageId: args.message_id,
                    before: args.before,
                    after: args.after,
                });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                    structuredContent: result,
                };
            }
            else {
                const result = await services.messagesService.getHistory({
                    chatId: args.chat_id,
                    limit: args.limit,
                    fromMessageId: args.from_message_id,
                    offset: args.offset,
                });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                    structuredContent: result,
                };
            }
        }
        catch (err) {
            return formatSafeErrorResponse(err);
        }
    });
    // Register P4B read tools
    server.registerTool('telegram_messages_search', {
        description: 'Searches for messages within a specific chat or across the entire account in reverse-chronological order. Read only.',
        inputSchema: messagesSearchInputSchema,
    }, async (args) => {
        if (!services?.searchService) {
            return formatSafeErrorResponse(new DomainError('TRANSPORT_UNAVAILABLE', 'Search service is not configured or available'));
        }
        try {
            if (args.scope === 'chat') {
                const result = await services.searchService.searchMessages({
                    scope: 'chat',
                    chatId: args.chat_id ?? '',
                    query: args.query,
                    limit: args.limit,
                    cursor: args.cursor,
                    senderUserId: args.sender_user_id,
                    filter: args.filter,
                });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                    structuredContent: result,
                };
            }
            else {
                const result = await services.searchService.searchMessages({
                    scope: 'account',
                    query: args.query ?? '',
                    limit: args.limit,
                    cursor: args.cursor,
                    chatList: args.chat_list,
                    minDate: args.min_date,
                    maxDate: args.max_date,
                    filter: args.filter,
                });
                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                    structuredContent: result,
                };
            }
        }
        catch (err) {
            return formatSafeErrorResponse(err);
        }
    });
    server.registerTool('telegram_public_search', {
        description: 'Searches for public Telegram entities: exact username, public chats by title/username query, public channel posts, or public messages by hashtag/cashtag. Public posts search is strictly free (star_count=0); stars payment is disabled. Read only.',
        inputSchema: publicSearchInputSchema,
    }, async (args) => {
        if (!services?.searchService) {
            return formatSafeErrorResponse(new DomainError('TRANSPORT_UNAVAILABLE', 'Search service is not configured or available'));
        }
        try {
            switch (args.mode) {
                case 'username': {
                    const result = await services.searchService.searchPublic({
                        mode: 'username',
                        username: args.username ?? '',
                    });
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                        structuredContent: result,
                    };
                }
                case 'chats': {
                    const result = await services.searchService.searchPublic({
                        mode: 'chats',
                        query: args.query ?? '',
                        limit: args.limit,
                    });
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                        structuredContent: result,
                    };
                }
                case 'posts': {
                    const result = await services.searchService.searchPublic({
                        mode: 'posts',
                        query: args.query ?? '',
                        limit: args.limit,
                        cursor: args.cursor,
                    });
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                        structuredContent: result,
                    };
                }
                case 'tag': {
                    const result = await services.searchService.searchPublic({
                        mode: 'tag',
                        tag: args.tag ?? '',
                        limit: args.limit,
                        cursor: args.cursor,
                    });
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                        structuredContent: result,
                    };
                }
            }
        }
        catch (err) {
            return formatSafeErrorResponse(err);
        }
    });
    server.registerTool('telegram_contacts', {
        description: 'Lists or searches known Telegram user contacts with safe privacy projection. Phone number values are never exposed (phone_number_present fact only). Read only.',
        inputSchema: contactsInputSchema,
    }, async (args) => {
        if (!services?.contactsService) {
            return formatSafeErrorResponse(new DomainError('TRANSPORT_UNAVAILABLE', 'Contacts service is not configured or available'));
        }
        try {
            const result = await services.contactsService.getContacts(args.mode === 'search'
                ? {
                    mode: 'search',
                    query: args.query ?? '',
                    limit: args.limit,
                }
                : {
                    mode: 'list',
                    limit: args.limit,
                });
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
                structuredContent: result,
            };
        }
        catch (err) {
            return formatSafeErrorResponse(err);
        }
    });
    server.registerTool('telegram_file_get', {
        description: 'Retrieves metadata or bounded base64 content for a Telegram file by file_id. Accepts ONLY Telegram file_id (int32 decimal string). Arbitrary file paths or URLs are strictly forbidden. Content reads are bounded to at most 262144 bytes (256 KB). Read only.',
        inputSchema: fileGetInputSchema,
    }, async (args) => {
        if (!services?.fileService) {
            return formatSafeErrorResponse(new DomainError('TRANSPORT_UNAVAILABLE', 'File service is not configured or available'));
        }
        try {
            const result = await services.fileService.getFile(args.mode === 'content'
                ? {
                    mode: 'content',
                    fileId: args.file_id,
                    maxBytes: args.max_bytes,
                }
                : {
                    mode: 'metadata',
                    fileId: args.file_id,
                });
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(result, null, 2),
                    },
                ],
                structuredContent: result,
            };
        }
        catch (err) {
            return formatSafeErrorResponse(err);
        }
    });
}
