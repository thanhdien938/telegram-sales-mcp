import { TdlibAdapter } from '../telegram/tdlib/adapter.js';
import type { ITdlibTransport } from '../telegram/tdlib/transport.js';
import { AccountService, ChatsService, MessagesService, SearchService, ContactsService, FileService } from '../domain/index.js';
/** Programmatic integration seam. No native process or login provided by this module. */
export declare function createReadSession(transport: ITdlibTransport): Readonly<{
    adapter: TdlibAdapter;
    accountService: AccountService;
    chatsService: ChatsService;
    messagesService: MessagesService;
    searchService: SearchService;
    contactsService: ContactsService;
    fileService: FileService;
    start: () => Promise<void>;
    stop: () => Promise<void>;
}>;
