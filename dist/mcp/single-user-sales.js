import { z } from 'zod';
import { parseAndValidateSafeId } from '../domain/common/id-validator.js';
import { GROUP_PRIORITIES, LEAD_STAGES, } from '../sales/local-sales-store.js';
import { ALLOWED_TEMPLATE_VARS, renderTemplate, validateTemplateText, } from '../sales/quick-reply-template.js';
export const SALES_TOOL_NAMES = Object.freeze([
    'telegram_sales_lead_upsert',
    'telegram_sales_lead_get',
    'telegram_sales_leads_list',
    'telegram_sales_group_track',
    'telegram_sales_groups_list',
    'telegram_sales_quick_reply_upsert',
    'telegram_sales_quick_replies_list',
    'telegram_sales_quick_reply_preview',
]);
const boundedText = (max, min = 0) => z
    .string()
    .refine((value) => Array.from(value).length >= min && Array.from(value).length <= max);
const userId = z.string().superRefine((value, ctx) => {
    try {
        parseAndValidateSafeId(value, 'user_id');
    }
    catch {
        ctx.addIssue({ code: 'custom', message: 'Invalid user_id' });
    }
});
const chatId = z.string().superRefine((value, ctx) => {
    try {
        parseAndValidateSafeId(value, 'chat_id');
    }
    catch {
        ctx.addIssue({ code: 'custom', message: 'Invalid chat_id' });
    }
});
const tagList = z.array(boundedText(40, 1)).max(8);
const stage = z.enum(LEAD_STAGES);
const priority = z.enum(GROUP_PRIORITIES).nullable();
const futureOrNullIso = z
    .string()
    .nullable()
    .refine((value) => {
    if (value === null)
        return true;
    const parsed = Date.parse(value);
    return !Number.isNaN(parsed) && parsed > Date.now();
}, 'next_followup_at must be a valid ISO date string in the future, or null');
const isoDateString = z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'must be a valid ISO date string');
const templateCode = z.string().regex(/^[a-z0-9_-]{1,64}$/);
const requestKey = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
const positiveMessageId = z
    .string()
    .regex(/^[1-9]\d*$/)
    .refine((value) => Number.isSafeInteger(Number(value)));
const templateVariables = z
    .object({
    customer: boundedText(200).optional(),
    route: boundedText(200).optional(),
    date: boundedText(200).optional(),
    fare: boundedText(200).optional(),
})
    .strict();
