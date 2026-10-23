/** No enable flag, credential, model field or environment switch can widen this policy. */
const READ_RPC = new Set([
  'getAuthorizationState', 'getMe', 'loadChats', 'getChats', 'getChat',
  'getChatHistory', 'getMessage', 'searchChatMessages', 'searchMessages',
  'searchPublicChat', 'searchPublicChats', 'searchPublicPosts',
  'searchPublicMessagesByTag', 'searchContacts', 'getUser', 'getFile',
  'getBasicGroup', 'getSupergroup', 'getSupergroupFullInfo', 'getBasicGroupFullInfo',
  'getChatMember', 'getSupergroupMembers', 'getChatAdministrators', 'close',
]);
export class PublicWriteDisabledError extends Error {
  readonly code = 'PUBLIC_TELEGRAM_WRITES_DISABLED';
  constructor() { super('Telegram dispatch is disabled in this source beta'); }
}
export function denyTelegramWrite(): void { throw new PublicWriteDisabledError(); }
export function assertReadRpc(method: unknown): void {
  if (typeof method !== 'string' || !READ_RPC.has(method)) denyTelegramWrite();
}
