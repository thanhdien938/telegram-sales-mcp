export interface PortableOptions {
    state: string;
    nativeManifest: string;
    python: string;
}
export declare function loginPortable(options: PortableOptions, signal?: AbortSignal): Promise<void>;
export declare const reopenPortable: (options: PortableOptions, signal?: AbortSignal, writesEnabled?: boolean) => Promise<Readonly<{
    services: {
        accountService: import("../domain/index.js").AccountService;
        chatsService: import("../domain/index.js").ChatsService;
        messagesService: import("../domain/index.js").MessagesService;
        searchService: import("../domain/index.js").SearchService;
        contactsService: import("../domain/index.js").ContactsService;
        fileService: import("../domain/index.js").FileService;
    };
    adapter: import("../telegram/tdlib/adapter.js").TdlibAdapter;
    accountService: import("../domain/index.js").AccountService;
    stop: () => Promise<void>;
}>>;
export declare function parsePortableOptions(args: readonly string[]): PortableOptions;
