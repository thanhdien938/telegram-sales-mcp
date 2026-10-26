import { createHash } from 'node:crypto';
import { parseAndValidateSafeId } from '../common/id-validator.js';
import { DomainError } from '../common/errors.js';
import {
  ApprovedMediaRegistry,
  type ApprovedMediaDescriptor,
} from './approved-media-registry.js';
import {
  TdlibWriteError,
  type ITdlibAdapter,
} from '../../telegram/tdlib/adapter.js';

export type WriteState = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'AMBIGUOUS';
export type WriteOperation =
  | 'SEND_TEXT'
  | 'REPLY_TEXT'
  | 'EDIT_TEXT'
  | 'DELETE_MESSAGE'
  | 'FORWARD_MESSAGE'
  | 'ADD_REACTION'
  | 'REMOVE_REACTION'
  | 'PIN_MESSAGE'
  | 'UNPIN_MESSAGE'
  | 'MARK_READ'
  | 'SEND_MEDIA'
  | 'SCHEDULE_TEXT'
  | 'SCHEDULE_MEDIA';
export interface WriteEvidence {
  readonly operation: WriteOperation;
  readonly requestHash: string;
  readonly fingerprint: string;
  readonly targetHash: string;
  readonly replyTargetHash: string | null;
  readonly timestamp: string;
  readonly state: WriteState;
  readonly messageId: string | null;
  readonly safeErrorType: 'PROVIDER_REJECTED' | 'RESULT_UNCERTAIN' | null;
  readonly reconciliationRequired: boolean;
  readonly providerDispatchAttempted: boolean;
}
export interface WriteLedger {
  get(key: string): WriteEvidence | undefined;
  put(key: string, evidence: WriteEvidence): void;
  delete(key: string): void;
}
export interface WriteAuditSink {
  record(evidence: WriteEvidence): void;
}
export interface WritePersistence {
  get(key: string): WriteEvidence | undefined;
  reserve(key: string, evidence: WriteEvidence): WriteEvidence;
  finalize(key: string, evidence: WriteEvidence): void;
  cancelPreDispatch(key: string, fingerprint: string): void;
}
export class MemoryWriteLedger implements WriteLedger {
  private readonly records = new Map<string, WriteEvidence>();
  get(key: string): WriteEvidence | undefined {
    return this.records.get(key);
  }
  put(key: string, evidence: WriteEvidence): void {
    this.records.set(key, evidence);
  }
  delete(key: string): void {
    this.records.delete(key);
  }
}
export class MemoryWriteAuditSink implements WriteAuditSink {
  readonly events: WriteEvidence[] = [];
  record(evidence: WriteEvidence): void {
    this.events.push(evidence);
  }
}
const hash = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
export class MessagingWriteService {
  private readonly adapter: Pick<ITdlibAdapter, 'sendText'> &
    Partial<
      Pick<
        ITdlibAdapter,
        | 'editText'
        | 'deleteMessage'
        | 'forwardMessage'
        | 'addEmojiReaction'
        | 'removeEmojiReaction'
        | 'pinMessage'
        | 'unpinMessage'
        | 'markMessageRead'
        | 'sendControlled'
      >
    >;
  private readonly ledger: WriteLedger;
  private readonly audit: WriteAuditSink;
  private readonly mediaRegistry: ApprovedMediaRegistry;
  private readonly now: () => number;
  private readonly persistence?: WritePersistence | undefined;

  constructor(
    adapter: Pick<ITdlibAdapter, 'sendText'> &
      Partial<
        Pick<
          ITdlibAdapter,
          | 'editText'
          | 'deleteMessage'
          | 'forwardMessage'
          | 'addEmojiReaction'
          | 'removeEmojiReaction'
          | 'pinMessage'
          | 'unpinMessage'
          | 'markMessageRead'
          | 'sendControlled'
        >
      >,
    ledger: WriteLedger,
    audit: WriteAuditSink,
    mediaRegistry: ApprovedMediaRegistry = new ApprovedMediaRegistry(),
    now: () => number = () => Date.now(),
    persistence?: WritePersistence,
  ) {
    this.adapter = adapter;
    this.ledger = ledger;
    this.audit = audit;
    this.mediaRegistry = mediaRegistry;
    this.now = now;
    this.persistence = persistence;
  }

