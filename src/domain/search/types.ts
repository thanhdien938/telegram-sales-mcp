import type { NormalizedChatSummary } from '../chats/types.js';
import type { NormalizedMessage } from '../messages/types.js';

export const MESSAGE_SEARCH_FILTERS = [
  'all',
  'photo',
  'video',
  'photo_and_video',
  'document',
  'audio',
  'voice_note',
  'voice_and_video_note',
  'animation',
  'url',
  'chat_photo',
  'video_note',
] as const;

export type MessageSearchFilter = (typeof MESSAGE_SEARCH_FILTERS)[number];

export function isMessageSearchFilter(
  val: unknown,
): val is MessageSearchFilter {
  return (
    typeof val === 'string' &&
    (MESSAGE_SEARCH_FILTERS as readonly string[]).includes(val)
  );
}

export type MessageSearchScope = 'chat' | 'account';

export interface SearchMessagesChatOptions {
  readonly scope: 'chat';
  readonly chatId?: string | undefined;
  readonly chat_id?: string | undefined;
  readonly query?: string | undefined;
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
  readonly senderUserId?: string | undefined;
  readonly sender_user_id?: string | undefined;
  readonly sender?: string | undefined;
  readonly filter?: MessageSearchFilter | undefined;
}

export interface SearchMessagesAccountOptions {
  readonly scope: 'account';
  readonly query: string;
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
  readonly chatList?: 'main' | 'archive' | 'all' | undefined;
  readonly chat_list?: 'main' | 'archive' | 'all' | undefined;
  readonly minDate?: number | undefined;
  readonly min_date?: number | undefined;
  readonly maxDate?: number | undefined;
  readonly max_date?: number | undefined;
  readonly filter?: MessageSearchFilter | undefined;
  readonly sender?: string | undefined;
  readonly sender_user_id?: string | undefined;
  readonly senderUserId?: string | undefined;
}

export type SearchMessagesOptions =
  SearchMessagesChatOptions | SearchMessagesAccountOptions;

export interface SearchMessagesResult {
  readonly scope: 'chat' | 'account';
  readonly messages: readonly NormalizedMessage[];
  /**
   * Approximate total count of matching messages, or null if unknown (-1 from provider).
   */
  readonly approximate_total_count: number | null;
  /**
   * Opaque versioned continuation cursor, or null if authoritative EOF reached.
   */
  readonly next_cursor: string | null;
}

export type PublicSearchMode = 'username' | 'chats' | 'posts' | 'tag';

export interface PublicSearchUsernameOptions {
  readonly mode: 'username';
  readonly username: string;
}

export interface PublicSearchChatsOptions {
  readonly mode: 'chats';
  readonly query: string;
  readonly limit?: number | undefined;
}

export interface PublicSearchPostsOptions {
  readonly mode: 'posts';
  readonly query: string;
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
}

export interface PublicSearchTagOptions {
  readonly mode: 'tag';
  /**
   * Tag to search for.
   * Can be a hashtag with '#' (e.g. '#news'), a bare tag (treated as hashtag '#news'),
   * or a cashtag with '$' (e.g. '$TSLA'). Preserves hashtag vs cashtag identity.
   */
  readonly tag: string;
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
}

export type PublicSearchOptions =
  | PublicSearchUsernameOptions
  | PublicSearchChatsOptions
  | PublicSearchPostsOptions
  | PublicSearchTagOptions;

export type PublicSearchResult =
  | {
      readonly mode: 'username';
      readonly chat: NormalizedChatSummary;
    }
  | {
      readonly mode: 'chats';
      readonly chats: readonly NormalizedChatSummary[];
      readonly returned_count: number;
      readonly approximate_total_count: number;
    }
  | {
      readonly mode: 'posts';
      readonly messages: readonly NormalizedMessage[];
      readonly next_cursor: string | null;
    }
  | {
      readonly mode: 'tag';
      readonly messages: readonly NormalizedMessage[];
      readonly approximate_total_count: number | null;
      readonly next_cursor: string | null;
    };
