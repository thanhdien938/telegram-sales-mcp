import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type AccountService, type ChatsService, type ContactsService, type FileService, type MessagesService, type SearchService } from '../domain/index.js';
import type { TelegramAccountResult, TelegramCapabilitiesResult, TelegramHealthResult } from './types.js';
export declare const P2_HEALTH_RESPONSE: TelegramHealthResult;
export declare const P2_CAPABILITIES_RESPONSE: TelegramCapabilitiesResult;
export declare const emptyBoundedInputSchema: z.ZodObject<{}, z.core.$strict>;
export declare const P2_TOOL_NAMES: readonly ["telegram_health", "telegram_capabilities"];
export type P2ToolName = (typeof P2_TOOL_NAMES)[number];
export declare const P3_TOOL_NAMES: readonly ["telegram_health", "telegram_capabilities", "telegram_account"];
export type P3ToolName = (typeof P3_TOOL_NAMES)[number];
export declare const P4A_TOOL_NAMES: readonly ["telegram_health", "telegram_capabilities", "telegram_account", "telegram_chats_list", "telegram_chat_get", "telegram_inbox", "telegram_messages_get"];
export type P4AToolName = (typeof P4A_TOOL_NAMES)[number];
export declare const P4B_TOOL_NAMES: readonly ["telegram_health", "telegram_capabilities", "telegram_account", "telegram_chats_list", "telegram_chat_get", "telegram_inbox", "telegram_messages_get", "telegram_messages_search", "telegram_public_search", "telegram_contacts", "telegram_file_get"];
export type P4BToolName = (typeof P4B_TOOL_NAMES)[number];
export declare function buildRuntimeAwareHealth(accountService?: AccountService, chatsService?: ChatsService, p4bServices?: {
    readonly messagesService?: MessagesService | undefined;
    readonly searchService?: SearchService | undefined;
    readonly contactsService?: ContactsService | undefined;
    readonly fileService?: FileService | undefined;
}, singleUserWritesEnabled?: boolean): TelegramHealthResult;
export declare function buildRuntimeAwareCapabilities(accountService?: AccountService, chatsService?: ChatsService, p4bServices?: {
    readonly messagesService?: MessagesService | undefined;
    readonly searchService?: SearchService | undefined;
    readonly contactsService?: ContactsService | undefined;
    readonly fileService?: FileService | undefined;
}, singleUserWritesEnabled?: boolean, salesLocalEnabled?: boolean): TelegramCapabilitiesResult;
export declare const UNCONFIGURED_ACCOUNT_RESPONSE: TelegramAccountResult;
export declare function buildRuntimeAwareAccount(accountService?: AccountService): Promise<TelegramAccountResult>;
export declare function registerP2Tools(server: McpServer): void;
export declare function registerP3Tools(server: McpServer, accountService?: AccountService): void;
export declare const chatsListInputSchema: z.ZodObject<{
    limit: z.ZodOptional<z.ZodNumber>;
    cursor: z.ZodOptional<z.ZodString>;
    chat_list: z.ZodOptional<z.ZodEnum<{
        main: "main";
        archive: "archive";
    }>>;
}, z.core.$strict>;
export declare const chatGetInputSchema: z.ZodObject<{
    chat_id: z.ZodString;
}, z.core.$strict>;
export declare const inboxInputSchema: z.ZodObject<{
    limit: z.ZodOptional<z.ZodNumber>;
    cursor: z.ZodOptional<z.ZodString>;
    unread_only: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
export declare const messagesGetInputSchema: z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<{
        history: "history";
        context: "context";
    }>>;
    chat_id: z.ZodString;
    limit: z.ZodOptional<z.ZodNumber>;
    from_message_id: z.ZodOptional<z.ZodString>;
    offset: z.ZodOptional<z.ZodNumber>;
    message_id: z.ZodOptional<z.ZodString>;
    before: z.ZodOptional<z.ZodNumber>;
    after: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export declare const messagesSearchInputSchema: z.ZodObject<{
    scope: z.ZodEnum<{
        chat: "chat";
        account: "account";
    }>;
    chat_id: z.ZodOptional<z.ZodString>;
    sender_user_id: z.ZodOptional<z.ZodString>;
    chat_list: z.ZodOptional<z.ZodEnum<{
        main: "main";
        archive: "archive";
        all: "all";
    }>>;
    min_date: z.ZodOptional<z.ZodNumber>;
    max_date: z.ZodOptional<z.ZodNumber>;
    query: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodNumber>;
    cursor: z.ZodOptional<z.ZodString>;
    filter: z.ZodOptional<z.ZodEnum<{
        document: "document";
        photo: "photo";
        video: "video";
        audio: "audio";
        animation: "animation";
        voice_note: "voice_note";
        all: "all";
        photo_and_video: "photo_and_video";
        voice_and_video_note: "voice_and_video_note";
        url: "url";
        chat_photo: "chat_photo";
        video_note: "video_note";
    }>>;
}, z.core.$strict>;
export declare const publicSearchInputSchema: z.ZodObject<{
    mode: z.ZodEnum<{
        username: "username";
        tag: "tag";
        chats: "chats";
        posts: "posts";
    }>;
    username: z.ZodOptional<z.ZodString>;
    query: z.ZodOptional<z.ZodString>;
    tag: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodNumber>;
    cursor: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const contactsInputSchema: z.ZodObject<{
    mode: z.ZodEnum<{
        search: "search";
        list: "list";
    }>;
    query: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export declare const fileGetInputSchema: z.ZodObject<{
    file_id: z.ZodString;
    mode: z.ZodEnum<{
        content: "content";
        metadata: "metadata";
    }>;
    max_bytes: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export declare function formatSafeErrorResponse(err: unknown): {
    isError: true;
    content: [{
        type: 'text';
        text: string;
    }];
};
export declare function registerP4ATools(server: McpServer, services?: {
    readonly accountService?: AccountService | undefined;
    readonly chatsService?: ChatsService | undefined;
    readonly messagesService?: MessagesService | undefined;
}): void;
export interface P4BServices {
    readonly accountService?: AccountService | undefined;
    readonly chatsService?: ChatsService | undefined;
    readonly messagesService?: MessagesService | undefined;
    readonly searchService?: SearchService | undefined;
    readonly contactsService?: ContactsService | undefined;
    readonly fileService?: FileService | undefined;
    readonly singleUserWritesEnabled?: boolean | undefined;
    readonly salesLocalEnabled?: boolean | undefined;
}
export declare function registerP4BTools(server: McpServer, services?: P4BServices): void;
