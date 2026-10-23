export type ContactUserType = 'regular' | 'bot' | 'deleted' | 'unknown';
export interface NormalizedContact {
    readonly user_id: string;
    readonly first_name: string;
    readonly last_name: string;
    readonly active_usernames: readonly string[];
    readonly is_contact: boolean;
    readonly is_mutual_contact: boolean;
    readonly is_premium: boolean;
    readonly have_access: boolean;
    readonly user_type: ContactUserType;
    readonly is_bot: boolean;
    /**
     * Safe privacy fact indicating whether a phone number is registered.
     * The raw phone number string is strictly redacted and NEVER exposed in P4B.
     */
    readonly phone_number_present: boolean;
}
export type ContactsMode = 'list' | 'search';
export interface ContactsListOptions {
    readonly mode: 'list';
    readonly limit?: number | undefined;
}
export interface ContactsSearchOptions {
    readonly mode: 'search';
    readonly query: string;
    readonly limit?: number | undefined;
}
export type ContactsOptions = ContactsListOptions | ContactsSearchOptions;
export interface ContactsResult {
    readonly mode: ContactsMode;
    readonly contacts: readonly NormalizedContact[];
    readonly returned_count: number;
    /**
     * Approximate total number of users found as reported by TDLib provider.
     * Note: This is an approximate estimate per pinned td_api.tl Users definition.
     */
    readonly approximate_total_count: number;
    /**
     * Conservative indicator whether additional results may be possible.
     * True if raw provider page is full (raw_count >= limit) or approximate_total_count > raw_count.
     * Note: This is a conservative heuristic, not an authoritative pagination cursor.
     */
    readonly more_results_possible: boolean;
}
