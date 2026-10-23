import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AccountService } from '../domain/index.js';
import type { MessagingWriteService } from '../domain/messaging-write/index.js';
/**
 * Lightweight single-owner write mode. Supersedes the earlier separate
 * write-profile/grant design (docs/P5_P6_R1_SEPARATE_WRITE_PROFILE_AND_GRANT_DESIGN_20261013.md)
 * for a sole-owner MVP: there is only one trusted caller, so a second Windows
 * principal, protected grant issuer, and separate listener/tunnel are deferred
 * rather than solved. This mode reuses the existing MessagingWriteService and
 * the single already-owned TDLib adapter/runtime; it never starts a second
 * TDLib client against the same session.
 */
export interface SingleUserWriteConfig {
    readonly enabled: true;
    readonly boundChatId: string;
    readonly boundChatNumberId: number;
}
/**
 * Parses opt-in single-user write config from process env. Returns undefined
 * when disabled (the default). Throws if enabled but misconfigured, so a bad
 * config fails startup loudly instead of silently granting a wrong target.
 */
export declare function loadSingleUserWriteConfigFromEnv(env?: Record<string, string | undefined>): SingleUserWriteConfig | undefined;
export declare const SINGLE_USER_WRITE_TOOL_NAMES: readonly ["telegram_message_send", "telegram_message_reply", "telegram_message_edit", "telegram_message_delete", "telegram_message_forward", "telegram_message_reaction_add", "telegram_message_reaction_remove", "telegram_message_pin", "telegram_message_unpin", "telegram_message_mark_read", "telegram_message_media_send", "telegram_message_text_schedule", "telegram_message_media_schedule"];
/**
 * Registers the opt-in write tools bound to the operator-configured chat.
 * The model never supplies a chat id: every tool here always dispatches to
 * the single `boundChatId` from local config, so there is no arbitrary-
 * target risk from model input. Readiness is checked against the live
 * account runtime before any dispatch attempt; an unknown or non-ready
 * state denies rather than attempting a write.
 */
export declare function registerSingleUserWriteTool(server: McpServer, service: MessagingWriteService, config: SingleUserWriteConfig, accountService?: AccountService): void;
