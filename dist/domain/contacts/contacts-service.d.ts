import type { ITdlibAdapter } from '../../telegram/tdlib/adapter.js';
import type { ContactsOptions, ContactsResult, NormalizedContact } from './types.js';
export declare function normalizeContact(rawUser: Readonly<Record<string, unknown>>): NormalizedContact;
export declare class ContactsService {
    private readonly adapter;
    constructor(adapter: ITdlibAdapter);
    getContacts(options: ContactsOptions): Promise<ContactsResult>;
}
