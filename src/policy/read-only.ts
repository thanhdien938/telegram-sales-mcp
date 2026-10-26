export const READ_RPC = new Set([
  'getAuthorizationState', 'getMe', 'loadChats', 'getChats', 'getChat',
  'getChatHistory', 'getMessage', 'searchChatMessages', 'searchMessages',
  'searchPublicChat', 'searchPublicChats', 'searchPublicPosts',
  'searchPublicMessagesByTag', 'searchContacts', 'getUser', 'getFile',
  'getBasicGroup', 'getSupergroup', 'getSupergroupFullInfo', 'getBasicGroupFullInfo',
  'getChatMember', 'getSupergroupMembers', 'getChatAdministrators', 'close',
]);

export const WRITE_RPC = new Set([
  'sendMessage', 'sendMessageAlbum', 'editMessageText', 'editMessageCaption',
  'deleteMessages', 'forwardMessages', 'addMessageReaction', 'removeMessageReaction',
  'pinChatMessage', 'unpinChatMessage', 'viewMessages', 'setMessageSchedulingState',
  'downloadFile',
]);

export class PublicWriteDisabledError extends Error {
  readonly code = 'PUBLIC_TELEGRAM_WRITES_DISABLED';
  constructor(message = 'Telegram dispatch is disabled in this profile') {
    super(message);
  }
}

export function denyTelegramWrite(): void {
  throw new PublicWriteDisabledError();
}

export function assertReadRpc(method: unknown): void {
  if (typeof method !== 'string' || !READ_RPC.has(method)) {
    denyTelegramWrite();
  }
}

export function assertRpcAllowed(method: unknown, writesEnabled = false): void {
  if (typeof method !== 'string') {
    denyTelegramWrite();
  }
  if (READ_RPC.has(method as string)) {
    return;
  }
  if (writesEnabled && WRITE_RPC.has(method as string)) {
    return;
  }
  denyTelegramWrite();
}

export function isWriteRpc(method: unknown): boolean {
  return typeof method === 'string' && WRITE_RPC.has(method);
}
