import { denyTelegramWrite } from '../policy/read-only.js';
import { z } from 'zod';
import { parseAndValidateSafeId } from '../domain/common/id-validator.js';
const ENABLE_ENV = 'TELEGRAM_SINGLE_USER_WRITES';
const CHAT_ENV = 'TELEGRAM_SINGLE_USER_CHAT_ID';
/**
 * Parses opt-in single-user write config from process env. Returns undefined
 * when disabled (the default). Throws if enabled but misconfigured, so a bad
 * config fails startup loudly instead of silently granting a wrong target.
 */
export function loadSingleUserWriteConfigFromEnv(env = process.env) {
    if (env[ENABLE_ENV] !== '1') {
        return undefined;
    }
    const rawChatId = env[CHAT_ENV];
    if (typeof rawChatId !== 'string' || rawChatId.trim().length === 0) {
        throw new Error(`${ENABLE_ENV}=1 requires ${CHAT_ENV} to be set to the exact operator-approved chat id`);
    }
    const parsed = parseAndValidateSafeId(rawChatId.trim(), 'chat_id');
    if (parsed.numberId === 0) {
        throw new Error(`${CHAT_ENV} must be a nonzero chat id`);
    }
    return Object.freeze({
        enabled: true,
        boundChatId: parsed.stringId,
        boundChatNumberId: parsed.numberId,
    });
}
const requestKey = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const text = z
    .string()
    .refine((value) => Array.from(value).length >= 1 && Array.from(value).length <= 4096);
const positiveMessageId = z
    .string()
    .regex(/^[1-9]\d*$/)
    .refine((value) => Number.isSafeInteger(Number(value)));
const emoji = z
    .string()
    .refine((value) => Array.from(value).length >= 1 &&
    Array.from(value).length <= 32 &&
    Array.from(value).every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127));
const mediaRef = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const caption = z
    .string()
    .refine((value) => Array.from(value).length <= 1024)
    .optional();
/** Unix seconds; the domain service enforces the exact future-date bound. */
const sendAt = z.number().int();
export const SINGLE_USER_WRITE_TOOL_NAMES = Object.freeze([
    'telegram_message_send',
    'telegram_message_reply',
    'telegram_message_edit',
    'telegram_message_delete',
    'telegram_message_forward',
    'telegram_message_reaction_add',
    'telegram_message_reaction_remove',
    'telegram_message_pin',
    'telegram_message_unpin',
    'telegram_message_mark_read',
    'telegram_message_media_send',
    'telegram_message_text_schedule',
    'telegram_message_media_schedule',
]);
/**
 * Registers the opt-in write tools bound to the operator-configured chat.
 * The model never supplies a chat id: every tool here always dispatches to
 * the single `boundChatId` from local config, so there is no arbitrary-
 * target risk from model input. Readiness is checked against the live
 * account runtime before any dispatch attempt; an unknown or non-ready
 * state denies rather than attempting a write.
 */
