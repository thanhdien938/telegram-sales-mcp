import { assertReadRpc, denyTelegramWrite } from '../../policy/read-only.js';
import { sanitizeTdlibErrorMessage, TdlibError } from './errors.js';
import { isTdlibAuthorizationState, parseSafeAccountIdentity, } from './types.js';
import { UpdateSupervisor } from './update-supervisor.js';
export const MAX_CHATS_FETCH_LIMIT = 2000;
export const MAX_SUPERGROUP_MEMBERS_PAGE_LIMIT = 50;
export const MAX_SUPERGROUP_MEMBERS_OFFSET = 10_000;
export class TdlibWriteError extends Error {
    kind;
    constructor(kind) {
        super(kind);
        this.kind = kind;
        this.name = 'TdlibWriteError';
    }
}
function isRecord(value) {
    return (value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        (Object.getPrototypeOf(value) === Object.prototype ||
            Object.getPrototypeOf(value) === null));
}
const privateIdentityReaders = new WeakMap();
/** Explicit local-owner import only; deliberately absent from the public adapter interface. */
export function bindLocalOwnerPrivateIdentity(adapter) {
    const read = privateIdentityReaders.get(adapter);
    if (!read)
        throw new Error('LOCAL_OWNER_PRIVATE_IDENTITY_HOLD');
    return Object.freeze({ readReadyRegularUser: read });
}
export class TdlibAdapter {
    transport;
    async sendControlled(params) {
        this.assertMutationIds(params.chatId);
        if ((params.media === undefined) === (params.text === undefined) ||
            (params.sendAt !== undefined &&
                (!Number.isInteger(params.sendAt) ||
                    params.sendAt <= 0 ||
                    params.sendAt > 2_147_483_647)))
            throw new TdlibWriteError('PRE_DISPATCH');
        const formatted = (value) => ({
            '@type': 'formattedText',
            text: value,
            entities: [],
        });
        const file = (m) => 'localPath' in m
            ? { '@type': 'inputFileLocal', path: m.localPath }
            : { '@type': 'inputFileId', id: m.tdlibFileId };
        const media = params.media;
        const content = !media
            ? {
                '@type': 'inputMessageText',
                text: formatted(params.text ?? ''),
                link_preview_options: null,
                clear_draft: false,
            }
            : media.kind === 'document'
                ? {
                    '@type': 'inputMessageDocument',
                    document: {
                        '@type': 'inputDocument',
                        document: file(media),
                        thumbnail: null,
                        disable_content_type_detection: false,
                    },
                    caption: formatted(params.caption ?? ''),
                }
                : media.kind === 'photo'
                    ? {
                        '@type': 'inputMessagePhoto',
                        photo: {
                            '@type': 'inputPhoto',
                            photo: file(media),
                            thumbnail: null,
                            video: null,
                            added_sticker_file_ids: [],
                            width: media.width,
                            height: media.height,
                        },
                        caption: formatted(params.caption ?? ''),
                        show_caption_above_media: false,
                        self_destruct_type: null,
                        has_spoiler: false,
                    }
                    : {
                        '@type': 'inputMessageVideo',
                        video: {
                            '@type': 'inputVideo',
                            video: file(media),
                            thumbnail: null,
                            cover: null,
                            start_timestamp: 0,
                            added_sticker_file_ids: [],
                            duration: media.duration,
                            width: media.width,
                            height: media.height,
                            supports_streaming: media.supportsStreaming,
                        },
                        caption: formatted(params.caption ?? ''),
                        show_caption_above_media: false,
                        self_destruct_type: null,
                        has_spoiler: false,
                    };
        const options = params.sendAt === undefined
            ? null
            : {
                '@type': 'messageSendOptions',
                suggested_post_info: null,
                disable_notification: false,
                from_background: false,
                protect_content: false,
                allow_paid_broadcast: false,
                paid_message_star_count: 0,
                update_order_of_installed_sticker_sets: false,
                scheduling_state: {
                    '@type': 'messageSchedulingStateSendAtDate',
                    send_date: params.sendAt,
                    repeat_period: 0,
                },
                effect_id: 0,
                sending_id: 0,
                only_preview: false,
            };
        // TDLib returns a temporary pending message (scheduled ones included);
        // only the correlated terminal update settles it.
        const response = await this.confirmSend(params.chatId, () => this.dispatchMutation('sendMessage', {
            chat_id: params.chatId,
            topic_id: null,
            reply_to: null,
            options,
            reply_markup: null,
            input_message_content: content,
        }), undefined, { sendAt: params.sendAt });
        if (response['@type'] !== 'message' ||
            response.chat_id !== params.chatId ||
            (typeof response.id !== 'number' && typeof response.id !== 'string') ||
            !/^[1-9]\d*$/.test(String(response.id)) ||
            !Number.isSafeInteger(Number(response.id)) ||
            (response.sending_state !== null &&
                response.sending_state !== undefined) ||
            !this.schedulingStateMatches(response.scheduling_state, params.sendAt))
            throw new TdlibWriteError('UNCERTAIN');
        return Object.freeze({ messageId: String(response.id) });
    }
    schedulingStateMatches(state, sendAt) {
        if (sendAt === undefined)
            return state === null || state === undefined;
        return (isRecord(state) &&
            state['@type'] === 'messageSchedulingStateSendAtDate' &&
            state.send_date === sendAt &&
            state.repeat_period === 0);
    }
    requestTimeoutMs;
    maxPendingRequests;
    updateSupervisor;
    lifecycleState = 'stopped';
    unsubscribeTransport = null;
    pendingRequests = new Map();
    requestSeq = 0;
    lastErrorType = null;
    queriedAuthorizationState = null;
    privateIdentityEpoch = 0;
    async dispatchMutation(method, payload) {
        denyTelegramWrite();
        try {
            this.assertOperational();
            await this.assertReadyForReads();
        }
        catch {
            throw new TdlibWriteError('PRE_DISPATCH');
        }
        try {
            return await this.sendInternalRequest(method, payload);
        }
        catch (error) {
            if (error instanceof TdlibWriteError)
                throw error;
            if (error instanceof TdlibError && error.code === 'TDLIB_ERROR')
                throw new TdlibWriteError('REJECTED');
            if (error instanceof TdlibError &&
                error.code === 'PENDING_REQUEST_OVERFLOW')
                throw new TdlibWriteError('PRE_DISPATCH');
            throw new TdlibWriteError('UNCERTAIN');
        }
    }
    assertMutationIds(...ids) {
        if (ids.some((id, index) => !Number.isSafeInteger(id) || (index === 0 ? id === 0 : id <= 0)))
            throw new TdlibWriteError('PRE_DISPATCH');
    }
    async confirmedOkMutation(method, payload, messageId) {
        const response = await this.dispatchMutation(method, payload);
        if (response['@type'] !== 'ok')
            throw new TdlibWriteError('UNCERTAIN');
        return Object.freeze({ messageId: String(messageId) });
    }
    assertEmoji(emoji) {
        if (typeof emoji !== 'string' ||
            Array.from(emoji).length < 1 ||
            Array.from(emoji).length > 32 ||
            Array.from(emoji).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
            throw new TdlibWriteError('PRE_DISPATCH');
    }
    async addEmojiReaction(params) {
        this.assertMutationIds(params.chatId, params.messageId);
        this.assertEmoji(params.emoji);
        return this.confirmedOkMutation('addMessageReaction', {
            chat_id: params.chatId,
            message_id: params.messageId,
            reaction_type: { '@type': 'reactionTypeEmoji', emoji: params.emoji },
            is_big: false,
            update_recent_reactions: false,
        }, params.messageId);
    }
    async removeEmojiReaction(params) {
        this.assertMutationIds(params.chatId, params.messageId);
        this.assertEmoji(params.emoji);
        return this.confirmedOkMutation('removeMessageReaction', {
            chat_id: params.chatId,
            message_id: params.messageId,
            reaction_type: { '@type': 'reactionTypeEmoji', emoji: params.emoji },
        }, params.messageId);
    }
    async pinMessage(params) {
        this.assertMutationIds(params.chatId, params.messageId);
        if (typeof params.disableNotification !== 'boolean' ||
            typeof params.onlyForSelf !== 'boolean')
            throw new TdlibWriteError('PRE_DISPATCH');
        return this.confirmedOkMutation('pinChatMessage', {
            chat_id: params.chatId,
            message_id: params.messageId,
            disable_notification: params.disableNotification,
            only_for_self: params.onlyForSelf,
        }, params.messageId);
    }
    async unpinMessage(params) {
        this.assertMutationIds(params.chatId, params.messageId);
        return this.confirmedOkMutation('unpinChatMessage', { chat_id: params.chatId, message_id: params.messageId }, params.messageId);
    }
    async markMessageRead(params) {
        this.assertMutationIds(params.chatId, params.messageId);
        // viewMessages answers Ok even when the target is not loaded in this
        // process (max_message_id stays 0, read_dialog_inbox is a no-op). Load the
        // exact message and capture the read marker first.
        let preRead;
        try {
            const loaded = await this.getMessage({
                chatId: params.chatId,
                messageId: params.messageId,
            });
            if (!this.isReadableMessage(loaded, params.chatId, params.messageId))
                throw new TdlibWriteError('PRE_DISPATCH');
            preRead = this.parseLastReadInbox(await this.getChat(params.chatId), params.chatId);
        }
        catch {
            throw new TdlibWriteError('PRE_DISPATCH');
        }
        // DISPATCH_ACCEPTED (internal, never persisted or returned): Ok only means
        // the request was processed. The ledger stays PENDING until the read
        // marker proof below passes.
        const response = await this.dispatchMutation('viewMessages', {
            chat_id: params.chatId,
            message_ids: [params.messageId],
            source: null,
            force_read: true,
        });
        if (response['@type'] !== 'ok')
            throw new TdlibWriteError('UNCERTAIN');
        try {
            const post = this.parseLastReadInbox(await this.getChat(params.chatId), params.chatId);
            if (post >= params.messageId && post >= preRead)
                return Object.freeze({ messageId: String(params.messageId) });
        }
        catch {
            /* fall through: unproven after dispatch */
        }
        throw new TdlibWriteError('UNCERTAIN');
    }
    // Message classes for which view_messages(force_read=true) provably advances
    // last_read_inbox_message_id to the target: valid server ids and local ids.
    // Yet-unsent ids are skipped by TDLib (no effect); scheduled ids are invalid.
    isReadableMessage(response, chatId, messageId) {
        if (!this.isExactMessage(response, chatId, messageId))
            return false;
        if ((response.sending_state !== null &&
            response.sending_state !== undefined) ||
            (response.scheduling_state !== null &&
                response.scheduling_state !== undefined))
            return false;
        const id = BigInt(messageId);
        if (id <= 0n || id > BigInt(0x7fffffff) << 20n)
            return false;
        if ((id & 0xfffffn) === 0n)
            return true;
        return (id & 7n) === 2n;
    }
    parseLastReadInbox(chat, chatId) {
        const value = chat.last_read_inbox_message_id;
        if (chat['@type'] !== 'chat' ||
            chat.id !== chatId ||
            (typeof value !== 'number' && typeof value !== 'string') ||
            !/^(0|[1-9]\d*)$/.test(String(value)) ||
            !Number.isSafeInteger(Number(value)))
            throw new TdlibWriteError('UNCERTAIN');
        return Number(value);
    }
    confirmedMessage(response, chatId, messageId) {
        const id = response.id;
        if (response['@type'] !== 'message' ||
            response.chat_id !== chatId ||
            (typeof id !== 'number' && typeof id !== 'string') ||
            !/^[1-9]\d*$/.test(String(id)) ||
            !Number.isSafeInteger(Number(id)) ||
            (messageId !== undefined && Number(id) !== messageId) ||
            (response.sending_state !== null && response.sending_state !== undefined))
            throw new TdlibWriteError('UNCERTAIN');
        return Object.freeze({ messageId: String(id) });
    }
    async editText(params) {
        this.assertMutationIds(params.chatId, params.messageId);
        if (typeof params.text !== 'string' ||
            Array.from(params.text).length < 1 ||
            Array.from(params.text).length > 4096)
            throw new TdlibWriteError('PRE_DISPATCH');
        const response = await this.dispatchMutation('editMessageText', {
            chat_id: params.chatId,
            message_id: params.messageId,
            reply_markup: null,
            input_message_content: {
                '@type': 'inputMessageText',
                text: { '@type': 'formattedText', text: params.text, entities: [] },
                link_preview_options: null,
                clear_draft: false,
            },
        });
        return this.confirmedMessage(response, params.chatId, params.messageId);
    }
    async deleteMessage(params) {
        this.assertMutationIds(params.chatId, params.messageId);
        if (typeof params.revoke !== 'boolean')
            throw new TdlibWriteError('PRE_DISPATCH');
        // use_message_database=false: TDLib server-deletes only messages already
        // loaded in this process and still answers Ok for the rest. Load first.
        try {
            const loaded = await this.getMessage({
                chatId: params.chatId,
                messageId: params.messageId,
            });
            if (!this.isExactMessage(loaded, params.chatId, params.messageId))
                throw new TdlibWriteError('PRE_DISPATCH');
        }
        catch {
            throw new TdlibWriteError('PRE_DISPATCH');
        }
        // DISPATCH_ACCEPTED (internal, never persisted or returned): Ok only means
        // the request was processed. The durable ledger stays PENDING until the
        // NOT_FOUND proof below passes.
        const response = await this.dispatchMutation('deleteMessages', {
            chat_id: params.chatId,
            message_ids: [params.messageId],
            revoke: params.revoke,
        });
        if (response['@type'] !== 'ok')
            throw new TdlibWriteError('UNCERTAIN');
        try {
            await this.getMessage({
                chatId: params.chatId,
                messageId: params.messageId,
            });
        }
        catch (error) {
            if (error instanceof TdlibError && error.code === 'NOT_FOUND')
                return Object.freeze({ messageId: String(params.messageId) });
        }
        throw new TdlibWriteError('UNCERTAIN');
    }
    isExactMessage(response, chatId, messageId) {
        const id = response.id;
        return (response['@type'] === 'message' &&
            response.chat_id === chatId &&
            (typeof id === 'number' || typeof id === 'string') &&
            /^[1-9]\d*$/.test(String(id)) &&
            Number(id) === messageId);
    }
    async forwardMessage(params) {
        this.assertMutationIds(params.targetChatId, params.messageId);
        this.assertMutationIds(params.sourceChatId, params.messageId);
        try {
            this.assertOperational();
            await this.assertReadyForReads();
        }
        catch {
            throw new TdlibWriteError('PRE_DISPATCH');
        }
        let response;
        try {
            response = await this.confirmSend(params.targetChatId, () => this.sendInternalRequest('forwardMessages', {
                chat_id: params.targetChatId,
                topic_id: null,
                from_chat_id: params.sourceChatId,
                message_ids: [params.messageId],
                options: null,
                send_copy: false,
                remove_caption: false,
            }), (raw) => {
                if (!isRecord(raw) ||
                    raw['@type'] !== 'messages' ||
                    !Array.isArray(raw.messages) ||
                    raw.messages.length !== 1) {
                    throw new TdlibWriteError('UNCERTAIN');
                }
                const item = raw.messages[0];
                if (item === null)
                    throw new TdlibWriteError('REJECTED');
                if (!isRecord(item)) {
                    throw new TdlibWriteError('UNCERTAIN');
                }
                return item;
            });
        }
        catch (error) {
            if (error instanceof TdlibWriteError)
                throw error;
            if (error instanceof TdlibError && error.code === 'TDLIB_ERROR')
                throw new TdlibWriteError('REJECTED');
            if (error instanceof TdlibError &&
                error.code === 'PENDING_REQUEST_OVERFLOW')
                throw new TdlibWriteError('PRE_DISPATCH');
            throw new TdlibWriteError('UNCERTAIN');
        }
        return this.confirmedMessage(response, params.targetChatId);
    }
    async sendText(params) {
        if (!Number.isSafeInteger(params.chatId) ||
            params.chatId === 0 ||
            (params.replyMessageId !== undefined &&
                (!Number.isSafeInteger(params.replyMessageId) ||
                    params.replyMessageId <= 0)) ||
            typeof params.text !== 'string' ||
            Array.from(params.text).length < 1 ||
            Array.from(params.text).length > 4096) {
            throw new TdlibWriteError('PRE_DISPATCH');
        }
        try {
            this.assertOperational();
            await this.assertReadyForReads();
        }
        catch {
            throw new TdlibWriteError('PRE_DISPATCH');
        }
        let response;
        try {
            response = await this.confirmSend(params.chatId, () => this.sendInternalRequest('sendMessage', {
                chat_id: params.chatId,
                topic_id: null,
                reply_to: params.replyMessageId === undefined
                    ? null
                    : {
                        '@type': 'inputMessageReplyToMessage',
                        message_id: params.replyMessageId,
                        quote: null,
                        checklist_task_id: 0,
                        poll_option_id: '',
                    },
                options: null,
                reply_markup: null,
                input_message_content: {
                    '@type': 'inputMessageText',
                    text: { '@type': 'formattedText', text: params.text, entities: [] },
                    link_preview_options: null,
                    clear_draft: false,
                },
            }));
        }
        catch (error) {
            if (error instanceof TdlibWriteError)
                throw error;
            if (error instanceof TdlibError && error.code === 'TDLIB_ERROR')
                throw new TdlibWriteError('REJECTED');
            if (error instanceof TdlibError &&
                error.code === 'PENDING_REQUEST_OVERFLOW')
                throw new TdlibWriteError('PRE_DISPATCH');
            throw new TdlibWriteError('UNCERTAIN');
        }
        return this.confirmedMessage(response, params.chatId);
    }
    // sendMessage and forwardMessages first return a temporary pending message.
    // Only the matching terminal update can settle it; observing arbitrary chat content cannot.
    async confirmSend(chatId, dispatch, unpack, schedule) {
        const terminals = new Map();
        let temporaryId = null;
        const availability = { unavailable: false };
        const isUnavailable = () => availability.unavailable;
        let wake;
        let timer;
        const validError = (value) => isRecord(value) &&
            value['@type'] === 'error' &&
            typeof value.code === 'number' &&
            Number.isInteger(value.code) &&
            value.code >= -2_147_483_648 &&
            value.code <= 2_147_483_647 &&
            typeof value.message === 'string';
        const unsubscribe = this.transport.subscribe((event) => {
            if (event.kind === 'error' ||
                (event.kind === 'lifecycle' &&
                    (event.state === 'closed' || event.state === 'failed'))) {
                availability.unavailable = true;
                wake?.();
            }
            if (event.kind !== 'update' || isUnavailable())
                return;
            const update = event.payload;
            const failed = update['@type'] === 'updateMessageSendFailed';
            if (!failed && update['@type'] !== 'updateMessageSendSucceeded')
                return;
            const oldId = update.old_message_id;
            if (!Number.isSafeInteger(oldId) || oldId === 0)
                return;
            const key = String(oldId);
            if (temporaryId !== null && key !== temporaryId)
                return;
            const message = update.message;
            // A known different chat is unrelated; missing chat cannot establish failure.
            if (isRecord(message) &&
                message.chat_id !== undefined &&
                message.chat_id !== chatId)
                return;
            let terminal = { kind: 'invalid' };
            if (isRecord(message)) {
                if (failed) {
                    const state = message.sending_state;
                    if (message['@type'] === 'message' &&
                        message.chat_id === chatId &&
                        Number.isSafeInteger(message.id) &&
                        message.id !== 0 &&
                        isRecord(state) &&
                        state['@type'] === 'messageSendingStateFailed' &&
                        validError(update.error) &&
                        validError(state.error) &&
                        update.error.code === state.error.code) {
                        terminal = {
                            kind: 'failure',
                            id: String(message.id),
                            code: update.error.code,
                        };
                    }
                }
                else {
                    try {
                        if (schedule &&
                            !this.schedulingStateMatches(message.scheduling_state, schedule.sendAt))
                            throw new TdlibWriteError('UNCERTAIN');
                        terminal = {
                            kind: 'success',
                            id: this.confirmedMessage(message, chatId).messageId,
                        };
                    }
                    catch {
                        /* Preserve malformed terminal as ambiguity. */
                    }
                }
            }
            // Bound pre-response state; never retain message content or error text.
            if (terminals.size >= this.maxPendingRequests && !terminals.has(key)) {
                availability.unavailable = true;
                wake?.();
                return;
            }
            const previous = terminals.get(key);
            if (previous &&
                (previous.kind !== terminal.kind ||
                    ('id' in previous &&
                        'id' in terminal &&
                        previous.id !== terminal.id) ||
                    ('code' in previous &&
                        'code' in terminal &&
                        previous.code !== terminal.code)))
                terminal = { kind: 'invalid' };
            terminals.set(key, terminal);
            if (key === temporaryId)
                wake?.();
        });
        try {
            const raw = await dispatch();
            if (isUnavailable())
                throw new TdlibWriteError('UNCERTAIN');
            const response = unpack ? unpack(raw) : raw;
            if (response.sending_state === null ||
                response.sending_state === undefined)
                return response;
            const state = response.sending_state;
            if (isUnavailable() ||
                response['@type'] !== 'message' ||
                response.chat_id !== chatId ||
                !Number.isSafeInteger(response.id) ||
                response.id === 0 ||
                !isRecord(state) ||
                state['@type'] !== 'messageSendingStatePending' ||
                (schedule !== undefined &&
                    !this.schedulingStateMatches(response.scheduling_state, schedule.sendAt)))
                throw new TdlibWriteError('UNCERTAIN');
            temporaryId = String(response.id);
            if (!terminals.has(temporaryId)) {
                await new Promise((resolve) => {
                    wake = resolve;
                    timer = setTimeout(resolve, this.requestTimeoutMs);
                });
            }
            const terminal = terminals.get(temporaryId);
            if (isUnavailable() || !terminal || terminal.kind === 'invalid')
                throw new TdlibWriteError('UNCERTAIN');
            if (terminal.kind === 'failure')
                throw new TdlibWriteError('REJECTED');
            return {
                '@type': 'message',
                chat_id: chatId,
                id: terminal.id,
                sending_state: null,
                scheduling_state: schedule?.sendAt === undefined
                    ? null
                    : {
                        '@type': 'messageSchedulingStateSendAtDate',
                        send_date: schedule.sendAt,
                        repeat_period: 0,
                    },
            };
        }
        finally {
            if (timer !== undefined)
                clearTimeout(timer);
            unsubscribe();
            terminals.clear();
        }
    }
    constructor(options) {
        this.transport = options.transport;
        this.requestTimeoutMs = options.requestTimeoutMs ?? 5000;
        this.maxPendingRequests = options.maxPendingRequests ?? 50;
        if (!Number.isSafeInteger(this.maxPendingRequests) ||
            this.maxPendingRequests < 1 ||
            !Number.isInteger(this.requestTimeoutMs) ||
            this.requestTimeoutMs < 1 ||
            this.requestTimeoutMs > 2_147_483_647) {
            throw new TdlibError('LIFECYCLE_ERROR', 'Invalid request limits');
        }
        this.updateSupervisor = new UpdateSupervisor();
        privateIdentityReaders.set(this, () => this.#readReadyRegularUser());
    }
    async start() {
        if (this.lifecycleState !== 'stopped') {
            throw new TdlibError('LIFECYCLE_ERROR', `Cannot start TdlibAdapter: currently in ${this.lifecycleState} state`);
        }
        this.lifecycleState = 'starting';
        this.unsubscribeTransport = this.transport.subscribe(this.handleTransportEvent.bind(this));
        this.updateSupervisor.start();
        try {
            await this.transport.start();
            if (this.getAdapterLifecycleState() !== 'starting') {
                await this.transport.stop();
                throw new TdlibError('TRANSPORT_STOPPED', 'Adapter stopped during start');
            }
            this.lifecycleState = 'running';
        }
        catch {
            this.cleanupPendingRequests('TRANSPORT_FAILED', 'Transport failed to start');
            this.unsubscribeFromTransport();
            this.unsubscribeTransport = null;
            this.updateSupervisor.stop();
            if (this.getAdapterLifecycleState() !== 'closed')
                this.lifecycleState = 'failed';
            this.lastErrorType = 'TRANSPORT_ERROR';
            throw new TdlibError('TRANSPORT_FAILED', 'Failed to start TDLib transport');
        }
    }
    async stop() {
        if (this.lifecycleState === 'closed' ||
            this.lifecycleState === 'stopping') {
            return;
        }
        this.lifecycleState = 'stopping';
        this.cleanupPendingRequests('TRANSPORT_STOPPED', 'Adapter stopped by caller');
        if (this.unsubscribeTransport) {
            this.unsubscribeTransport();
            this.unsubscribeTransport = null;
        }
        this.updateSupervisor.stop();
        try {
            await this.transport.stop();
        }
        finally {
            this.lifecycleState = 'closed';
        }
    }
    async getAuthorizationState(options) {
        this.assertOperational();
        if (!options?.refresh) {
            const knownState = this.updateSupervisor.getCurrentAuthorizationState();
            if (knownState !== null) {
                return knownState;
            }
        }
        const response = await this.sendInternalRequest('getAuthorizationState');
        const authState = this.extractAuthorizationState(response);
        if (!authState) {
            throw new TdlibError('INVALID_RESPONSE', 'Failed to parse authorization state from response');
        }
        this.queriedAuthorizationState = authState;
        return authState;
    }
    async getOwnAccountIdentity() {
        this.assertOperational();
        const currentAuth = this.updateSupervisor.getCurrentAuthorizationState() ??
            (await this.getAuthorizationState());
        if (currentAuth !== 'authorizationStateReady') {
            throw new TdlibError('ACCOUNT_NOT_READY', 'Account is not authenticated; cannot read identity');
        }
        const response = await this.sendInternalRequest('getMe');
        const identity = parseSafeAccountIdentity(response);
        if (!identity.own_identity_read) {
            throw new TdlibError('IDENTITY_UNAVAILABLE', 'Failed to retrieve own account identity');
        }
        return identity;
    }
    async #readReadyRegularUser() {
        const epoch = this.privateIdentityEpoch;
        const assertReady = () => {
            this.assertOperational();
            if (this.transport.getLifecycleState() !== 'running' ||
                !this.updateSupervisor.getMetrics().isRunning ||
                this.updateSupervisor.getCurrentAuthorizationState() !==
                    'authorizationStateReady' ||
                this.privateIdentityEpoch !== epoch)
                throw new Error('LOCAL_OWNER_PRIVATE_IDENTITY_HOLD');
        };
        try {
            assertReady();
            const before = await this.sendInternalRequest('getAuthorizationState');
            assertReady();
            if (this.extractAuthorizationState(before) !== 'authorizationStateReady')
                throw new Error('LOCAL_OWNER_PRIVATE_IDENTITY_HOLD');
            const response = await this.sendInternalRequest('getMe');
            assertReady();
            const after = await this.sendInternalRequest('getAuthorizationState');
            assertReady();
            if (this.extractAuthorizationState(after) !== 'authorizationStateReady' ||
                response['@type'] !== 'user' ||
                !isRecord(response.type) ||
                response.type['@type'] !== 'userTypeRegular' ||
                response.is_bot === true)
                throw new Error('LOCAL_OWNER_PRIVATE_IDENTITY_HOLD');
            const value = response.id;
            const id = typeof value === 'string'
                ? value
                : typeof value === 'number' &&
                    Number.isSafeInteger(value) &&
                    value > 0
                    ? String(value)
                    : '';
            if (!/^[1-9][0-9]{0,19}$/u.test(id))
                throw new Error('LOCAL_OWNER_PRIVATE_IDENTITY_HOLD');
            return Object.freeze({ kind: 'regular-user', id });
        }
        catch {
            throw new Error('LOCAL_OWNER_PRIVATE_IDENTITY_HOLD');
        }
    }
    subscribeAuthorizationState(listener) {
        return this.updateSupervisor.subscribeAuthorizationState(listener);
    }
    getRuntimeHealth() {
        const supervisorMetrics = this.updateSupervisor.getMetrics();
        return Object.freeze({
            transport_status: this.transport.getLifecycleState(),
            authorization_state: supervisorMetrics.currentAuthorizationState ??
                this.queriedAuthorizationState ??
                'unknown',
            update_supervisor_running: supervisorMetrics.isRunning,
            pending_request_count: this.pendingRequests.size,
            update_count: supervisorMetrics.updateCount,
            last_error_type: this.lastErrorType,
        });
    }
    async loadChats(params) {
        this.assertOperational();
        await this.assertReadyForReads();
        if (!Number.isInteger(params.limit) ||
            params.limit < 1 ||
            params.limit > 100) {
            throw new TdlibError('INVALID_ARGUMENT', 'limit must be an integer between 1 and 100');
        }
        const chatListPayload = params.chatList === 'archive'
            ? { '@type': 'chatListArchive' }
            : { '@type': 'chatListMain' };
        try {
            await this.sendInternalRequest('loadChats', {
                chat_list: chatListPayload,
                limit: params.limit,
            });
            return Object.freeze({
                all_chats_loaded: false,
                end_of_list: false,
            });
        }
        catch (err) {
            if (err instanceof TdlibError &&
                (err.code === 'NOT_FOUND' ||
                    (err.code === 'TDLIB_ERROR' &&
                        (err.message.includes('not found') || err.message.includes('404'))))) {
                return Object.freeze({
                    all_chats_loaded: true,
                    end_of_list: true,
                });
            }
            throw err;
        }
    }
    async getChats(params) {
        this.assertOperational();
        await this.assertReadyForReads();
        if (!Number.isInteger(params.limit) ||
            params.limit < 1 ||
            params.limit > MAX_CHATS_FETCH_LIMIT) {
            throw new TdlibError('INVALID_ARGUMENT', `limit must be an integer between 1 and ${String(MAX_CHATS_FETCH_LIMIT)}`);
        }
        const chatListPayload = params.chatList === 'archive'
            ? { '@type': 'chatListArchive' }
            : { '@type': 'chatListMain' };
        try {
            const response = await this.sendInternalRequest('getChats', {
                chat_list: chatListPayload,
                limit: params.limit,
            });
            const totalCount = typeof response.total_count === 'number' ? response.total_count : 0;
            const chatIds = Array.isArray(response.chat_ids)
                ? response.chat_ids
                : [];
            return Object.freeze({
                total_count: totalCount,
                chat_ids: chatIds,
            });
        }
        catch (err) {
            if (err instanceof TdlibError && err.code === 'TDLIB_ERROR') {
                if (err.message.includes('not found') || err.message.includes('404')) {
                    return Object.freeze({
                        total_count: 0,
                        chat_ids: [],
                    });
                }
            }
            throw err;
        }
    }
    async getChat(chatId) {
        this.assertOperational();
        await this.assertReadyForReads();
        if (!Number.isSafeInteger(chatId)) {
            throw new TdlibError('INVALID_ARGUMENT', 'chatId must be a safe integer');
        }
        try {
            const response = await this.sendInternalRequest('getChat', {
                chat_id: chatId,
            });
            return response;
        }
        catch (err) {
            if (err instanceof TdlibError && err.code === 'TDLIB_ERROR') {
                if (err.message.includes('not found') || err.message.includes('404')) {
                    throw new TdlibError('NOT_FOUND', 'Chat not found');
                }
            }
            throw err;
        }
    }
    async getChatHistory(params) {
        this.assertOperational();
        await this.assertReadyForReads();
        if (!Number.isSafeInteger(params.chatId)) {
            throw new TdlibError('INVALID_ARGUMENT', 'chatId must be a safe integer');
        }
        if (!Number.isInteger(params.limit) ||
            params.limit < 1 ||
            params.limit > 100) {
            throw new TdlibError('INVALID_ARGUMENT', 'limit must be an integer between 1 and 100');
        }
        if (params.fromMessageId !== undefined &&
            !Number.isSafeInteger(params.fromMessageId)) {
            throw new TdlibError('INVALID_ARGUMENT', 'fromMessageId must be a safe integer');
        }
        if (params.offset !== undefined &&
            (!Number.isInteger(params.offset) ||
                params.offset < -100 ||
                params.offset > 100)) {
            throw new TdlibError('INVALID_ARGUMENT', 'offset must be an integer between -100 and 100');
        }
        try {
            const response = await this.sendInternalRequest('getChatHistory', {
                chat_id: params.chatId,
                from_message_id: params.fromMessageId ?? 0,
                offset: params.offset ?? 0,
                limit: params.limit,
                only_local: params.onlyLocal ?? false,
            });
            const totalCount = typeof response.total_count === 'number' ? response.total_count : 0;
            const messages = Array.isArray(response.messages)
                ? response.messages
                : [];
            return Object.freeze({
                total_count: totalCount,
                messages,
            });
        }
        catch (err) {
            if (err instanceof TdlibError && err.code === 'TDLIB_ERROR') {
                if (err.message.includes('not found') || err.message.includes('404')) {
                    throw new TdlibError('NOT_FOUND', 'Chat not found');
                }
            }
            throw err;
        }
    }
    async getMessage(params) {
        this.assertOperational();
        await this.assertReadyForReads();
        if (!Number.isSafeInteger(params.chatId)) {
            throw new TdlibError('INVALID_ARGUMENT', 'chatId must be a safe integer');
        }
        if (!Number.isSafeInteger(params.messageId)) {
            throw new TdlibError('INVALID_ARGUMENT', 'messageId must be a safe integer');
        }
        try {
            const response = await this.sendInternalRequest('getMessage', {
                chat_id: params.chatId,
                message_id: params.messageId,
            });
            return response;
        }
        catch (err) {
            if (err instanceof TdlibError && err.code === 'TDLIB_ERROR') {
                if (err.message.includes('not found') || err.message.includes('404')) {
                    throw new TdlibError('NOT_FOUND', 'Message not found');
                }
            }
            throw err;
        }
    }
    async searchChatMessages(params) {
        this.assertOperational();
        await this.assertReadyForReads();
        if (!Number.isSafeInteger(params.chatId)) {
            throw new TdlibError('INVALID_ARGUMENT', 'chatId must be a safe integer');
        }
        if (!Number.isInteger(params.limit) ||
            params.limit < 1 ||
            params.limit > 100) {
            throw new TdlibError('INVALID_ARGUMENT', 'limit must be an integer between 1 and 100');
        }
        if (params.fromMessageId !== undefined &&
            !Number.isSafeInteger(params.fromMessageId)) {
            throw new TdlibError('INVALID_ARGUMENT', 'fromMessageId must be a safe integer');
        }
        if (params.offset !== undefined &&
            (!Number.isInteger(params.offset) ||
                params.offset < -100 ||
                params.offset > 100)) {
            throw new TdlibError('INVALID_ARGUMENT', 'offset must be an integer between -100 and 100');
        }
        try {
            const response = await this.sendInternalRequest('searchChatMessages', {
                chat_id: params.chatId,
                query: params.query ?? '',
                sender_id: params.senderId ?? null,
                from_message_id: params.fromMessageId ?? 0,
                offset: params.offset ?? 0,
                limit: params.limit,
                filter: params.filter ?? null,
            });
            const totalCount = typeof response.total_count === 'number' ? response.total_count : 0;
            const messages = Array.isArray(response.messages)
                ? response.messages
                : [];
            const nextFromMessageId = typeof response.next_from_message_id === 'number' ||
                typeof response.next_from_message_id === 'string'
                ? response.next_from_message_id
                : 0;
            return Object.freeze({
                total_count: totalCount,
                messages,
                next_from_message_id: nextFromMessageId,
            });
        }
        catch (err) {
            if (err instanceof TdlibError && err.code === 'TDLIB_ERROR') {
                if (err.message.includes('not found') || err.message.includes('404')) {
                    throw new TdlibError('NOT_FOUND', 'Chat not found');
                }
            }
            throw err;
        }
    }
    async searchMessages(params) {
        this.assertOperational();
        await this.assertReadyForReads();
        if (!Number.isInteger(params.limit) ||
            params.limit < 1 ||
            params.limit > 100) {
            throw new TdlibError('INVALID_ARGUMENT', 'limit must be an integer between 1 and 100');
        }
        if (typeof params.query !== 'string' || params.query.length === 0) {
            throw new TdlibError('INVALID_ARGUMENT', 'query must be a non-empty string');
        }
        let chatListPayload = null;
        if (params.chatList === 'main') {
            chatListPayload = { '@type': 'chatListMain' };
        }
        else if (params.chatList === 'archive') {
            chatListPayload = { '@type': 'chatListArchive' };
        }
        const response = await this.sendInternalRequest('searchMessages', {
            chat_list: chatListPayload,
            query: params.query,
            offset: params.offset ?? '',
            limit: params.limit,
            filter: params.filter ?? null,
            chat_type_filter: null,
            min_date: params.minDate ?? 0,
            max_date: params.maxDate ?? 0,
        });
        const totalCount = typeof response.total_count === 'number' ? response.total_count : -1;
        const messages = Array.isArray(response.messages)
            ? response.messages
            : [];
        const nextOffset = typeof response.next_offset === 'string' ? response.next_offset : '';
        return Object.freeze({
            total_count: totalCount,
            messages,
            next_offset: nextOffset,
        });
    }
    async searchPublicChat(username) {
        this.assertOperational();
        await this.assertReadyForReads();
        if (typeof username !== 'string' || username.length === 0) {
            throw new TdlibError('INVALID_ARGUMENT', 'username must be a non-empty string');
        }
        try {
            const response = await this.sendInternalRequest('searchPublicChat', {
                username,
            });
            return response;
        }
        catch (err) {
            if (err instanceof TdlibError && err.code === 'TDLIB_ERROR') {
                if (err.message.includes('not found') || err.message.includes('404')) {
                    throw new TdlibError('NOT_FOUND', 'Public chat not found');
                }
            }
            throw err;
        }
    }
    async searchPublicChats(params) {
        this.assertOperational();
        await this.assertReadyForReads();
        if (typeof params.query !== 'string' || params.query.length === 0) {
            throw new TdlibError('INVALID_ARGUMENT', 'query must be a non-empty string');
        }
        const response = await this.sendInternalRequest('searchPublicChats', {
            query: params.query,
            type_filter: null,
        });
        const totalCount = typeof response.total_count === 'number' ? response.total_count : 0;
        const chatIds = Array.isArray(response.chat_ids)
            ? response.chat_ids
            : [];
        return Object.freeze({
            total_count: totalCount,
            chat_ids: chatIds,
        });
    }
    async searchPublicPosts(params) {
        this.assertOperational();
        await this.assertReadyForReads();
        if (typeof params.query !== 'string' || params.query.length === 0) {
            throw new TdlibError('INVALID_ARGUMENT', 'query must be a non-empty string');
        }
        if (!Number.isInteger(params.limit) ||
            params.limit < 1 ||
            params.limit > 100) {
            throw new TdlibError('INVALID_ARGUMENT', 'limit must be an integer between 1 and 100');
        }
        // STRICT BILLING SAFETY: star_count is ALWAYS 0.
        const response = await this.sendInternalRequest('searchPublicPosts', {
            query: params.query,
            offset: params.offset ?? '',
            limit: params.limit,
            star_count: 0,
        });
        const messages = Array.isArray(response.messages)
            ? response.messages
            : [];
        const nextOffset = typeof response.next_offset === 'string' ? response.next_offset : '';
        const areLimitsExceeded = response.are_limits_exceeded === true;
        return Object.freeze({
            messages,
            next_offset: nextOffset,
            are_limits_exceeded: areLimitsExceeded,
        });
    }
    async searchPublicMessagesByTag(params) {
        this.assertOperational();
        await this.assertReadyForReads();
        if (typeof params.tag !== 'string' || params.tag.length === 0) {
            throw new TdlibError('INVALID_ARGUMENT', 'tag must be a non-empty string');
        }
        if (!Number.isInteger(params.limit) ||
            params.limit < 1 ||
            params.limit > 100) {
            throw new TdlibError('INVALID_ARGUMENT', 'limit must be an integer between 1 and 100');
        }
        const response = await this.sendInternalRequest('searchPublicMessagesByTag', {
            tag: params.tag,
            offset: params.offset ?? '',
            limit: params.limit,
        });
        const totalCount = typeof response.total_count === 'number' ? response.total_count : -1;
        const messages = Array.isArray(response.messages)
            ? response.messages
            : [];
        const nextOffset = typeof response.next_offset === 'string' ? response.next_offset : '';
        return Object.freeze({
            total_count: totalCount,
            messages,
            next_offset: nextOffset,
        });
    }
    async searchContacts(params) {
        this.assertOperational();
        await this.assertReadyForReads();
        if (!Number.isInteger(params.limit) ||
            params.limit < 1 ||
            params.limit > 100) {
            throw new TdlibError('INVALID_ARGUMENT', 'limit must be an integer between 1 and 100');
        }
        const response = await this.sendInternalRequest('searchContacts', {
            query: params.query,
            limit: params.limit,
        });
        const totalCount = typeof response.total_count === 'number' ? response.total_count : 0;
        const userIds = Array.isArray(response.user_ids)
            ? response.user_ids
            : [];
        return Object.freeze({
            total_count: totalCount,
            user_ids: userIds,
        });
    }
    async getUser(userId) {
        this.assertOperational();
        await this.assertReadyForReads();
        if (!Number.isSafeInteger(userId)) {
            throw new TdlibError('INVALID_ARGUMENT', 'userId must be a safe integer');
        }
        try {
            const response = await this.sendInternalRequest('getUser', {
                user_id: userId,
            });
            return response;
        }
        catch (err) {
            if (err instanceof TdlibError && err.code === 'TDLIB_ERROR') {
                if (err.message.includes('not found') || err.message.includes('404')) {
                    throw new TdlibError('NOT_FOUND', 'User not found');
                }
            }
            throw err;
        }
    }
    async getSupergroup(supergroupId) {
        this.assertOperational();
        this.assertPositiveSafeInt(supergroupId, 'supergroupId');
        await this.assertReadyForReads();
        return this.readRequestOnce('getSupergroup', {
            supergroup_id: supergroupId,
        });
    }
    async getSupergroupFullInfo(supergroupId) {
        this.assertOperational();
        this.assertPositiveSafeInt(supergroupId, 'supergroupId');
        await this.assertReadyForReads();
        return this.readRequestOnce('getSupergroupFullInfo', {
            supergroup_id: supergroupId,
        });
    }
    async getChatMember(params) {
        this.assertOperational();
        if (!Number.isSafeInteger(params.chatId) || params.chatId === 0) {
            throw new TdlibError('INVALID_ARGUMENT', 'chatId must be a safe integer');
        }
        this.assertPositiveSafeInt(params.userId, 'userId');
        await this.assertReadyForReads();
        return this.readRequestOnce('getChatMember', {
            chat_id: params.chatId,
            member_id: { '@type': 'messageSenderUser', user_id: params.userId },
        });
    }
    async getSupergroupMembers(params) {
        this.assertOperational();
        this.assertPositiveSafeInt(params.supergroupId, 'supergroupId');
        if (!Number.isInteger(params.offset) ||
            params.offset < 0 ||
            params.offset > MAX_SUPERGROUP_MEMBERS_OFFSET) {
            throw new TdlibError('INVALID_ARGUMENT', 'offset is out of bounds');
        }
        if (!Number.isInteger(params.limit) ||
            params.limit < 1 ||
            params.limit > MAX_SUPERGROUP_MEMBERS_PAGE_LIMIT) {
            throw new TdlibError('INVALID_ARGUMENT', 'limit is out of bounds');
        }
        await this.assertReadyForReads();
        return this.readRequestOnce('getSupergroupMembers', {
            supergroup_id: params.supergroupId,
            filter: { '@type': 'supergroupMembersFilterRecent' },
            offset: params.offset,
            limit: params.limit,
        });
    }
    assertPositiveSafeInt(value, name) {
        if (!Number.isSafeInteger(value) || value <= 0) {
            throw new TdlibError('INVALID_ARGUMENT', `${name} must be a positive safe integer`);
        }
    }
    async readRequestOnce(requestType, payload) {
        try {
            return await this.sendInternalRequest(requestType, payload);
        }
        catch (err) {
            if (err instanceof TdlibError &&
                err.code === 'TDLIB_ERROR' &&
                (err.message.includes('not found') || err.message.includes('404'))) {
                throw new TdlibError('NOT_FOUND', 'Resource not found');
            }
            throw err;
        }
    }
    async getFile(fileId) {
        this.assertOperational();
        await this.assertReadyForReads();
        if (!Number.isInteger(fileId) ||
            fileId < -2_147_483_648 ||
            fileId > 2_147_483_647) {
            throw new TdlibError('INVALID_ARGUMENT', 'fileId must be a 32-bit signed integer');
        }
        try {
            const response = await this.sendInternalRequest('getFile', {
                file_id: fileId,
            });
            return response;
        }
        catch (err) {
            if (err instanceof TdlibError && err.code === 'TDLIB_ERROR') {
                if (err.message.includes('not found') || err.message.includes('404')) {
                    throw new TdlibError('NOT_FOUND', 'File not found');
                }
            }
            throw err;
        }
    }
    async downloadFile(params) {
        this.assertOperational();
        await this.assertReadyForReads();
        if (!Number.isInteger(params.fileId) ||
            params.fileId < -2_147_483_648 ||
            params.fileId > 2_147_483_647) {
            throw new TdlibError('INVALID_ARGUMENT', 'fileId must be a 32-bit signed integer');
        }
        const priority = params.priority ?? 16;
        if (!Number.isInteger(priority) || priority < 1 || priority > 32) {
            throw new TdlibError('INVALID_ARGUMENT', 'priority must be an integer between 1 and 32');
        }
        const offset = params.offset ?? 0;
        if (!Number.isSafeInteger(offset) || offset < 0) {
            throw new TdlibError('INVALID_ARGUMENT', 'offset must be a non-negative safe integer');
        }
        const limit = params.limit ?? 262144;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 262144) {
            throw new TdlibError('INVALID_ARGUMENT', 'limit must be a safe integer between 1 and 262144');
        }
        try {
            const response = await this.sendInternalRequest('downloadFile', {
                file_id: params.fileId,
                priority,
                offset,
                limit,
                synchronous: params.synchronous ?? true,
            });
            return response;
        }
        catch (err) {
            if (err instanceof TdlibError && err.code === 'TDLIB_ERROR') {
                if (err.message.includes('not found') || err.message.includes('404')) {
                    throw new TdlibError('NOT_FOUND', 'File not found');
                }
            }
            throw err;
        }
    }
    async assertReadyForReads() {
        const currentAuth = this.updateSupervisor.getCurrentAuthorizationState() ??
            (await this.getAuthorizationState());
        if (currentAuth !== 'authorizationStateReady') {
            throw new TdlibError('ACCOUNT_NOT_READY', 'Account is not authenticated; read operations require authorizationStateReady');
        }
    }
    assertOperational() {
        if (this.lifecycleState === 'starting') {
            throw new TdlibError('TRANSPORT_NOT_STARTED', 'Adapter is starting');
        }
        if (this.lifecycleState === 'stopped') {
            throw new TdlibError('TRANSPORT_NOT_STARTED', 'TdlibAdapter is not started');
        }
        if (this.lifecycleState === 'closed' ||
            this.lifecycleState === 'stopping') {
            throw new TdlibError('TRANSPORT_STOPPED', 'TdlibAdapter is stopped');
        }
        if (this.lifecycleState === 'failed') {
            throw new TdlibError('TRANSPORT_FAILED', 'TdlibAdapter has failed');
        }
    }
    getAdapterLifecycleState() {
        return this.lifecycleState;
    }
    unsubscribeFromTransport() {
        this.unsubscribeTransport?.();
        this.unsubscribeTransport = null;
    }
    generateCorrelationId() {
        this.requestSeq++;
        const randomSuffix = Math.random().toString(36).slice(2, 10);
        return `p3a_${String(this.requestSeq)}_${randomSuffix}`;
    }
    async sendInternalRequest(requestType, params = {}) {
        assertReadRpc(requestType);
        this.assertOperational();
        if (this.pendingRequests.size >= this.maxPendingRequests) {
            this.lastErrorType = 'OVERFLOW';
            throw new TdlibError('PENDING_REQUEST_OVERFLOW', `Maximum pending requests (${String(this.maxPendingRequests)}) exceeded`);
        }
        const extra = this.generateCorrelationId();
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(extra);
                this.lastErrorType = 'TIMEOUT';
                reject(new TdlibError('REQUEST_TIMEOUT', `Request timed out after ${String(this.requestTimeoutMs)}ms waiting for response`));
            }, this.requestTimeoutMs);
            if (typeof timer.unref === 'function') {
                timer.unref();
            }
            this.pendingRequests.set(extra, {
                extra,
                requestType,
                resolve,
                reject,
                timer,
            });
            const failSend = () => {
                if (!this.pendingRequests.has(extra))
                    return;
                clearTimeout(timer);
                this.pendingRequests.delete(extra);
                this.lastErrorType = 'TRANSPORT_ERROR';
                reject(new TdlibError('TRANSPORT_FAILED', 'Failed to send request via transport'));
            };
            try {
                void this.transport
                    .send({
                    ...params,
                    '@type': requestType,
                    '@extra': extra,
                })
                    .catch(failSend);
            }
            catch {
                failSend();
            }
        });
    }
    handleTransportEvent(event) {
        switch (event.kind) {
            case 'response': {
                const pending = this.pendingRequests.get(event.extra);
                if (!pending) {
                    // Unknown or duplicate late response: safely ignored
                    return;
                }
                clearTimeout(pending.timer);
                this.pendingRequests.delete(event.extra);
                const payload = event.payload;
                if (payload['@type'] === 'error') {
                    this.lastErrorType = 'INTERNAL_ERROR';
                    const code = payload.code;
                    const message = payload.message;
                    pending.reject(new TdlibError('TDLIB_ERROR', sanitizeTdlibErrorMessage(code, message)));
                }
                else {
                    pending.resolve(payload);
                }
                break;
            }
            case 'update': {
                if (event.payload['@type'] === 'updateAuthorizationState')
                    this.privateIdentityEpoch++;
                this.updateSupervisor.handleUpdate(event.payload);
                break;
            }
            case 'lifecycle': {
                this.privateIdentityEpoch++;
                if (event.state === 'closed' || event.state === 'failed') {
                    this.lifecycleState = event.state;
                    if (event.state === 'failed')
                        this.lastErrorType = 'TRANSPORT_ERROR';
                    this.updateSupervisor.stop();
                    this.cleanupPendingRequests(event.state === 'failed' ? 'TRANSPORT_FAILED' : 'TRANSPORT_STOPPED', 'Transport closed or failed');
                }
                break;
            }
            case 'error': {
                this.privateIdentityEpoch++;
                this.lastErrorType = 'TRANSPORT_ERROR';
                break;
            }
        }
    }
    cleanupPendingRequests(code, reason) {
        for (const pending of this.pendingRequests.values()) {
            clearTimeout(pending.timer);
            pending.reject(new TdlibError(code, reason));
        }
        this.pendingRequests.clear();
    }
    extractAuthorizationState(response) {
        const directType = response['@type'];
        if (isTdlibAuthorizationState(directType)) {
            return directType;
        }
        const nested = response.authorization_state;
        if (typeof nested === 'object' && nested !== null) {
            const nestedType = nested['@type'];
            if (isTdlibAuthorizationState(nestedType)) {
                return nestedType;
            }
        }
        return null;
    }
}
