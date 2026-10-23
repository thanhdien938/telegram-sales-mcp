/**
 * Local, single-owner sales CRM store. Holds only user-entered business
 * notes (leads, tracked-group labels, quick-reply templates) in a SQLite
 * file the operator points at explicitly. Never scrapes or imports real
 * Telegram contact/profile data; every row here is typed in by the owner.
 */
export declare const LEAD_STAGES: readonly ["NEW", "CONTACTED", "QUOTED", "BOOKED", "LOST"];
export type LeadStage = (typeof LEAD_STAGES)[number];
export declare const GROUP_PRIORITIES: readonly ["LOW", "MEDIUM", "HIGH"];
export type GroupPriority = (typeof GROUP_PRIORITIES)[number];
export interface LeadRecord {
    readonly userId: string;
    readonly displayName: string;
    readonly stage: LeadStage;
    readonly tags: readonly string[];
    readonly notes: string;
    readonly nextFollowupAt: string | null;
    readonly updatedAt: string;
}
export interface LeadUpsertInput {
    readonly userId: string;
    readonly displayName?: string | undefined;
    readonly stage?: LeadStage | undefined;
    readonly tags?: readonly string[] | undefined;
    readonly notes?: string | undefined;
    readonly nextFollowupAt?: string | null | undefined;
}
export interface LeadsListQuery {
    readonly stage?: LeadStage | undefined;
    readonly searchName?: string | undefined;
    readonly dueBefore?: string | undefined;
    readonly limit: number;
}
export interface TrackedGroupRecord {
    readonly chatId: string;
    readonly label: string;
    readonly purpose: string;
    readonly tags: readonly string[];
    readonly note: string;
    readonly priority: GroupPriority | null;
    readonly updatedAt: string;
}
export interface TrackedGroupUpsertInput {
    readonly chatId: string;
    readonly label?: string | undefined;
    readonly purpose?: string | undefined;
    readonly tags?: readonly string[] | undefined;
    readonly note?: string | undefined;
    readonly priority?: GroupPriority | null | undefined;
}
export interface TrackedGroupsListQuery {
    readonly query?: string | undefined;
    readonly tag?: string | undefined;
    readonly limit: number;
}
export interface QuickReplyRecord {
    readonly code: string;
    readonly title: string;
    readonly text: string;
    readonly updatedAt: string;
}
export declare class LocalSalesStore {
    private readonly db;
    constructor(path: string);
    close(): void;
    upsertLead(input: LeadUpsertInput): LeadRecord;
    getLead(userId: string): LeadRecord | undefined;
    listLeads(query: LeadsListQuery): LeadRecord[];
    upsertGroup(input: TrackedGroupUpsertInput): TrackedGroupRecord;
    getGroup(chatId: string): TrackedGroupRecord | undefined;
    listGroups(query: TrackedGroupsListQuery): TrackedGroupRecord[];
    upsertQuickReply(input: {
        readonly code: string;
        readonly title: string;
        readonly text: string;
    }): QuickReplyRecord;
    getQuickReply(code: string): QuickReplyRecord | undefined;
    listQuickReplies(limit: number): QuickReplyRecord[];
}
