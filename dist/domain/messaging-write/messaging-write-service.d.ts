import { ApprovedMediaRegistry } from './approved-media-registry.js';
import { type ITdlibAdapter } from '../../telegram/tdlib/adapter.js';
export type WriteState = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'AMBIGUOUS';
export type WriteOperation = 'SEND_TEXT' | 'REPLY_TEXT' | 'EDIT_TEXT' | 'DELETE_MESSAGE' | 'FORWARD_MESSAGE' | 'ADD_REACTION' | 'REMOVE_REACTION' | 'PIN_MESSAGE' | 'UNPIN_MESSAGE' | 'MARK_READ' | 'SEND_MEDIA' | 'SCHEDULE_TEXT' | 'SCHEDULE_MEDIA';
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
export declare class MemoryWriteLedger implements WriteLedger {
    private readonly records;
    get(key: string): WriteEvidence | undefined;
    put(key: string, evidence: WriteEvidence): void;
    delete(key: string): void;
}
export declare class MemoryWriteAuditSink implements WriteAuditSink {
    readonly events: WriteEvidence[];
    record(evidence: WriteEvidence): void;
}
export declare class MessagingWriteService {
    private readonly adapter;
    private readonly ledger;
    private readonly audit;
    private readonly mediaRegistry;
    private readonly now;
    private readonly persistence?;
    constructor(adapter: Pick<ITdlibAdapter, 'sendText'> & Partial<Pick<ITdlibAdapter, 'editText' | 'deleteMessage' | 'forwardMessage' | 'addEmojiReaction' | 'removeEmojiReaction' | 'pinMessage' | 'unpinMessage' | 'markMessageRead' | 'sendControlled'>>, ledger: WriteLedger, audit: WriteAuditSink, mediaRegistry?: ApprovedMediaRegistry, now?: () => number, persistence?: WritePersistence);
    sendMedia(input: {
        chatId: unknown;
        mediaRef: unknown;
        caption?: unknown;
        requestKey: unknown;
    }): Promise<WriteEvidence>;
    scheduleText(input: {
        chatId: unknown;
        text: unknown;
        sendAt: unknown;
        requestKey: unknown;
    }): Promise<WriteEvidence>;
    scheduleMedia(input: {
        chatId: unknown;
        mediaRef: unknown;
        caption?: unknown;
        sendAt: unknown;
        requestKey: unknown;
    }): Promise<WriteEvidence>;
    sendText(input: {
        chatId: unknown;
        text: unknown;
        requestKey: unknown;
    }): Promise<WriteEvidence>;
    replyText(input: {
        chatId: unknown;
        replyMessageId: unknown;
        text: unknown;
        requestKey: unknown;
    }): Promise<WriteEvidence>;
    editText(input: {
        chatId: unknown;
        messageId: unknown;
        text: unknown;
        requestKey: unknown;
    }): Promise<WriteEvidence>;
    deleteMessage(input: {
        chatId: unknown;
        messageId: unknown;
        revoke: unknown;
        requestKey: unknown;
    }): Promise<WriteEvidence>;
    forwardMessage(input: {
        targetChatId: unknown;
        sourceChatId: unknown;
        messageId: unknown;
        requestKey: unknown;
    }): Promise<WriteEvidence>;
    addEmojiReaction(input: {
        chatId: unknown;
        messageId: unknown;
        emoji: unknown;
        requestKey: unknown;
    }): Promise<WriteEvidence>;
    removeEmojiReaction(input: {
        chatId: unknown;
        messageId: unknown;
        emoji: unknown;
        requestKey: unknown;
    }): Promise<WriteEvidence>;
    pinMessage(input: {
        chatId: unknown;
        messageId: unknown;
        disableNotification: unknown;
        onlyForSelf: unknown;
        requestKey: unknown;
    }): Promise<WriteEvidence>;
    unpinMessage(input: {
        chatId: unknown;
        messageId: unknown;
        requestKey: unknown;
    }): Promise<WriteEvidence>;
    markMessageRead(input: {
        chatId: unknown;
        messageId: unknown;
        requestKey: unknown;
    }): Promise<WriteEvidence>;
    private execute;
}