function denyResult(errorCode) {
    const result = { ok: false, error_code: errorCode };
    return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
    };
}
function okResult(result) {
    return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
    };
}
/** Eight local tools, never a Telegram sender. */
export function registerSalesTools(server, store) {
    server.registerTool('telegram_sales_lead_upsert', {
        description: 'Creates or updates a local sales lead keyed by Telegram user_id. Unseen fields are preserved across partial edits. Local SQLite CRM data only; never sends anything.',
        inputSchema: z
            .object({
            user_id: userId,
            display_name: boundedText(120).optional(),
            stage: stage.optional(),
            tags: tagList.optional(),
            notes: boundedText(2000).optional(),
            next_followup_at: futureOrNullIso.optional(),
        })
            .strict(),
    }, 
    // eslint-disable-next-line @typescript-eslint/require-await
    async (args) => {
        try {
            const record = store.upsertLead({
                userId: args.user_id,
                displayName: args.display_name,
                stage: args.stage,
                tags: args.tags,
                notes: args.notes,
                nextFollowupAt: args.next_followup_at,
            });
            return okResult({ ok: true, lead: record });
        }
        catch {
            return denyResult('SALES_STORE_UNAVAILABLE');
        }
    });
    server.registerTool('telegram_sales_lead_get', {
        description: 'Reads a single local sales lead by Telegram user_id. Returns not found when no local row exists; never queries Telegram.',
        inputSchema: z.object({ user_id: userId }).strict(),
    }, 
    // eslint-disable-next-line @typescript-eslint/require-await
    async (args) => {
        try {
            const record = store.getLead(args.user_id);
            return okResult({ ok: true, found: Boolean(record), lead: record ?? null });
        }
        catch {
            return denyResult('SALES_STORE_UNAVAILABLE');
        }
    });
    server.registerTool('telegram_sales_leads_list', {
        description: 'Lists local sales leads with optional stage/name/due filters, bounded to 50 rows, ordered by follow-up due date then recency. Local SQLite only.',
        inputSchema: z
            .object({
            stage: stage.optional(),
            search_name: boundedText(120).optional(),
            due_before: isoDateString.optional(),
            limit: z.number().int().min(1).max(50).default(20),
        })
            .strict(),
    }, 
    // eslint-disable-next-line @typescript-eslint/require-await
    async (args) => {
        try {
            const records = store.listLeads({
                stage: args.stage,
                searchName: args.search_name,
                dueBefore: args.due_before,
                limit: args.limit,
            });
            return okResult({ ok: true, leads: records });
        }
        catch {
            return denyResult('SALES_STORE_UNAVAILABLE');
        }
    });
    server.registerTool('telegram_sales_group_track', {
        description: 'Creates or updates a local tracker entry for a Telegram chat_id (label/purpose/tags/note). Local bookkeeping only — this never mutates Telegram group membership, admin rights, or settings.',
        inputSchema: z
            .object({
            chat_id: chatId,
            label: boundedText(120).optional(),
            purpose: boundedText(200).optional(),
            tags: tagList.optional(),
            note: boundedText(1000).optional(),
            priority: priority.optional(),
        })
            .strict(),
    }, 
    // eslint-disable-next-line @typescript-eslint/require-await
    async (args) => {
        try {
            const record = store.upsertGroup({
                chatId: args.chat_id,
                label: args.label,
                purpose: args.purpose,
                tags: args.tags,
                note: args.note,
                priority: args.priority,
            });
            return okResult({ ok: true, group: record });
        }
        catch {
            return denyResult('SALES_STORE_UNAVAILABLE');
        }
    });
    server.registerTool('telegram_sales_groups_list', {
        description: 'Lists local group-tracker entries with optional label/purpose/tag filters, bounded to 50 rows. Local SQLite only; no Telegram admin surface.',
        inputSchema: z
            .object({
            query: boundedText(200).optional(),
            tag: boundedText(40).optional(),
            limit: z.number().int().min(1).max(50).default(20),
        })
            .strict(),
    }, 
    // eslint-disable-next-line @typescript-eslint/require-await
    async (args) => {
        try {
            const records = store.listGroups({
                query: args.query,
                tag: args.tag,
                limit: args.limit,
            });
            return okResult({ ok: true, groups: records });
        }
        catch {
            return denyResult('SALES_STORE_UNAVAILABLE');
        }
    });
    server.registerTool('telegram_sales_quick_reply_upsert', {
        description: 'Creates or updates a local quick-reply template. Only {{customer}}, {{route}}, {{date}}, {{fare}} placeholders are allowed; any other interpolation syntax is rejected.',
        inputSchema: z
            .object({
            code: templateCode,
            title: boundedText(100, 1),
            text: boundedText(4096, 1),
        })
            .strict(),
    }, 
    // eslint-disable-next-line @typescript-eslint/require-await
    async (args) => {
        try {
            validateTemplateText(args.text);
            const record = store.upsertQuickReply(args);
            return okResult({ ok: true, template: record });
        }
        catch {
            return denyResult('INVALID_TEMPLATE');
        }
    });
    server.registerTool('telegram_sales_quick_replies_list', {
        description: 'Lists saved local quick-reply templates (code/title/text), bounded to 50 rows.',
        inputSchema: z.object({}).strict(),
    }, 
    // eslint-disable-next-line @typescript-eslint/require-await
    async () => {
        try {
            const records = store.listQuickReplies(50);
            return okResult({ ok: true, templates: records });
        }
        catch {
            return denyResult('SALES_STORE_UNAVAILABLE');
        }
    });
    server.registerTool('telegram_sales_quick_reply_preview', {
        description: 'Renders a saved quick-reply template with the given bounded variables and returns the final text WITHOUT sending anything. Fails if a required placeholder variable is missing.',
        inputSchema: z
            .object({
            template_code: templateCode,
            variables: templateVariables.optional(),
        })
            .strict(),
    }, 
    // eslint-disable-next-line @typescript-eslint/require-await
    async (args) => {
        const template = store.getQuickReply(args.template_code);
        if (!template) {
            return denyResult('TEMPLATE_NOT_FOUND');
        }
        const rendered = renderTemplate(template.text, (args.variables ?? {}));
        if (rendered.missingVars.length > 0) {
            return denyResult('MISSING_TEMPLATE_VARS');
        }
        return okResult({
            ok: true,
            final_text: rendered.finalText,
            matched_vars: rendered.matchedVars,
        });
    });
}
export { ALLOWED_TEMPLATE_VARS };