  sendMedia(input: {
    chatId: unknown;
    mediaRef: unknown;
    caption?: unknown;
    requestKey: unknown;
  }): Promise<WriteEvidence> {
    return this.execute('SEND_MEDIA', input);
  }
  scheduleText(input: {
    chatId: unknown;
    text: unknown;
    sendAt: unknown;
    requestKey: unknown;
  }): Promise<WriteEvidence> {
    return this.execute('SCHEDULE_TEXT', input);
  }
  scheduleMedia(input: {
    chatId: unknown;
    mediaRef: unknown;
    caption?: unknown;
    sendAt: unknown;
    requestKey: unknown;
  }): Promise<WriteEvidence> {
    return this.execute('SCHEDULE_MEDIA', input);
  }

  sendText(input: {
    chatId: unknown;
    text: unknown;
    requestKey: unknown;
  }): Promise<WriteEvidence> {
    return this.execute('SEND_TEXT', input);
  }
  replyText(input: {
    chatId: unknown;
    replyMessageId: unknown;
    text: unknown;
    requestKey: unknown;
  }): Promise<WriteEvidence> {
    return this.execute('REPLY_TEXT', input);
  }
  editText(input: {
    chatId: unknown;
    messageId: unknown;
    text: unknown;
    requestKey: unknown;
  }): Promise<WriteEvidence> {
    return this.execute('EDIT_TEXT', input);
  }
  deleteMessage(input: {
    chatId: unknown;
    messageId: unknown;
    revoke: unknown;
    requestKey: unknown;
  }): Promise<WriteEvidence> {
    return this.execute('DELETE_MESSAGE', input);
  }
  forwardMessage(input: {
    targetChatId: unknown;
    sourceChatId: unknown;
    messageId: unknown;
    requestKey: unknown;
  }): Promise<WriteEvidence> {
    return this.execute('FORWARD_MESSAGE', input);
  }
  addEmojiReaction(input: {
    chatId: unknown;
    messageId: unknown;
    emoji: unknown;
    requestKey: unknown;
  }): Promise<WriteEvidence> {
    return this.execute('ADD_REACTION', input);
  }
  removeEmojiReaction(input: {
    chatId: unknown;
    messageId: unknown;
    emoji: unknown;
    requestKey: unknown;
  }): Promise<WriteEvidence> {
    return this.execute('REMOVE_REACTION', input);
  }
  pinMessage(input: {
    chatId: unknown;
    messageId: unknown;
    disableNotification: unknown;
    onlyForSelf: unknown;
    requestKey: unknown;
  }): Promise<WriteEvidence> {
    return this.execute('PIN_MESSAGE', input);
  }
  unpinMessage(input: {
    chatId: unknown;
    messageId: unknown;
    requestKey: unknown;
  }): Promise<WriteEvidence> {
    return this.execute('UNPIN_MESSAGE', input);
  }
  markMessageRead(input: {
    chatId: unknown;
    messageId: unknown;
    requestKey: unknown;
  }): Promise<WriteEvidence> {
    return this.execute('MARK_READ', input);
  }
  private async execute(
    operation: WriteOperation,
    input: {
      chatId?: unknown;
      replyMessageId?: unknown;
      messageId?: unknown;
      targetChatId?: unknown;
      sourceChatId?: unknown;
      revoke?: unknown;
      emoji?: unknown;
      disableNotification?: unknown;
      onlyForSelf?: unknown;
      text?: unknown;
      mediaRef?: unknown;
      caption?: unknown;
      sendAt?: unknown;
      requestKey: unknown;
    },
  ): Promise<WriteEvidence> {
    const chatId = parseAndValidateSafeId(
      operation === 'FORWARD_MESSAGE' ? input.targetChatId : input.chatId,
      'chat_id',
    );
    if (chatId.numberId === 0)
      throw new DomainError('INVALID_ID', 'chat_id must be nonzero');
    const replyId =
      operation === 'REPLY_TEXT'
        ? parseAndValidateSafeId(input.replyMessageId, 'message_id')
        : null;
    if (replyId && replyId.numberId <= 0)
      throw new DomainError('INVALID_ID', 'message_id must be positive');
    const messageId =
      operation === 'EDIT_TEXT' ||
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
    const sourceId =
      operation === 'FORWARD_MESSAGE'
        ? parseAndValidateSafeId(input.sourceChatId, 'source_chat_id')
        : null;
    if (sourceId?.numberId === 0)
      throw new DomainError('INVALID_ID', 'source_chat_id must be nonzero');
    if (operation === 'DELETE_MESSAGE' && typeof input.revoke !== 'boolean')
      throw new DomainError('INVALID_ARGUMENT', 'revoke must be boolean');
    if (
      (operation === 'ADD_REACTION' || operation === 'REMOVE_REACTION') &&
      (typeof input.emoji !== 'string' ||
        Array.from(input.emoji).length < 1 ||
        Array.from(input.emoji).length > 32 ||
        Array.from(input.emoji).some(
          (character) =>
            character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        ))
    )
      throw new DomainError('INVALID_ARGUMENT', 'Invalid emoji');
    if (
      operation === 'PIN_MESSAGE' &&
      (typeof input.disableNotification !== 'boolean' ||
        typeof input.onlyForSelf !== 'boolean')
    )
      throw new DomainError('INVALID_ARGUMENT', 'Pin flags must be boolean');
    const hasText =
      operation === 'SEND_TEXT' ||
      operation === 'SCHEDULE_TEXT' ||
      operation === 'REPLY_TEXT' ||
      operation === 'EDIT_TEXT';
    if (
      hasText &&
      (typeof input.text !== 'string' ||
        Array.from(input.text).length < 1 ||
        Array.from(input.text).length > 4096)
    )
      throw new DomainError(
        'INVALID_ARGUMENT',
        'text length must be 1..4096 Unicode code points',
      );
    if (
      typeof input.requestKey !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(input.requestKey)
    )
      throw new DomainError('INVALID_ARGUMENT', 'Invalid request key');
    const isMedia =
      operation === 'SEND_MEDIA' || operation === 'SCHEDULE_MEDIA';
    if (
      isMedia &&
      (typeof input.mediaRef !== 'string' ||
        !/^[A-Za-z0-9_-]{1,64}$/.test(input.mediaRef))
    )
      throw new DomainError('INVALID_ARGUMENT', 'Invalid media reference');
    if (
      isMedia &&
      input.caption !== undefined &&
      (typeof input.caption !== 'string' ||
        Array.from(input.caption).length > 1024)
    )
      throw new DomainError('INVALID_ARGUMENT', 'Invalid caption');
    const sendAt =
      operation === 'SCHEDULE_TEXT' || operation === 'SCHEDULE_MEDIA'
        ? input.sendAt
        : null;
    const nowSeconds = Math.floor(this.now() / 1000);
    if (
      sendAt !== null &&
      (typeof sendAt !== 'number' ||
        !Number.isInteger(sendAt) ||
        sendAt <= nowSeconds ||
        sendAt > 2_147_483_647 ||
        sendAt > nowSeconds + 367 * 86400)
    )
      throw new DomainError('INVALID_ARGUMENT', 'Invalid schedule date');
    const requestKey = input.requestKey;
    const fingerprint = hash(
      JSON.stringify([
        operation,
        chatId.stringId,
        replyId?.stringId ?? null,
        ...(operation === 'FORWARD_MESSAGE'
          ? [sourceId?.stringId, messageId?.stringId]
          : operation === 'ADD_REACTION' || operation === 'REMOVE_REACTION'
            ? [messageId?.stringId, hash(input.emoji as string)]
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
                      ? [messageId?.stringId, hash(input.text as string)]
                      : isMedia
                        ? [
                            input.mediaRef,
                            hash((input.caption as string | undefined) ?? ''),
                            sendAt,
                          ]
                        : [hash(input.text as string), sendAt]),
      ]),
    );
    const prior = this.persistence
      ? this.persistence.get(requestKey)
      : this.ledger.get(requestKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new DomainError(
          'IDEMPOTENCY_CONFLICT',
          'Request key already bound to another write',
        );
      if (prior.state === 'PENDING' || prior.state === 'AMBIGUOUS')
        throw new DomainError(
          'RECONCILIATION_REQUIRED',
          'Write outcome requires reconciliation',
        );
      return prior;
    }
    const media: ApprovedMediaDescriptor | null = isMedia
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
    const evidence = (
      state: WriteState,
      attempted: boolean,
      messageId: string | null = null,
      safeErrorType: WriteEvidence['safeErrorType'] = null,
    ): WriteEvidence =>
      Object.freeze({
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
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'Request key already bound to another write',
          );
        if (competing.state === 'PENDING' || competing.state === 'AMBIGUOUS')
          throw new DomainError(
            'RECONCILIATION_REQUIRED',
            'Write outcome requires reconciliation',
          );
        return competing;
      }
    } else this.ledger.put(requestKey, pending);
    let sent: { messageId: string };
    try {
      if (operation === 'EDIT_TEXT') {
        if (!this.adapter.editText || !messageId)
          throw new TdlibWriteError('PRE_DISPATCH');
        sent = await this.adapter.editText({
          chatId: chatId.numberId,
          messageId: messageId.numberId,
          text: input.text as string,
        });
      } else if (operation === 'DELETE_MESSAGE') {
        if (!this.adapter.deleteMessage || !messageId)
          throw new TdlibWriteError('PRE_DISPATCH');
        sent = await this.adapter.deleteMessage({
          chatId: chatId.numberId,
          messageId: messageId.numberId,
          revoke: input.revoke as boolean,
        });
      } else if (operation === 'FORWARD_MESSAGE') {
        if (!this.adapter.forwardMessage || !messageId || !sourceId)
          throw new TdlibWriteError('PRE_DISPATCH');
        sent = await this.adapter.forwardMessage({
          targetChatId: chatId.numberId,
          sourceChatId: sourceId.numberId,
          messageId: messageId.numberId,
        });
      } else if (
        operation === 'ADD_REACTION' ||
        operation === 'REMOVE_REACTION'
      ) {
        const method =
          operation === 'ADD_REACTION'
            ? this.adapter.addEmojiReaction
            : this.adapter.removeEmojiReaction;
        if (!method || !messageId) throw new TdlibWriteError('PRE_DISPATCH');
        sent = await method.call(this.adapter, {
          chatId: chatId.numberId,
          messageId: messageId.numberId,
          emoji: input.emoji as string,
        });
      } else if (operation === 'PIN_MESSAGE') {
        if (!this.adapter.pinMessage || !messageId)
          throw new TdlibWriteError('PRE_DISPATCH');
        sent = await this.adapter.pinMessage({
          chatId: chatId.numberId,
          messageId: messageId.numberId,
          disableNotification: input.disableNotification as boolean,
          onlyForSelf: input.onlyForSelf as boolean,
        });
      } else if (operation === 'UNPIN_MESSAGE' || operation === 'MARK_READ') {
        const method =
          operation === 'UNPIN_MESSAGE'
            ? this.adapter.unpinMessage
            : this.adapter.markMessageRead;
        if (!method || !messageId) throw new TdlibWriteError('PRE_DISPATCH');
        sent = await method.call(this.adapter, {
          chatId: chatId.numberId,
          messageId: messageId.numberId,
        });
      } else if (
        operation === 'SEND_MEDIA' ||
        operation === 'SCHEDULE_MEDIA' ||
        operation === 'SCHEDULE_TEXT'
      ) {
        if (!this.adapter.sendControlled)
          throw new TdlibWriteError('PRE_DISPATCH');
        sent = await this.adapter.sendControlled({
          chatId: chatId.numberId,
          ...(media
            ? { media, caption: (input.caption as string | undefined) ?? '' }
            : { text: input.text as string }),
          ...(sendAt !== null ? { sendAt: sendAt } : {}),
        });
      } else
        sent = await this.adapter.sendText({
          chatId: chatId.numberId,
          text: input.text as string,
          ...(replyId ? { replyMessageId: replyId.numberId } : {}),
        });
    } catch (error) {
      if (error instanceof TdlibWriteError && error.kind === 'PRE_DISPATCH') {
        if (this.persistence)
          this.persistence.cancelPreDispatch(requestKey, fingerprint);
        else this.ledger.delete(requestKey);
        throw error;
      }
      const rejected =
        error instanceof TdlibWriteError && error.kind === 'REJECTED';
      const result = evidence(
        rejected ? 'FAILED' : 'AMBIGUOUS',
        true,
        null,
        rejected ? 'PROVIDER_REJECTED' : 'RESULT_UNCERTAIN',
      );
      if (this.persistence) this.persistence.finalize(requestKey, result);
      else {
        this.ledger.put(requestKey, result);
        this.audit.record(result);
      }
      return result;
    }
    const confirmed = evidence('CONFIRMED', true, sent.messageId);
    if (this.persistence) this.persistence.finalize(requestKey, confirmed);
    else {
      this.ledger.put(requestKey, confirmed);
      this.audit.record(confirmed);
    }
    return confirmed;
  }
}
