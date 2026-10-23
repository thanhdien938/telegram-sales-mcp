import { DomainError } from '../common/errors.js';
import { parseAndValidateSafeId } from '../common/id-validator.js';
const MAX_TEXT_LENGTH = 4096;
function truncateText(text, maxLength = MAX_TEXT_LENGTH) {
    if (typeof text !== 'string') {
        return null;
    }
    if (text.length <= maxLength) {
        return text;
    }
    return text.slice(0, maxLength) + '... [truncated]';
}
function toSafeString(val, fallback = '') {
    if (typeof val === 'string') {
        return val;
    }
    if (typeof val === 'number' || typeof val === 'bigint') {
        return String(val);
    }
    return fallback;
}
function extractFileDescriptor(fileObj, fileName, mimeType) {
    if (typeof fileObj !== 'object' || fileObj === null) {
        return null;
    }
    const f = fileObj;
    const fileId = toSafeString(f.id, '0');
    const size = typeof f.size === 'number' ? f.size : 0;
    const expectedSize = typeof f.expected_size === 'number' ? f.expected_size : size;
    const local = typeof f.local === 'object' && f.local !== null
        ? f.local
        : null;
    const isDownloaded = local?.is_downloading_completed === true;
    return Object.freeze({
        file_id: fileId,
        size,
        expected_size: expectedSize,
        mime_type: mimeType ?? null,
        file_name: fileName ?? null,
        is_downloaded: isDownloaded,
    });
}
function extractPhotoDescriptor(photoObj) {
    if (typeof photoObj !== 'object' || photoObj === null) {
        return null;
    }
    const p = photoObj;
    const sizes = Array.isArray(p.sizes) ? p.sizes : [];
    if (sizes.length === 0) {
        return null;
    }
    // Pick the largest photo size
    const largest = sizes[sizes.length - 1];
    return extractFileDescriptor(largest.photo, null, 'image/jpeg');
}
export function normalizeMessage(rawMsg) {
    const chatId = toSafeString(rawMsg.chat_id, '0');
    const messageId = toSafeString(rawMsg.id, '0');
    const date = typeof rawMsg.date === 'number' ? rawMsg.date : 0;
    const editDate = typeof rawMsg.edit_date === 'number' ? rawMsg.edit_date : 0;
    const outgoing = rawMsg.is_outgoing === true;
    let sender = Object.freeze({
        type: 'unknown',
        id: null,
    });
    const senderObj = rawMsg.sender_id;
    if (typeof senderObj === 'object' && senderObj !== null) {
        const s = senderObj;
        if (s['@type'] === 'messageSenderUser') {
            sender = Object.freeze({
                type: 'user',
                id: toSafeString(s.user_id, ''),
            });
        }
        else if (s['@type'] === 'messageSenderChat') {
            sender = Object.freeze({
                type: 'chat',
                id: toSafeString(s.chat_id, ''),
            });
        }
    }
    let replyTo = null;
    const replyObj = rawMsg.reply_to;
    if (typeof replyObj === 'object' && replyObj !== null) {
        const r = replyObj;
        if (r['@type'] === 'messageReplyToMessage') {
            replyTo = Object.freeze({
                chat_id: toSafeString(r.chat_id, chatId),
                message_id: toSafeString(r.message_id, '0'),
            });
        }
    }
    let contentType = 'unsupported';
    let text = null;
    let caption = null;
    let file = null;
    let unsupportedType = null;
    const content = rawMsg.content;
    if (typeof content === 'object' && content !== null) {
        const c = content;
        const cType = toSafeString(c['@type'], '');
        switch (cType) {
            case 'messageText': {
                contentType = 'text';
                const formatted = c.text;
                text = truncateText(formatted?.text);
                break;
            }
            case 'messagePhoto': {
                contentType = 'photo';
                const captionFormatted = c.caption;
                caption = truncateText(captionFormatted?.text);
                file = extractPhotoDescriptor(c.photo);
                break;
            }
            case 'messageVideo': {
                contentType = 'video';
                const captionFormatted = c.caption;
                caption = truncateText(captionFormatted?.text);
                const v = c.video;
                file = extractFileDescriptor(v?.video, typeof v?.file_name === 'string' ? v.file_name : null, typeof v?.mime_type === 'string' ? v.mime_type : 'video/mp4');
                break;
            }
            case 'messageDocument': {
                contentType = 'document';
                const captionFormatted = c.caption;
                caption = truncateText(captionFormatted?.text);
                const d = c.document;
                file = extractFileDescriptor(d?.document, typeof d?.file_name === 'string' ? d.file_name : null, typeof d?.mime_type === 'string' ? d.mime_type : null);
                break;
            }
            case 'messageVoiceNote': {
                contentType = 'voice';
                const captionFormatted = c.caption;
                caption = truncateText(captionFormatted?.text);
                const vn = c.voice_note;
                file = extractFileDescriptor(vn?.voice, null, typeof vn?.mime_type === 'string' ? vn.mime_type : 'audio/ogg');
                break;
            }
            case 'messageAudio': {
                contentType = 'audio';
                const captionFormatted = c.caption;
                caption = truncateText(captionFormatted?.text);
                const a = c.audio;
                file = extractFileDescriptor(a?.audio, typeof a?.file_name === 'string' ? a.file_name : null, typeof a?.mime_type === 'string' ? a.mime_type : 'audio/mpeg');
                break;
            }
            case 'messageAnimation': {
                contentType = 'animation';
                const captionFormatted = c.caption;
                caption = truncateText(captionFormatted?.text);
                const anim = c.animation;
                file = extractFileDescriptor(anim?.animation, typeof anim?.file_name === 'string' ? anim.file_name : null, typeof anim?.mime_type === 'string' ? anim.mime_type : 'video/mp4');
                break;
            }
            case 'messageSticker': {
                contentType = 'sticker';
                const st = c.sticker;
                caption = typeof st?.emoji === 'string' ? st.emoji : null;
                file = extractFileDescriptor(st?.sticker, null, 'image/webp');
                break;
            }
            case 'messageContact': {
                contentType = 'contact';
                const ct = c.contact;
                const nameParts = [ct?.first_name, ct?.last_name]
                    .filter((part) => typeof part === 'string' && part.length > 0)
                    .join(' ');
                text = truncateText(nameParts || 'Contact');
                break;
            }
            case 'messageLocation': {
                contentType = 'location';
                const loc = c.location;
                if (typeof loc?.latitude === 'number' &&
                    typeof loc.longitude === 'number') {
                    text = `${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`;
                }
                else {
                    text = 'Location';
                }
                break;
            }
            default: {
                contentType = 'unsupported';
                unsupportedType = cType || 'unknown';
                break;
            }
        }
    }
    return Object.freeze({
        chat_id: chatId,
        message_id: messageId,
        date,
        edit_date: editDate,
        outgoing,
        sender,
        content_type: contentType,
        text,
        caption,
        reply_to: replyTo,
        file,
        ...(unsupportedType !== null ? { unsupported_type: unsupportedType } : {}),
    });
}
function sortMessagesChronologically(messages) {
    return messages.sort((a, b) => {
        if (a.date !== b.date) {
            return a.date - b.date;
        }
        const aId = BigInt(a.message_id);
        const bId = BigInt(b.message_id);
        return aId < bId ? -1 : aId > bId ? 1 : 0;
    });
}
export class MessagesService {
    adapter;
    constructor(adapter) {
        this.adapter = adapter;
    }
    async getHistory(options) {
        const chatVal = parseAndValidateSafeId(options.chatId, 'chat_id');
        const limit = options.limit ?? 20;
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
            throw new DomainError('INVALID_ARGUMENT', 'limit must be an integer between 1 and 100');
        }
        let fromMsgIdNumber = 0;
        if (options.fromMessageId !== undefined) {
            const fromVal = parseAndValidateSafeId(options.fromMessageId, 'from_message_id');
            fromMsgIdNumber = fromVal.numberId;
        }
        const offset = options.offset ?? 0;
        if (!Number.isInteger(offset) || offset < -100 || offset > 100) {
            throw new DomainError('INVALID_ARGUMENT', 'offset must be an integer between -100 and 100');
        }
        const rawResult = await this.adapter.getChatHistory({
            chatId: chatVal.numberId,
            fromMessageId: fromMsgIdNumber,
            offset,
            limit,
        });
        const normalized = rawResult.messages.map(normalizeMessage);
        const sorted = sortMessagesChronologically(normalized);
        let nextFromMessageId = null;
        if (normalized.length >= limit && sorted.length > 0 && sorted[0]) {
            nextFromMessageId = sorted[0].message_id;
        }
        return Object.freeze({
            mode: 'history',
            chat_id: chatVal.stringId,
            messages: Object.freeze(sorted),
            total_count: rawResult.total_count,
            order: 'chronological',
            next_from_message_id: nextFromMessageId,
        });
    }
    async getContext(options) {
        const chatVal = parseAndValidateSafeId(options.chatId, 'chat_id');
        const msgVal = parseAndValidateSafeId(options.messageId, 'message_id');
        const before = options.before ?? 5;
        const after = options.after ?? 5;
        if (!Number.isInteger(before) || before < 0 || before > 50) {
            throw new DomainError('INVALID_ARGUMENT', 'before count must be an integer between 0 and 50');
        }
        if (!Number.isInteger(after) || after < 0 || after > 50) {
            throw new DomainError('INVALID_ARGUMENT', 'after count must be an integer between 0 and 50');
        }
        const totalRequested = before + after + 1;
        if (totalRequested > 100) {
            throw new DomainError('INVALID_ARGUMENT', 'Total requested context messages (before + after + 1) cannot exceed 100');
        }
        // Verify anchor message exists
        const rawAnchor = await this.adapter.getMessage({
            chatId: chatVal.numberId,
            messageId: msgVal.numberId,
        });
        const anchorMessage = normalizeMessage(rawAnchor);
        // Fetch surrounding messages using negative offset
        // In TDLib, offset = -after starts fetching `after` messages newer than anchor
        const rawHistory = await this.adapter.getChatHistory({
            chatId: chatVal.numberId,
            fromMessageId: msgVal.numberId,
            offset: -after,
            limit: totalRequested,
        });
        const normalizedMap = new Map();
        normalizedMap.set(anchorMessage.message_id, anchorMessage);
        for (const raw of rawHistory.messages) {
            const msg = normalizeMessage(raw);
            normalizedMap.set(msg.message_id, msg);
        }
        const allMessages = Array.from(normalizedMap.values());
        const sorted = sortMessagesChronologically(allMessages);
        // Calculate actual before and after counts relative to anchor
        const anchorBigId = BigInt(anchorMessage.message_id);
        let actualBefore = 0;
        let actualAfter = 0;
        for (const msg of sorted) {
            const currentBigId = BigInt(msg.message_id);
            if (currentBigId < anchorBigId) {
                actualBefore++;
            }
            else if (currentBigId > anchorBigId) {
                actualAfter++;
            }
        }
        return Object.freeze({
            mode: 'context',
            chat_id: chatVal.stringId,
            anchor_message_id: msgVal.stringId,
            messages: Object.freeze(sorted),
            before_count: actualBefore,
            after_count: actualAfter,
            total_count: sorted.length,
            order: 'chronological',
        });
    }
    async getMessage(chatId, messageId) {
        const chatVal = parseAndValidateSafeId(chatId, 'chat_id');
        const msgVal = parseAndValidateSafeId(messageId, 'message_id');
        const raw = await this.adapter.getMessage({
            chatId: chatVal.numberId,
            messageId: msgVal.numberId,
        });
        return normalizeMessage(raw);
    }
}
