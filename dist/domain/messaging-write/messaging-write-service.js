import { createHash } from 'node:crypto';
import { parseAndValidateSafeId } from '../common/id-validator.js';
import { DomainError } from '../common/errors.js';
import { ApprovedMediaRegistry, } from './approved-media-registry.js';
import { TdlibWriteError, } from '../../telegram/tdlib/adapter.js';
export class MemoryWriteLedger {
    records = new Map();
    get(key) {
        return this.records.get(key);
    }
    put(key, evidence) {
        this.records.set(key, evidence);
    }
    delete(key) {
        this.records.delete(key);
    }
}
export class MemoryWriteAuditSink {
    events = [];
    record(evidence) {
        this.events.push(evidence);
    }
}
const hash = (value) => createHash('sha256').update(value).digest('hex');
export class MessagingWriteService {
    adapter;
    ledger;
    audit;
    mediaRegistry;
    now;
    persistence;
    constructor(adapter, ledger, audit, mediaRegistry = new ApprovedMediaRegistry(), now = () => Date.now(), persistence) {
        this.adapter = adapter;
        this.ledger = ledger;
        this.audit = audit;
        this.mediaRegistry = mediaRegistry;
        this.now = now;
        this.persistence = persistence;
    }
    sendMedia(input) {
        return this.execute('SEND_MEDIA', input);
    }
    scheduleText(input) {
        return this.execute('SCHEDULE_TEXT', input);
    }
    scheduleMedia(input) {
        return this.execute('SCHEDULE_MEDIA', input);
    }
    sendText(input) {
        return this.execute('SEND_TEXT', input);
    }
    replyText(input) {
        return this.execute('REPLY_TEXT', input);
    }
    editText(input) {
        return this.execute('EDIT_TEXT', input);
    }
    deleteMessage(input) {
        return this.execute('DELETE_MESSAGE', input);
    }
    forwardMessage(input) {
        return this.execute('FORWARD_MESSAGE', input);
    }
    addEmojiReaction(input) {
        return this.execute('ADD_REACTION', input);
    }
    removeEmojiReaction(input) {
        return this.execute('REMOVE_REACTION', input);
    }
    pinMessage(input) {
        return this.execute('PIN_MESSAGE', input);
    }
    unpinMessage(input) {
        return this.execute('UNPIN_MESSAGE', input);
    }
    markMessageRead(input) {
        return this.execute('MARK_READ', input);
    }
    async execute(operation, input) {
        const chatId = parseAndValidateSafeId(operation === 'FORWARD_MESSAGE' ? input.targetChatId : input.chatId, 'chat_id');
        if (chatId.numberId === 0)
            throw new DomainError('INVALID_ID', 'chat_id must be nonzero');
        const replyId = operation === 'REPLY_TEXT'
            ? parseAndValidateSafeId(input.replyMessageId, 'message_id')
            : null;
        if (replyId && replyId.numberId <= 0)
            throw new DomainError('INVALID_ID', 'message_id must be positive');
        const messageId = operation === 'EDIT_TEXT' ||
            operation === 'DELETE_MESSAGE' ||
            operation === 'FORWARD_MESSAGE' ||
            operation === 'ADD_REACTION' ||
            operation === 'REMOVE_REACTION' ||
            operation === 'PIN_MESSAGE' ||
            operation === 'UNPIN_MESSAGE' ||
            operation === 'MARK_READ'
            ? parseAndValidateSafeId(input.messageId, 'message_id')
            : null;
        if (messageId && messageId.numberId <= 0)
            throw new DomainError('INVALID_ID', 'message_id must be positive');
        const sourceId = operation === 'FORWARD_MESSAGE'
            ? parseAndValidateSafeId(input.sourceChatId, 'source_chat_id')
            : null;
        if (sourceId?.numberId === 0)
            throw new DomainError('INVALID_ID', 'source_chat_id must be nonzero');
        if (operation === 'DELETE_MESSAGE' && typeof input.revoke !== 'boolean')
            throw new DomainError('INVALID_ARGUMENT', 'revoke must be boolean');
        if ((operation === 'ADD_REACTION' || operation === 'REMOVE_REACTION') &&
            (typeof input.emoji !== 'string' ||
                Array.from(input.emoji).length < 1 ||
                Array.from(input.emoji).length > 32 ||
                Array.from(input.emoji).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)))
            throw new DomainError('INVALID_ARGUMENT', 'Invalid emoji');
        if (operation === 'PIN_MESSAGE' &&
            (typeof input.disableNotification !== 'boolean' ||
                typeof input.onlyForSelf !== 'boolean'))
            throw new DomainError('INVALID_ARGUMENT', 'Pin flags must be boolean');
        const hasText = operation === 'SEND_TEXT' ||
            operation === 'SCHEDULE_TEXT' ||
            operation === 'REPLY_TEXT' ||
            operation === 'EDIT_TEXT';
        if (hasText &&
            (typeof input.text !== 'string' ||
                Array.from(input.text).length < 1 ||
                Array.from(input.text).length > 4096))
            throw new DomainError('INVALID_ARGUMENT', 'text length must be 1..4096 Unicode code points');
        if (typeof input.requestKey !== 'string' ||
            !/^[A-Za-z0-9._:-]{1,128}$/.test(input.requestKey))
            throw new DomainError('INVALID_ARGUMENT', 'Invalid request key');
        const isMedia = operation === 'SEND_MEDIA' || operation === 'SCHEDULE_MEDIA';
        if (isMedia &&
            (typeof input.mediaRef !== 'string' ||
                !/^[A-Za-z0-9_-]{1,64}$/.test(input.mediaRef)))
            throw new DomainError('INVALID_ARGUMENT', 'Invalid media reference');
        if (isMedia &&
            input.caption !== undefined &&
            (typeof input.caption !== 'string' ||
                Array.from(input.caption).length > 1024))
            throw new DomainError('INVALID_ARGUMENT', 'Invalid caption');
        const sendAt = operation === 'SCHEDULE_TEXT' || operation === 'SCHEDULE_MEDIA'
            ? input.sendAt
            : null;
        const nowSeconds = Math.floor(this.now() / 1000);
        if (sendAt !== null &&
            (typeof sendAt !== 'number' ||
                !Number.isInteger(sendAt) ||
                sendAt <= nowSeconds ||
                sendAt > 2_147_483_647 ||
                sendAt > nowSeconds + 367 * 86400))
            throw new DomainError('INVALID_ARGUMENT', 'Invalid schedule date');
        const requestKey = input.requestKey;
        const fingerprint = hash(JSON.stringify([
            operation,
            chatId.stringId,
            replyId?.stringId ?? null,
            ...(operation === 'FORWARD_MESSAGE'
                ? [sourceId?.stringId, messageId?.stringId]
                : operation === 'ADD_REACTION' || operation === 'REMOVE_REACTION'
                    ? [messageId?.stringId, hash(input.emoji)]
                    : operation === 'PIN_MESSAGE'
                        ? [
                            messageId?.stringId,
                            input.disableNotification,
                            input.onlyForSelf,
                        ]
                        : operation === 'UNPIN_MESSAGE'
                            ? [messageId?.stringId]
                            : operation === 'MARK_READ'
                                ? [messageId?.stringId, true]
                                : operation === 'DELETE_MESSAGE'
                                    ? [messageId?.stringId, input.revoke]
                                    : operation === 'EDIT_TEXT'
                                        ? [messageId?.stringId, hash(input.text)]
                                        : isMedia
                                            ? [
                                                input.mediaRef,
                                                hash(input.caption ?? ''),
                                                sendAt,
                                            ]
                                            : [hash(input.text), sendAt]),
        ]));
        const prior = this.persistence
            ? this.persistence.get(requestKey)
            : this.ledger.get(requestKey);
        if (prior) {
            if (prior.fingerprint !== fingerprint)
                throw new DomainError('IDEMPOTENCY_CONFLICT', 'Request key already bound to another write');
            if (prior.state === 'PENDING' || prior.state === 'AMBIGUOUS')
                throw new DomainError('RECONCILIATION_REQUIRED', 'Write outcome requires reconciliation');
            return prior;
        }
        const media = isMedia
            ? this.mediaRegistry.resolve(input.mediaRef)
            : null;
        const base = {
            operation,
            requestHash: hash(requestKey),
            fingerprint,
            targetHash: hash(chatId.stringId),
            replyTargetHash: replyId
                ? hash(replyId.stringId)
                : messageId
                    ? hash(messageId.stringId)
                    : sourceId
                        ? hash(sourceId.stringId)
                        : null,
        };
        const evidence = (state, attempted, messageId = null, safeErrorType = null) => Object.freeze({
            ...base,
            timestamp: new Date().toISOString(),
            state,
            messageId,
            safeErrorType,
            reconciliationRequired: state === 'AMBIGUOUS' || state === 'PENDING',
            providerDispatchAttempted: attempted,
        });
        const pending = evidence('PENDING', false);
        if (this.persistence) {
            const competing = this.persistence.reserve(requestKey, pending);
            if (competing !== pending) {
                if (competing.fingerprint !== fingerprint)
                    throw new DomainError('IDEMPOTENCY_CONFLICT', 'Request key already bound to another write');
                if (competing.state === 'PENDING' || competing.state === 'AMBIGUOUS')
                    throw new DomainError('RECONCILIATION_REQUIRED', 'Write outcome requires reconciliation');
                return competing;
            }
        }
        else
            this.ledger.put(requestKey, pending);
        let sent;
        try {
            if (operation === 'EDIT_TEXT') {
                if (!this.adapter.editText || !messageId)
                    throw new TdlibWriteError('PRE_DISPATCH');
                sent = await this.adapter.editText({
                    chatId: chatId.numberId,
                    messageId: messageId.numberId,
                    text: input.text,
                });
            }
            else if (operation === 'DELETE_MESSAGE') {
                if (!this.adapter.deleteMessage || !messageId)
                    throw new TdlibWriteError('PRE_DISPATCH');
                sent = await this.adapter.deleteMessage({
                    chatId: chatId.numberId,
                    messageId: messageId.numberId,
                    revoke: input.revoke,
                });
            }
            else if (operation === 'FORWARD_MESSAGE') {
                if (!this.adapter.forwardMessage || !messageId || !sourceId)
                    throw new TdlibWriteError('PRE_DISPATCH');
                sent = await this.adapter.forwardMessage({
                    targetChatId: chatId.numberId,
                    sourceChatId: sourceId.numberId,
                    messageId: messageId.numberId,
                });
            }
            else if (operation === 'ADD_REACTION' ||
                operation === 'REMOVE_REACTION') {
                const method = operation === 'ADD_REACTION'
                    ? this.adapter.addEmojiReaction
                    : this.adapter.removeEmojiReaction;
                if (!method || !messageId)
                    throw new TdlibWriteError('PRE_DISPATCH');
                sent = await method.call(this.adapter, {
                    chatId: chatId.numberId,
                    messageId: messageId.numberId,
                    emoji: input.emoji,
                });
            }
            else if (operation === 'PIN_MESSAGE') {
                if (!this.adapter.pinMessage || !messageId)
                    throw new TdlibWriteError('PRE_DISPATCH');
                sent = await this.adapter.pinMessage({
                    chatId: chatId.numberId,
                    messageId: messageId.numberId,
                    disableNotification: input.disableNotification,
                    onlyForSelf: input.onlyForSelf,
                });
            }
            else if (operation === 'UNPIN_MESSAGE' || operation === 'MARK_READ') {
                const method = operation === 'UNPIN_MESSAGE'
                    ? this.adapter.unpinMessage
                    : this.adapter.markMessageRead;
                if (!method || !messageId)
                    throw new TdlibWriteError('PRE_DISPATCH');
                sent = await method.call(this.adapter, {
                    chatId: chatId.numberId,
                    messageId: messageId.numberId,
                });
            }
            else if (operation === 'SEND_MEDIA' ||
                operation === 'SCHEDULE_MEDIA' ||
                operation === 'SCHEDULE_TEXT') {
                if (!this.adapter.sendControlled)
                    throw new TdlibWriteError('PRE_DISPATCH');
                sent = await this.adapter.sendControlled({
                    chatId: chatId.numberId,
                    ...(media
                        ? { media, caption: input.caption ?? '' }
                        : { text: input.text }),
                    ...(sendAt !== null ? { sendAt: sendAt } : {}),
                });
            }
            else
                sent = await this.adapter.sendText({
                    chatId: chatId.numberId,
                    text: input.text,
                    ...(replyId ? { replyMessageId: replyId.numberId } : {}),
                });
        }
        catch (error) {
            if (error instanceof TdlibWriteError && error.kind === 'PRE_DISPATCH') {
                if (this.persistence)
                    this.persistence.cancelPreDispatch(requestKey, fingerprint);
                else
                    this.ledger.delete(requestKey);
                throw error;
            }
            const rejected = error instanceof TdlibWriteError && error.kind === 'REJECTED';
            const result = evidence(rejected ? 'FAILED' : 'AMBIGUOUS', true, null, rejected ? 'PROVIDER_REJECTED' : 'RESULT_UNCERTAIN');
            if (this.persistence)
                this.persistence.finalize(requestKey, result);
            else {
                this.ledger.put(requestKey, result);
                this.audit.record(result);
            }
            return result;
        }
        const confirmed = evidence('CONFIRMED', true, sent.messageId);
        if (this.persistence)
            this.persistence.finalize(requestKey, confirmed);
        else {
            this.ledger.put(requestKey, confirmed);
            this.audit.record(confirmed);
        }
        return confirmed;
    }
}
