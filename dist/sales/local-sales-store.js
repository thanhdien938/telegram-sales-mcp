import { DatabaseSync } from 'node:sqlite';
/**
 * Local, single-owner sales CRM store. Holds only user-entered business
 * notes (leads, tracked-group labels, quick-reply templates) in a SQLite
 * file the operator points at explicitly. Never scrapes or imports real
 * Telegram contact/profile data; every row here is typed in by the owner.
 */
export const LEAD_STAGES = Object.freeze([
    'NEW',
    'CONTACTED',
    'QUOTED',
    'BOOKED',
    'LOST',
]);
export const GROUP_PRIORITIES = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);
function parseTags(raw) {
    if (typeof raw !== 'string')
        return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
            ? parsed.filter((v) => typeof v === 'string')
            : [];
    }
    catch {
        return [];
    }
}
function decodeLead(row) {
    return {
        userId: row.user_id,
        displayName: row.display_name,
        stage: row.stage,
        tags: parseTags(row.tags),
        notes: row.notes,
        nextFollowupAt: row.next_followup_at,
        updatedAt: row.updated_at,
    };
}
function decodeGroup(row) {
    return {
        chatId: row.chat_id,
        label: row.label,
        purpose: row.purpose,
        tags: parseTags(row.tags),
        note: row.note,
        priority: row.priority,
        updatedAt: row.updated_at,
    };
}
function decodeQuickReply(row) {
    return {
        code: row.code,
        title: row.title,
        text: row.text,
        updatedAt: row.updated_at,
    };
}
export class LocalSalesStore {
    db;
    constructor(path) {
        this.db = new DatabaseSync(path);
        this.db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS local_leads (
        user_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        stage TEXT NOT NULL,
        tags TEXT NOT NULL,
        notes TEXT NOT NULL,
        next_followup_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_local_leads_stage ON local_leads(stage);
      CREATE INDEX IF NOT EXISTS idx_local_leads_next_followup ON local_leads(next_followup_at);

      CREATE TABLE IF NOT EXISTS tracked_groups (
        chat_id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        purpose TEXT NOT NULL,
        tags TEXT NOT NULL,
        note TEXT NOT NULL,
        priority TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tracked_groups_label ON tracked_groups(label);

      CREATE TABLE IF NOT EXISTS quick_replies (
        code TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    }
    close() {
        this.db.close();
    }
    upsertLead(input) {
        const existing = this.getLead(input.userId);
        const merged = {
            userId: input.userId,
            displayName: input.displayName ?? existing?.displayName ?? '',
            stage: input.stage ?? existing?.stage ?? 'NEW',
            tags: input.tags ?? existing?.tags ?? [],
            notes: input.notes ?? existing?.notes ?? '',
            nextFollowupAt: input.nextFollowupAt !== undefined
                ? input.nextFollowupAt
                : (existing?.nextFollowupAt ?? null),
            updatedAt: new Date().toISOString(),
        };
        this.db
            .prepare(`INSERT INTO local_leads (user_id, display_name, stage, tags, notes, next_followup_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           display_name=excluded.display_name,
           stage=excluded.stage,
           tags=excluded.tags,
           notes=excluded.notes,
           next_followup_at=excluded.next_followup_at,
           updated_at=excluded.updated_at`)
            .run(merged.userId, merged.displayName, merged.stage, JSON.stringify(merged.tags), merged.notes, merged.nextFollowupAt, merged.updatedAt);
        return merged;
    }
    getLead(userId) {
        const row = this.db
            .prepare('SELECT * FROM local_leads WHERE user_id = ?')
            .get(userId);
        return row ? decodeLead(row) : undefined;
    }
    listLeads(query) {
        const clauses = [];
        const params = [];
        if (query.stage) {
            clauses.push('stage = ?');
            params.push(query.stage);
        }
        if (query.searchName) {
            clauses.push('LOWER(display_name) LIKE ?');
            params.push(`%${query.searchName.toLowerCase()}%`);
        }
        if (query.dueBefore) {
            clauses.push('next_followup_at IS NOT NULL AND next_followup_at <= ?');
            params.push(query.dueBefore);
        }
        const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
        const rows = this.db
            .prepare(`SELECT * FROM local_leads ${where}
         ORDER BY (next_followup_at IS NULL) ASC, next_followup_at ASC, updated_at DESC
         LIMIT ?`)
            .all(...params, query.limit);
        return rows.map(decodeLead);
    }
    upsertGroup(input) {
        const existing = this.getGroup(input.chatId);
        const merged = {
            chatId: input.chatId,
            label: input.label ?? existing?.label ?? '',
            purpose: input.purpose ?? existing?.purpose ?? '',
            tags: input.tags ?? existing?.tags ?? [],
            note: input.note ?? existing?.note ?? '',
            priority: input.priority !== undefined
                ? input.priority
                : (existing?.priority ?? null),
            updatedAt: new Date().toISOString(),
        };
        this.db
            .prepare(`INSERT INTO tracked_groups (chat_id, label, purpose, tags, note, priority, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET
           label=excluded.label,
           purpose=excluded.purpose,
           tags=excluded.tags,
           note=excluded.note,
           priority=excluded.priority,
           updated_at=excluded.updated_at`)
            .run(merged.chatId, merged.label, merged.purpose, JSON.stringify(merged.tags), merged.note, merged.priority, merged.updatedAt);
        return merged;
    }
    getGroup(chatId) {
        const row = this.db
            .prepare('SELECT * FROM tracked_groups WHERE chat_id = ?')
            .get(chatId);
        return row ? decodeGroup(row) : undefined;
    }
    listGroups(query) {
        const clauses = [];
        const params = [];
        if (query.query) {
            clauses.push('(LOWER(label) LIKE ? OR LOWER(purpose) LIKE ?)');
            const needle = `%${query.query.toLowerCase()}%`;
            params.push(needle, needle);
        }
        if (query.tag) {
            clauses.push('tags LIKE ?');
            params.push(`%${JSON.stringify(query.tag).slice(1, -1)}%`);
        }
        const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
        const rows = this.db
            .prepare(`SELECT * FROM tracked_groups ${where} ORDER BY updated_at DESC LIMIT ?`)
            .all(...params, query.limit);
        return rows.map(decodeGroup);
    }
    upsertQuickReply(input) {
        const record = {
            code: input.code,
            title: input.title,
            text: input.text,
            updatedAt: new Date().toISOString(),
        };
        this.db
            .prepare(`INSERT INTO quick_replies (code, title, text, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET
           title=excluded.title,
           text=excluded.text,
           updated_at=excluded.updated_at`)
            .run(record.code, record.title, record.text, record.updatedAt);
        return record;
    }
    getQuickReply(code) {
        const row = this.db
            .prepare('SELECT * FROM quick_replies WHERE code = ?')
            .get(code);
        return row ? decodeQuickReply(row) : undefined;
    }
    listQuickReplies(limit) {
        const rows = this.db
            .prepare('SELECT * FROM quick_replies ORDER BY updated_at DESC LIMIT ?')
            .all(limit);
        return rows.map(decodeQuickReply);
    }
}
