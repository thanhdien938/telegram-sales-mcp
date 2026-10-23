import { TdlibError } from '../../telegram/tdlib/errors.js';
import { decodePaginationCursor, encodePaginationCursor, MAX_CURSOR_OFFSET, } from '../common/cursor.js';
import { DomainError } from '../common/errors.js';
import { parseAndValidateSafeId } from '../common/id-validator.js';
export function normalizeChatType(typeObj) {
    if (typeof typeObj !== 'object' || typeObj === null) {
        return 'unknown';
    }
    const typeRecord = typeObj;
    const type = typeRecord['@type'];
    switch (type) {
        case 'chatTypePrivate':
            return 'private';
        case 'chatTypeBasicGroup':
            return 'basic_group';
        case 'chatTypeSupergroup': {
            const isChannel = typeRecord.is_channel;
            return isChannel === true ? 'channel' : 'supergroup';
        }
        case 'chatTypeSecret':
            return 'secret';
        default:
            return 'unknown';
    }
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
export function normalizeLastMessage(msgObj) {
    if (typeof msgObj !== 'object' || msgObj === null) {
        return null;
    }
    const msg = msgObj;
    if (msg['@type'] !== 'message') {
        return null;
    }
    const messageId = toSafeString(msg.id, '0');
    const date = typeof msg.date === 'number' ? msg.date : 0;
    const outgoing = msg.is_outgoing === true;
    let senderType = 'unknown';
    let senderId = null;
    const sender = msg.sender_id;
    if (typeof sender === 'object' && sender !== null) {
        const s = sender;
        if (s['@type'] === 'messageSenderUser') {
            senderType = 'user';
            senderId = toSafeString(s.user_id, '');
        }
        else if (s['@type'] === 'messageSenderChat') {
            senderType = 'chat';
            senderId = toSafeString(s.chat_id, '');
        }
    }
    let contentType = 'unknown';
    let textPreview = '';
    const content = msg.content;
    if (typeof content === 'object' && content !== null) {
        const c = content;
        const cType = toSafeString(c['@type'], '');
        switch (cType) {
            case 'messageText': {
                contentType = 'text';
                const formattedText = c.text;
                if (typeof formattedText === 'object' && formattedText !== null) {
                    textPreview = toSafeString(formattedText.text, '').slice(0, 200);
                }
                break;
            }
            case 'messagePhoto': {
                contentType = 'photo';
                const caption = c.caption;
                if (typeof caption === 'object' && caption !== null) {
                    textPreview = toSafeString(caption.text, '').slice(0, 200);
                }
                break;
            }
            case 'messageVideo': {
                contentType = 'video';
                const caption = c.caption;
                if (typeof caption === 'object' && caption !== null) {
                    textPreview = toSafeString(caption.text, '').slice(0, 200);
                }
                break;
            }
            case 'messageDocument': {
                contentType = 'document';
                const caption = c.caption;
                if (typeof caption === 'object' && caption !== null) {
                    textPreview = toSafeString(caption.text, '').slice(0, 200);
                }
                break;
            }
            case 'messageVoiceNote': {
                contentType = 'voice';
                break;
            }
            case 'messageAudio': {
                contentType = 'audio';
                break;
            }
            case 'messageSticker': {
                contentType = 'sticker';
                break;
            }
            case 'messageContact': {
                contentType = 'contact';
                break;
            }
            case 'messageLocation': {
                contentType = 'location';
                break;
            }
            default: {
                contentType = 'unsupported';
                textPreview = `[${cType || 'unsupported'}]`;
                break;
            }
        }
    }
    return Object.freeze({
        message_id: messageId,
        date,
        outgoing,
        sender_type: senderType,
        sender_id: senderId,
        content_type: contentType,
        text_preview: textPreview,
    });
}
export function extractCanSendMessages(permissions) {
    if (typeof permissions === 'object' && permissions !== null) {
        const p = permissions;
        if (typeof p.can_send_basic_messages === 'boolean') {
            return p.can_send_basic_messages;
        }
    }
    return null;
}
export function normalizeChatSummary(rawChat) {
    const chatId = toSafeString(rawChat.id, '0');
    const title = typeof rawChat.title === 'string' ? rawChat.title : '';
    const chatType = normalizeChatType(rawChat.type);
    const unreadCount = typeof rawChat.unread_count === 'number' && rawChat.unread_count >= 0
        ? rawChat.unread_count
        : 0;
    const unreadMentionCount = typeof rawChat.unread_mention_count === 'number' &&
        rawChat.unread_mention_count >= 0
        ? rawChat.unread_mention_count
        : 0;
    const unreadReactionCount = typeof rawChat.unread_reaction_count === 'number' &&
        rawChat.unread_reaction_count >= 0
        ? rawChat.unread_reaction_count
        : 0;
    const hasProtectedContent = rawChat.has_protected_content === true;
    const isMarkedAsUnread = rawChat.is_marked_as_unread === true;
    const canSendMessages = extractCanSendMessages(rawChat.permissions);
    const canReadHistory = null;
    const lastMessage = normalizeLastMessage(rawChat.last_message);
    return Object.freeze({
        chat_id: chatId,
        title,
        chat_type: chatType,
        unread_count: unreadCount,
        unread_mention_count: unreadMentionCount,
        unread_reaction_count: unreadReactionCount,
        has_protected_content: hasProtectedContent,
        is_marked_as_unread: isMarkedAsUnread,
        can_send_messages: canSendMessages,
        can_read_history: canReadHistory,
        last_message: lastMessage,
    });
}
function isNotFoundError(err) {
    if (err instanceof TdlibError && err.code === 'NOT_FOUND') {
        return true;
    }
    if (err instanceof DomainError && err.code === 'NOT_FOUND') {
        return true;
    }
    if (typeof err === 'object' && err !== null && 'code' in err) {
        return err.code === 'NOT_FOUND';
    }
    return false;
}
export class ChatsService {
    adapter;
    constructor(adapter) {
        this.adapter = adapter;
    }
    /**
     * Loads chats from TDLib into local state until at least targetCount chats
     * are known or until TDLib reports all chats are loaded (404 end-of-list).
     * Enforces a hard work bound (MAX_LOAD_CYCLES) to prevent unbounded loops/network.
     * Throws PAGINATION_INCOMPLETE if progress stalls or work bound is exhausted
     * before targetCount is satisfied and endOfList is false.
     */
    async ensureChatsLoaded(chatList, targetCount) {
        const boundedTarget = Math.min(MAX_CURSOR_OFFSET, targetCount);
        let knownResult = await this.adapter.getChats({
            chatList,
            limit: Math.max(1, boundedTarget),
        });
        let currentCount = knownResult.chat_ids.length;
        let endOfList = false;
        const MAX_LOAD_CYCLES = 10;
        for (let cycle = 0; cycle < MAX_LOAD_CYCLES; cycle++) {
            if (currentCount >= boundedTarget || endOfList) {
                break;
            }
            const needed = boundedTarget - currentCount;
            const batchLimit = Math.min(100, Math.max(needed, 20));
            const loadResult = await this.adapter.loadChats({
                chatList,
                limit: batchLimit,
            });
            if (loadResult.end_of_list) {
                endOfList = true;
            }
            const updated = await this.adapter.getChats({
                chatList,
                limit: Math.max(1, boundedTarget),
            });
            const newCount = updated.chat_ids.length;
            if (newCount <= currentCount && !endOfList) {
                // No-progress protection: TDLib returned OK but count did not advance
                throw new DomainError('PAGINATION_INCOMPLETE', 'Chat list prefix loading made no progress from provider; retry request');
            }
            knownResult = updated;
            currentCount = newCount;
        }
        if (currentCount < boundedTarget && !endOfList) {
            throw new DomainError('PAGINATION_INCOMPLETE', 'Maximum load cycles reached before chat list prefix could be satisfied; retry request');
        }
        return {
            rawChats: knownResult,
            endOfList,
        };
    }
    /**
     * Performs an explicit, bounded probe to determine if the provider has reached
     * end-of-list when the loaded prefix reaches MAX_CURSOR_OFFSET (2000 chats).
     * Distinguishes exact 2000 chats (truthful EOF) from >2000 chats (PAGINATION_LIMIT_EXCEEDED).
     */
    async probeBoundaryEndOfList(chatList) {
        try {
            const probeResult = await this.adapter.loadChats({
                chatList,
                limit: 1,
            });
            return probeResult.end_of_list;
        }
        catch (err) {
            if (isNotFoundError(err)) {
                return true;
            }
            throw err;
        }
    }
    /**
     * Lists recent chats with bounded pagination and normalized summaries.
     * Note on Ordering: Chat ordering follows TDLib getChats beginning-order for the current
     * loaded state (sorted by chat.position.order, chat.id in descending order). Chat order
     * can naturally change between calls due to Telegram updates received in the background.
     */
    async listChats(options) {
        const limit = options?.limit ?? 20;
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
            throw new DomainError('INVALID_ARGUMENT', 'limit must be an integer between 1 and 100');
        }
        const cursorData = decodePaginationCursor(options?.cursor);
        if (cursorData?.chatList !== undefined &&
            options?.chatList !== undefined &&
            cursorData.chatList !== options.chatList) {
            throw new DomainError('INVALID_ARGUMENT', `Explicit chat_list '${options.chatList}' conflicts with cursor chat_list '${cursorData.chatList}'`);
        }
        const offset = cursorData?.offset ?? 0;
        const chatList = options?.chatList ?? cursorData?.chatList ?? 'main';
        if (offset >= MAX_CURSOR_OFFSET) {
            const probe = await this.ensureChatsLoaded(chatList, MAX_CURSOR_OFFSET);
            const isEndOfList = probe.endOfList || (await this.probeBoundaryEndOfList(chatList));
            if (isEndOfList) {
                return Object.freeze({
                    chats: Object.freeze([]),
                    next_cursor: null,
                    total_count: probe.rawChats.total_count,
                });
            }
            throw new DomainError('PAGINATION_LIMIT_EXCEEDED', `Pagination limit reached: offset ${String(offset)} exceeds supported implementation bound of ${String(MAX_CURSOR_OFFSET)} chats while provider has more chats`);
        }
        if (offset + limit > MAX_CURSOR_OFFSET) {
            const probe = await this.ensureChatsLoaded(chatList, MAX_CURSOR_OFFSET);
            const isEndOfList = probe.endOfList ||
                (probe.rawChats.chat_ids.length >= MAX_CURSOR_OFFSET &&
                    (await this.probeBoundaryEndOfList(chatList)));
            if (isEndOfList) {
                const targetSlice = probe.rawChats.chat_ids.slice(offset);
                const chatSummaries = [];
                for (const rawId of targetSlice) {
                    const validated = parseAndValidateSafeId(String(rawId), 'chat_id');
                    try {
                        const rawChat = await this.adapter.getChat(validated.numberId);
                        chatSummaries.push(normalizeChatSummary(rawChat));
                    }
                    catch (err) {
                        if (isNotFoundError(err)) {
                            continue;
                        }
                        throw err;
                    }
                }
                return Object.freeze({
                    chats: Object.freeze(chatSummaries),
                    next_cursor: null,
                    total_count: probe.rawChats.total_count,
                });
            }
            throw new DomainError('PAGINATION_LIMIT_EXCEEDED', `Pagination limit reached: requested window (${String(offset)} + ${String(limit)}) exceeds maximum supported bound of ${String(MAX_CURSOR_OFFSET)} chats`);
        }
        const targetCount = Math.min(MAX_CURSOR_OFFSET, offset + limit + 1);
        const { rawChats, endOfList } = await this.ensureChatsLoaded(chatList, targetCount);
        const targetSlice = rawChats.chat_ids.slice(offset, offset + limit);
        const chatSummaries = [];
        for (const rawId of targetSlice) {
            const validated = parseAndValidateSafeId(String(rawId), 'chat_id');
            try {
                const rawChat = await this.adapter.getChat(validated.numberId);
                chatSummaries.push(normalizeChatSummary(rawChat));
            }
            catch (err) {
                if (isNotFoundError(err)) {
                    // If an individual chat is not found (e.g. deleted/disappeared), continue gracefully
                    continue;
                }
                throw err;
            }
        }
        let nextCursor = null;
        if (endOfList) {
            if (rawChats.chat_ids.length > offset + limit) {
                nextCursor = encodePaginationCursor({
                    offset: offset + limit,
                    chatList,
                });
            }
        }
        else {
            // endOfList is false: more chats exist on provider
            const nextOffset = Math.min(MAX_CURSOR_OFFSET, offset + limit);
            nextCursor = encodePaginationCursor({
                offset: nextOffset,
                chatList,
            });
        }
        return Object.freeze({
            chats: Object.freeze(chatSummaries),
            next_cursor: nextCursor,
            total_count: rawChats.total_count,
        });
    }
    async getChat(chatId) {
        const validated = parseAndValidateSafeId(chatId, 'chat_id');
        const rawChat = await this.adapter.getChat(validated.numberId);
        return normalizeChatSummary(rawChat);
    }
    /**
     * Returns a read-only projection of conversations for sales/care inbox attention.
     * Uses a bounded, progress-safe raw scan window across TDLib's chat list.
     * Note on Ordering: Chat order follows TDLib beginning-order for loaded state and may
     * shift as new messages or updates arrive from Telegram.
     */
    async getInbox(options) {
        const limit = options?.limit ?? 20;
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
            throw new DomainError('INVALID_ARGUMENT', 'limit must be an integer between 1 and 100');
        }
        const cursorData = decodePaginationCursor(options?.cursor);
        if (cursorData?.unreadOnly !== undefined &&
            options?.unreadOnly !== undefined &&
            cursorData.unreadOnly !== options.unreadOnly) {
            throw new DomainError('INVALID_ARGUMENT', `Explicit unread_only '${String(options.unreadOnly)}' conflicts with cursor unread_only '${String(cursorData.unreadOnly)}'`);
        }
        const rawScanOffset = cursorData?.offset ?? 0;
        const unreadOnly = options?.unreadOnly ?? cursorData?.unreadOnly ?? false;
        const chatList = 'main';
        if (rawScanOffset >= MAX_CURSOR_OFFSET) {
            const probe = await this.ensureChatsLoaded(chatList, MAX_CURSOR_OFFSET);
            const isEndOfList = probe.endOfList || (await this.probeBoundaryEndOfList(chatList));
            if (isEndOfList) {
                return Object.freeze({
                    conversations: Object.freeze([]),
                    returned_count: 0,
                    unread_in_scan: 0,
                    raw_scanned_count: 0,
                    next_cursor: null,
                });
            }
            throw new DomainError('PAGINATION_LIMIT_EXCEEDED', `Pagination limit reached: inbox scan offset ${String(rawScanOffset)} reaches maximum supported bound of ${String(MAX_CURSOR_OFFSET)} chats while provider has more chats`);
        }
        const scanBatchSize = 100;
        const boundedBatchSize = Math.min(scanBatchSize, MAX_CURSOR_OFFSET - rawScanOffset);
        const targetCount = Math.min(MAX_CURSOR_OFFSET, rawScanOffset + boundedBatchSize + 1);
        const { rawChats, endOfList } = await this.ensureChatsLoaded(chatList, targetCount);
        const candidateIds = rawChats.chat_ids.slice(rawScanOffset, rawScanOffset + boundedBatchSize);
        const conversations = [];
        let unreadEncounteredCount = 0;
        let rawScanned = 0;
        for (const rawId of candidateIds) {
            rawScanned++;
            const validated = parseAndValidateSafeId(String(rawId), 'chat_id');
            try {
                const rawChat = await this.adapter.getChat(validated.numberId);
                const normalized = normalizeChatSummary(rawChat);
                const isUnread = normalized.unread_count > 0 || normalized.is_marked_as_unread;
                if (isUnread) {
                    unreadEncounteredCount++;
                }
                if (!unreadOnly || isUnread) {
                    conversations.push(normalized);
                    if (conversations.length >= limit) {
                        break;
                    }
                }
            }
            catch (err) {
                if (isNotFoundError(err)) {
                    // Safe skip on missing/disappeared chat
                    continue;
                }
                throw err;
            }
        }
        const newScanOffset = rawScanOffset + rawScanned;
        const totalLoaded = rawChats.chat_ids.length;
        let nextCursor = null;
        if (endOfList) {
            if (newScanOffset < totalLoaded) {
                nextCursor = encodePaginationCursor({
                    offset: newScanOffset,
                    unreadOnly,
                });
            }
        }
        else {
            // endOfList is false: provider may have more chats
            nextCursor = encodePaginationCursor({
                offset: Math.min(MAX_CURSOR_OFFSET, newScanOffset),
                unreadOnly,
            });
        }
        return Object.freeze({
            conversations: Object.freeze(conversations),
            returned_count: conversations.length,
            unread_in_scan: unreadEncounteredCount,
            raw_scanned_count: rawScanned,
            next_cursor: nextCursor,
        });
    }
}
