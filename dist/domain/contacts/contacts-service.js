import { DomainError } from '../common/errors.js';
import { parseAndValidateSafeId } from '../common/id-validator.js';
function isNotFoundError(err) {
    if (err instanceof DomainError && err.code === 'NOT_FOUND') {
        return true;
    }
    if (typeof err === 'object' && err !== null && 'code' in err) {
        return err.code === 'NOT_FOUND';
    }
    return false;
}
function toSafeString(val, fallback = '') {
    if (typeof val === 'string') {
        return val;
    }
    if (typeof val === 'number' || typeof val === 'bigint') {
        return String(val);
    }
    return fallback;
}
export function normalizeContact(rawUser) {
    const userId = toSafeString(rawUser.id, '0');
    const firstName = typeof rawUser.first_name === 'string' ? rawUser.first_name : '';
    const lastName = typeof rawUser.last_name === 'string' ? rawUser.last_name : '';
    let activeUsernames = [];
    const usernamesObj = rawUser.usernames;
    if (typeof usernamesObj === 'object' && usernamesObj !== null) {
        const u = usernamesObj;
        if (Array.isArray(u.active_usernames)) {
            activeUsernames = Object.freeze(u.active_usernames.filter((item) => typeof item === 'string'));
        }
    }
    const isContact = rawUser.is_contact === true;
    const isMutualContact = rawUser.is_mutual_contact === true;
    const isPremium = rawUser.is_premium === true;
    const haveAccess = rawUser.have_access === true;
    let userType = 'unknown';
    let isBot = false;
    const typeObj = rawUser.type;
    if (typeof typeObj === 'object' && typeObj !== null) {
        const t = typeObj;
        const tType = t['@type'];
        if (tType === 'userTypeRegular') {
            userType = 'regular';
        }
        else if (tType === 'userTypeBot') {
            userType = 'bot';
            isBot = true;
        }
        else if (tType === 'userTypeDeleted') {
            userType = 'deleted';
        }
    }
    // CRITICAL PRIVACY: The raw phone number string is NEVER exposed in P4B.
    const phoneNumberPresent = typeof rawUser.phone_number === 'string' &&
        rawUser.phone_number.trim().length > 0;
    return Object.freeze({
        user_id: userId,
        first_name: firstName,
        last_name: lastName,
        active_usernames: activeUsernames,
        is_contact: isContact,
        is_mutual_contact: isMutualContact,
        is_premium: isPremium,
        have_access: haveAccess,
        user_type: userType,
        is_bot: isBot,
        phone_number_present: phoneNumberPresent,
    });
}
export class ContactsService {
    adapter;
    constructor(adapter) {
        this.adapter = adapter;
    }
    async getContacts(options) {
        const limit = options.limit ?? 20;
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
            throw new DomainError('INVALID_ARGUMENT', 'limit must be an integer between 1 and 100');
        }
        let query = '';
        if (options.mode === 'search') {
            if (typeof options.query !== 'string' ||
                options.query.trim().length === 0) {
                throw new DomainError('INVALID_ARGUMENT', 'query is required and cannot be empty when mode is "search"');
            }
            if (options.query.length > 100) {
                throw new DomainError('INVALID_ARGUMENT', 'query exceeds maximum length of 100 characters');
            }
            query = options.query;
        }
        const rawUsers = await this.adapter.searchContacts({
            query,
            limit,
        });
        const contacts = [];
        for (const rawUserId of rawUsers.user_ids) {
            const parsedId = parseAndValidateSafeId(String(rawUserId), 'user_id');
            try {
                const rawUser = await this.adapter.getUser(parsedId.numberId);
                contacts.push(normalizeContact(rawUser));
            }
            catch (err) {
                if (isNotFoundError(err)) {
                    // Explicit NOT_FOUND is safely skipped
                    continue;
                }
                // Transport, auth, timeout and internal provider errors must propagate
                throw err;
            }
        }
        const rawIdsLength = rawUsers.user_ids.length;
        const approximateTotal = typeof rawUsers.total_count === 'number' ? rawUsers.total_count : 0;
        // Conservative possibility semantics per pinned td_api.tl (Users.total_count is approximate):
        // 1. Full provider page (rawIdsLength >= limit): more results may exist -> true.
        // 2. Short provider page (rawIdsLength < limit) with approximateTotal > rawIdsLength: more may exist -> true.
        // 3. Short provider page with approximateTotal <= rawIdsLength: no more results -> false.
        // Note: NOT_FOUND normalization skips in the loop above do not affect rawIdsLength.
        const moreResultsPossible = rawIdsLength >= limit || approximateTotal > rawIdsLength;
        return Object.freeze({
            mode: options.mode,
            contacts: Object.freeze(contacts),
            returned_count: contacts.length,
            approximate_total_count: rawUsers.total_count,
            more_results_possible: moreResultsPossible,
        });
    }
}
