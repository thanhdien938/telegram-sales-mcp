import type { ITdlibAdapter } from '../../telegram/tdlib/adapter.js';
import { type PublicSearchOptions, type PublicSearchResult, type SearchMessagesOptions, type SearchMessagesResult } from './types.js';
export declare class SearchService {
    private readonly adapter;
    constructor(adapter: ITdlibAdapter);
    searchMessages(options: SearchMessagesOptions): Promise<SearchMessagesResult>;
    searchPublic(options: PublicSearchOptions): Promise<PublicSearchResult>;
}
