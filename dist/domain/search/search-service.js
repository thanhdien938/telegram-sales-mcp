import { normalizeChatSummary } from '../chats/chats-service.js';
import { DomainError } from '../common/errors.js';
import { parseAndValidateSafeId } from '../common/id-validator.js';
import { normalizeMessage } from '../messages/messages-service.js';
import { canonicalizeSearchTag, decodeMessageSearchCursor, decodePublicPostsCursor, decodePublicTagCursor, encodeMessageSearchCursor, encodePublicPostsCursor, encodePublicTagCursor, } from './cursor.js';
import { isMessageSearchFilter, } from './types.js';
function isNotFoundError(err) {
    if (err instanceof DomainError && err.code === 'NOT_FOUND') {
        return true;
    }
    if (typeof err === 'object' && err !== null && 'code' in err) {
        return err.code === 'NOT_FOUND';
    }
    return false;
}
function mapSearchFilterToTdlib(filter) {
    if (!filter || filter === 'all') {
        return null;
    }
    switch (filter) {
        case 'photo':
            return { '@type': 'searchMessagesFilterPhoto' };
        case 'video':
            return { '@type': 'searchMessagesFilterVideo' };
        case 'photo_and_video':
            return { '@type': 'searchMessagesFilterPhotoAndVideo' };
        case 'document':
            return { '@type': 'searchMessagesFilterDocument' };
        case 'audio':
            return { '@type': 'searchMessagesFilterAudio' };
        case 'voice_note':
            return { '@type': 'searchMessagesFilterVoiceNote' };
        case 'voice_and_video_note':
            return { '@type': 'searchMessagesFilterVoiceAndVideoNote' };
        case 'animation':
            return { '@type': 'searchMessagesFilterAnimation' };
        case 'url':
            return { '@type': 'searchMessagesFilterUrl' };
        case 'chat_photo':
            return { '@type': 'searchMessagesFilterChatPhoto' };
        case 'video_note':
            return { '@type': 'searchMessagesFilterVideoNote' };
        default:
            throw new DomainError('INVALID_ARGUMENT', `Unsupported search messages filter: ${String(filter)}`);
    }
}
const USERNAME_REGEX = /^[a-zA-Z0-9_]{1,32}$/;
export class SearchService {
    adapter;
    constructor(adapter) {
        this.adapter = adapter;
    }
    async searchMessages(options) {
        const limit = options.limit ?? 20;
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
            throw new DomainError('INVALID_ARGUMENT', 'limit must be an integer between 1 and 100');
        }
        const filter = options.filter ?? 'all';
        if (!isMessageSearchFilter(filter)) {
            throw new DomainError('INVALID_ARGUMENT', `Unsupported filter: ${String(filter)}`);
        }
        const tdlibFilter = mapSearchFilterToTdlib(filter);
        if (options.scope === 'chat') {
            const rawChatId = options.chatId ?? options.chat_id;
            if (typeof rawChatId !== 'string') {
                throw new DomainError('INVALID_ID', 'chat_id must be a string representation of a decimal integer');
            }
            const chatValidated = parseAndValidateSafeId(rawChatId, 'chat_id');
            const query = options.query ?? '';
            if (query.length > 512) {
                throw new DomainError('INVALID_ARGUMENT', 'query exceeds maximum length of 512 characters');
            }
            let senderIdObj;
            let senderUserIdStr;
            const rawSender = options.senderUserId ?? options.sender_user_id ?? options.sender;
            if (rawSender !== undefined) {
                const senderValidated = parseAndValidateSafeId(rawSender, 'sender_user_id');
                senderUserIdStr = senderValidated.stringId;
                senderIdObj = {
                    '@type': 'messageSenderUser',
                    user_id: senderValidated.numberId,
                };
            }
            let fromMessageId = 0;
            if (options.cursor) {
                const decoded = decodeMessageSearchCursor(options.cursor, 'chat');
                if (decoded?.scope === 'chat') {
                    if (decoded.chat_id !== chatValidated.stringId) {
                        throw new DomainError('INVALID_CURSOR', 'Cursor chat_id does not match request chat_id');
                    }
                    if (decoded.query !== query) {
                        throw new DomainError('INVALID_CURSOR', 'Cursor query does not match request query');
                    }
                    if ((decoded.sender_user_id ?? undefined) !== senderUserIdStr) {
                        throw new DomainError('INVALID_CURSOR', 'Cursor sender_user_id does not match request sender_user_id');
                    }
                    if ((decoded.filter ?? 'all') !== filter) {
                        throw new DomainError('INVALID_CURSOR', 'Cursor filter does not match request filter');
                    }
                    const fromParsed = parseAndValidateSafeId(decoded.next_from_message_id, 'next_from_message_id');
                    fromMessageId = fromParsed.numberId;
                }
            }
            const raw = await this.adapter.searchChatMessages({
                chatId: chatValidated.numberId,
                query,
                senderId: senderIdObj,
                fromMessageId,
                limit,
                filter: tdlibFilter,
            });
            const normalizedMessages = raw.messages.map(normalizeMessage);
            const rawNext = String(raw.next_from_message_id);
            const isEof = rawNext === '0';
            const nextCursor = isEof
                ? null
                : encodeMessageSearchCursor({
                    v: 1,
                    scope: 'chat',
                    chat_id: chatValidated.stringId,
                    query,
                    ...(senderUserIdStr !== undefined
                        ? { sender_user_id: senderUserIdStr }
                        : {}),
                    ...(filter !== 'all' ? { filter } : {}),
                    next_from_message_id: rawNext,
                });
            const approximateTotalCount = raw.total_count === -1 ? null : raw.total_count;
            return Object.freeze({
                scope: 'chat',
                messages: normalizedMessages,
                approximate_total_count: approximateTotalCount,
                next_cursor: nextCursor,
            });
        }
        else {
            const rawSender = options.senderUserId ?? options.sender_user_id ?? options.sender;
            if (rawSender !== undefined) {
                throw new DomainError('INVALID_ARGUMENT', 'Sender filter is only supported for chat-scoped search');
            }
            const query = options.query;
            if (typeof query !== 'string' || query.trim().length === 0) {
                throw new DomainError('INVALID_ARGUMENT', 'query is required and cannot be empty when scope is "account"');
            }
            if (query.length > 512) {
                throw new DomainError('INVALID_ARGUMENT', 'query exceeds maximum length of 512 characters');
            }
            const chatList = options.chatList ?? options.chat_list ?? 'all';
            if (!['main', 'archive', 'all'].includes(chatList)) {
                throw new DomainError('INVALID_ARGUMENT', `Invalid chat_list: must be 'main', 'archive', or 'all'`);
            }
            const minDate = options.minDate ?? options.min_date ?? 0;
            if (!Number.isInteger(minDate) || minDate < 0) {
                throw new DomainError('INVALID_ARGUMENT', 'min_date must be a non-negative integer');
            }
            const maxDate = options.maxDate ?? options.max_date ?? 0;
            if (!Number.isInteger(maxDate) || maxDate < 0) {
                throw new DomainError('INVALID_ARGUMENT', 'max_date must be a non-negative integer');
            }
            let offset = '';
            if (options.cursor) {
                const decoded = decodeMessageSearchCursor(options.cursor, 'account');
                if (decoded?.scope === 'account') {
                    if (decoded.query !== query) {
                        throw new DomainError('INVALID_CURSOR', 'Cursor query does not match request query');
                    }
                    if ((decoded.chat_list ?? 'all') !== chatList) {
                        throw new DomainError('INVALID_CURSOR', 'Cursor chat_list does not match request chat_list');
                    }
                    if ((decoded.filter ?? 'all') !== filter) {
                        throw new DomainError('INVALID_CURSOR', 'Cursor filter does not match request filter');
                    }
                    if ((decoded.min_date ?? 0) !== minDate) {
                        throw new DomainError('INVALID_CURSOR', 'Cursor min_date does not match request min_date');
                    }
                    if ((decoded.max_date ?? 0) !== maxDate) {
                        throw new DomainError('INVALID_CURSOR', 'Cursor max_date does not match request max_date');
                    }
                    offset = decoded.next_offset;
                }
            }
            const raw = await this.adapter.searchMessages({
                chatList: chatList === 'all' ? null : chatList,
                query,
                offset,
                limit,
                filter: tdlibFilter,
                minDate,
                maxDate,
            });
            const normalizedMessages = raw.messages.map(normalizeMessage);
            const isEof = !raw.next_offset || raw.next_offset === '';
            const nextCursor = isEof
                ? null
                : encodeMessageSearchCursor({
                    v: 1,
                    scope: 'account',
                    query,
                    ...(chatList !== 'all' ? { chat_list: chatList } : {}),
                    ...(filter !== 'all' ? { filter } : {}),
                    ...(minDate > 0 ? { min_date: minDate } : {}),
                    ...(maxDate > 0 ? { max_date: maxDate } : {}),
                    next_offset: raw.next_offset,
                });
            const approximateTotalCount = raw.total_count === -1 ? null : raw.total_count;
            return Object.freeze({
                scope: 'account',
                messages: normalizedMessages,
                approximate_total_count: approximateTotalCount,
                next_cursor: nextCursor,
            });
        }
    }
    async searchPublic(options) {
        switch (options.mode) {
            case 'username': {
                const rawUsername = options.username;
                if (typeof rawUsername !== 'string' || rawUsername.length === 0) {
                    throw new DomainError('INVALID_ARGUMENT', 'username is required and cannot be empty');
                }
                const clean = rawUsername.startsWith('@')
                    ? rawUsername.slice(1)
                    : rawUsername;
                if (!USERNAME_REGEX.test(clean)) {
                    throw new DomainError('INVALID_ARGUMENT', 'username must be 1-32 alphanumeric or underscore characters');
                }
                const rawChat = await this.adapter.searchPublicChat(clean);
                const chat = normalizeChatSummary(rawChat);
                return Object.freeze({
                    mode: 'username',
                    chat,
                });
            }
            case 'chats': {
                const query = options.query;
                if (typeof query !== 'string' || query.trim().length === 0) {
                    throw new DomainError('INVALID_ARGUMENT', 'query is required and cannot be empty');
                }
                if (query.length > 100) {
                    throw new DomainError('INVALID_ARGUMENT', 'query exceeds maximum length of 100 characters');
                }
                const limit = options.limit ?? 20;
                if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
                    throw new DomainError('INVALID_ARGUMENT', 'limit must be an integer between 1 and 100');
                }
                const rawChats = await this.adapter.searchPublicChats({ query });
                const targetIds = rawChats.chat_ids.slice(0, limit);
                const normalizedChats = [];
                for (const id of targetIds) {
                    const numId = typeof id === 'number' ? id : parseAndValidateSafeId(id).numberId;
                    try {
                        const rawChat = await this.adapter.getChat(numId);
                        normalizedChats.push(normalizeChatSummary(rawChat));
                    }
                    catch (err) {
                        if (isNotFoundError(err)) {
                            continue;
                        }
                        throw err;
                    }
                }
                return Object.freeze({
                    mode: 'chats',
                    chats: Object.freeze(normalizedChats),
                    returned_count: normalizedChats.length,
                    approximate_total_count: rawChats.total_count,
                });
            }
            case 'posts': {
                const query = options.query;
                if (typeof query !== 'string' || query.trim().length === 0) {
                    throw new DomainError('INVALID_ARGUMENT', 'query is required and cannot be empty');
                }
                if (query.length > 100) {
                    throw new DomainError('INVALID_ARGUMENT', 'query exceeds maximum length of 100 characters');
                }
                const limit = options.limit ?? 20;
                if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
                    throw new DomainError('INVALID_ARGUMENT', 'limit must be an integer between 1 and 100');
                }
                let offset = '';
                if (options.cursor) {
                    const decoded = decodePublicPostsCursor(options.cursor);
                    if (decoded) {
                        if (decoded.query !== query) {
                            throw new DomainError('INVALID_CURSOR', 'Cursor query does not match request query');
                        }
                        offset = decoded.next_offset;
                    }
                }
                const raw = await this.adapter.searchPublicPosts({
                    query,
                    offset,
                    limit,
                });
                if (raw.are_limits_exceeded) {
                    throw new DomainError('FREE_PUBLIC_SEARCH_LIMIT_EXCEEDED', 'Free public search limits exceeded; star-based search is disabled');
                }
                const messages = raw.messages.map(normalizeMessage);
                const isEof = !raw.next_offset || raw.next_offset === '';
                const nextCursor = isEof
                    ? null
                    : encodePublicPostsCursor({
                        v: 1,
                        mode: 'posts',
                        query,
                        next_offset: raw.next_offset,
                    });
                return Object.freeze({
                    mode: 'posts',
                    messages: Object.freeze(messages),
                    next_cursor: nextCursor,
                });
            }
            case 'tag': {
                const canonicalTag = canonicalizeSearchTag(options.tag);
                const limit = options.limit ?? 20;
                if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
                    throw new DomainError('INVALID_ARGUMENT', 'limit must be an integer between 1 and 100');
                }
                let offset = '';
                if (options.cursor) {
                    const decoded = decodePublicTagCursor(options.cursor);
                    if (decoded) {
                        if (decoded.tag !== canonicalTag) {
                            throw new DomainError('INVALID_CURSOR', 'Cursor tag does not match request tag');
                        }
                        offset = decoded.next_offset;
                    }
                }
                const raw = await this.adapter.searchPublicMessagesByTag({
                    tag: canonicalTag,
                    offset,
                    limit,
                });
                const messages = raw.messages.map(normalizeMessage);
                const isEof = !raw.next_offset || raw.next_offset === '';
                const nextCursor = isEof
                    ? null
                    : encodePublicTagCursor({
                        v: 1,
                        mode: 'tag',
                        tag: canonicalTag,
                        next_offset: raw.next_offset,
                    });
                const approximateTotalCount = raw.total_count === -1 ? null : raw.total_count;
                return Object.freeze({
                    mode: 'tag',
                    messages: Object.freeze(messages),
                    approximate_total_count: approximateTotalCount,
                    next_cursor: nextCursor,
                });
            }
        }
    }
}
