import { TdlibAdapter } from '../telegram/tdlib/adapter.js';
import { AccountService, ChatsService, MessagesService, SearchService, ContactsService, FileService } from '../domain/index.js';
/** Programmatic integration seam. No native process or login provided by this module. */
export function createReadSession(transport) {
    const adapter = new TdlibAdapter({ transport });
    const accountService = new AccountService(adapter);
    return Object.freeze({ adapter, accountService,
        chatsService: new ChatsService(adapter), messagesService: new MessagesService(adapter),
        searchService: new SearchService(adapter), contactsService: new ContactsService(adapter),
        fileService: new FileService(adapter), start: () => accountService.start(), stop: () => accountService.stop(),
    });
}