export function registerSingleUserWriteTool(server, service, config, accountService) {
    denyTelegramWrite();
    const register = (name, description, schema, run) => {
        server.registerTool(name, { description, inputSchema: schema }, async (args) => {
            try {
                if (accountService) {
                    const health = accountService.getRuntimeHealth();
                    if (health.runtime_status !== 'ready' ||
                        !health.authenticated ||
                        health.reauth_required) {
                        const result = { ok: false, error_code: 'RUNTIME_NOT_READY' };
                        return {
                            isError: true,
                            content: [
                                { type: 'text', text: JSON.stringify(result) },
                            ],
                            structuredContent: result,
                        };
                    }
                }
                const evidence = await run(args);
                return {
                    content: [
                        { type: 'text', text: JSON.stringify(evidence) },
                    ],
                    structuredContent: evidence,
                };
            }
            catch (error) {
                const code = error instanceof Error &&
                    'code' in error &&
                    typeof error.code === 'string'
                    ? error.code
                    : 'WRITE_UNAVAILABLE';
                const result = { ok: false, error_code: code };
                return {
                    isError: true,
                    content: [
                        { type: 'text', text: JSON.stringify(result) },
                    ],
                    structuredContent: result,
                };
            }
        });
    };
    register('telegram_message_send', 'Sends a text message to the single operator-approved chat bound in local config. Opt-in; disabled by default.', z.object({ text, request_key: requestKey }).strict(), (args) => service.sendText({
        chatId: config.boundChatId,
        text: args.text,
        requestKey: args.request_key,
    }));
    register('telegram_message_reply', 'Replies to a message in the single operator-approved chat bound in local config. Opt-in; disabled by default.', z
        .object({
        reply_message_id: positiveMessageId,
        text,
        request_key: requestKey,
    })
        .strict(), (args) => service.replyText({
        chatId: config.boundChatId,
        replyMessageId: args.reply_message_id,
        text: args.text,
        requestKey: args.request_key,
    }));
    register('telegram_message_edit', 'Edits a previously sent text message in the single operator-approved chat bound in local config. ' +
        'Only the account’s own messages can be edited; TDLib rejects edits of messages sent by ' +
        'anyone else, this tool does not pre-check ownership. Opt-in; disabled by default.', z
        .object({
        message_id: positiveMessageId,
        text,
        request_key: requestKey,
    })
        .strict(), (args) => service.editText({
        chatId: config.boundChatId,
        messageId: args.message_id,
        text: args.text,
        requestKey: args.request_key,
    }));
    register('telegram_message_delete', 'Deletes a message in the single operator-approved chat bound in local config. Opt-in; disabled by default.', z
        .object({
        message_id: positiveMessageId,
        revoke: z.boolean(),
        request_key: requestKey,
    })
        .strict(), (args) => service.deleteMessage({
        chatId: config.boundChatId,
        messageId: args.message_id,
        revoke: args.revoke,
        requestKey: args.request_key,
    }));
    register('telegram_message_forward', 'Forwards a message within the single operator-approved chat bound in local config. Both source and ' +
        'target are hard-bound to that same chat; the model only supplies the message id. Opt-in; disabled by default.', z
        .object({
        message_id: positiveMessageId,
        request_key: requestKey,
    })
        .strict(), (args) => service.forwardMessage({
        targetChatId: config.boundChatId,
        sourceChatId: config.boundChatId,
        messageId: args.message_id,
        requestKey: args.request_key,
    }));
    register('telegram_message_reaction_add', 'Adds an emoji reaction to a message in the single operator-approved chat bound in local config. Opt-in; disabled by default.', z
        .object({
        message_id: positiveMessageId,
        emoji,
        request_key: requestKey,
    })
        .strict(), (args) => service.addEmojiReaction({
        chatId: config.boundChatId,
        messageId: args.message_id,
        emoji: args.emoji,
        requestKey: args.request_key,
    }));
    register('telegram_message_reaction_remove', 'Removes an emoji reaction from a message in the single operator-approved chat bound in local config. Opt-in; disabled by default.', z
        .object({
        message_id: positiveMessageId,
        emoji,
        request_key: requestKey,
    })
        .strict(), (args) => service.removeEmojiReaction({
        chatId: config.boundChatId,
        messageId: args.message_id,
        emoji: args.emoji,
        requestKey: args.request_key,
    }));
    register('telegram_message_pin', 'Pins a message in the single operator-approved chat bound in local config. Opt-in; disabled by default.', z
        .object({
        message_id: positiveMessageId,
        disable_notification: z.boolean(),
        only_for_self: z.boolean(),
        request_key: requestKey,
    })
        .strict(), (args) => service.pinMessage({
        chatId: config.boundChatId,
        messageId: args.message_id,
        disableNotification: args.disable_notification,
        onlyForSelf: args.only_for_self,
        requestKey: args.request_key,
    }));
    register('telegram_message_unpin', 'Unpins a message in the single operator-approved chat bound in local config. Opt-in; disabled by default.', z
        .object({
        message_id: positiveMessageId,
        request_key: requestKey,
    })
        .strict(), (args) => service.unpinMessage({
        chatId: config.boundChatId,
        messageId: args.message_id,
        requestKey: args.request_key,
    }));
    register('telegram_message_mark_read', 'Marks a message as read in the single operator-approved chat bound in local config. Only loaded, already-sent (non-scheduled) incoming messages can be provably marked read; the ledger stays PENDING/AMBIGUOUS rather than claiming CONFIRMED when the read marker cannot be proven. Opt-in; disabled by default.', z
        .object({
        message_id: positiveMessageId,
        request_key: requestKey,
    })
        .strict(), (args) => service.markMessageRead({
        chatId: config.boundChatId,
        messageId: args.message_id,
        requestKey: args.request_key,
    }));
    register('telegram_message_media_send', 'Sends a photo or document to the single operator-approved chat bound in local config. media_ref is an opaque reference into the operator-staged media catalog (TELEGRAM_SINGLE_USER_MEDIA_CATALOG); arbitrary filesystem paths or URLs are never accepted from the model. Opt-in; disabled by default.', z
        .object({
        media_ref: mediaRef,
        caption,
        request_key: requestKey,
    })
        .strict(), (args) => service.sendMedia({
        chatId: config.boundChatId,
        mediaRef: args.media_ref,
        caption: args.caption,
        requestKey: args.request_key,
    }));
    register('telegram_message_text_schedule', 'Schedules a real future Telegram delivery of a text message in the single operator-approved chat bound in local config. send_at is a Unix-seconds timestamp strictly in the future; delivery happens on Telegram\'s own servers even if this process or the PC is offline at send time. Evidence only claims CONFIRMED once TDLib\'s scheduling_state on the returned message matches send_at exactly. Opt-in; disabled by default.', z
        .object({
        text,
        send_at: sendAt,
        request_key: requestKey,
    })
        .strict(), (args) => service.scheduleText({
        chatId: config.boundChatId,
        text: args.text,
        sendAt: args.send_at,
        requestKey: args.request_key,
    }));
    register('telegram_message_media_schedule', 'Schedules a real future Telegram delivery of a photo or document in the single operator-approved chat bound in local config, using the same operator-staged media catalog as telegram_message_media_send. send_at is a Unix-seconds timestamp strictly in the future; delivery happens even if this process is offline at send time. Opt-in; disabled by default.', z
        .object({
        media_ref: mediaRef,
        caption,
        send_at: sendAt,
        request_key: requestKey,
    })
        .strict(), (args) => service.scheduleMedia({
        chatId: config.boundChatId,
        mediaRef: args.media_ref,
        caption: args.caption,
        sendAt: args.send_at,
        requestKey: args.request_key,
    }));
}
