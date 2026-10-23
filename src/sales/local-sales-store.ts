import { isAbsolute } from 'node:path';
import process from 'node:process';
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
] as const);
export type LeadStage = (typeof LEAD_STAGES)[number];

export const GROUP_PRIORITIES = Object.freeze(['LOW', 'MEDIUM', 'HIGH'] as const);
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



function parseTags(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : [];
  } catch {
    return [];
  }
}

interface LeadRow {
  user_id: string;
  display_name: string;
  stage: string;
  tags: string;
  notes: string;
  next_followup_at: string | null;
  updated_at: string;
}

function decodeLead(row: LeadRow): LeadRecord {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    stage: row.stage as LeadStage,
    tags: parseTags(row.tags),
    notes: row.notes,
    nextFollowupAt: row.next_followup_at,
    updatedAt: row.updated_at,
  };
}

interface GroupRow {
  chat_id: string;
  label: string;
  purpose: string;
  tags: string;
  note: string;
  priority: string | null;
  updated_at: string;
}

function decodeGroup(row: GroupRow): TrackedGroupRecord {
  return {
    chatId: row.chat_id,
    label: row.label,
    purpose: row.purpose,
    tags: parseTags(row.tags),
    note: row.note,
    priority: row.priority as GroupPriority | null,
    updatedAt: row.updated_at,
  };
}

interface QuickReplyRow {
  code: string;
  title: string;
  text: string;
  updated_at: string;
}

function decodeQuickReply(row: QuickReplyRow): QuickReplyRecord {
  return {
    code: row.code,
    title: row.title,
    text: row.text,
    updatedAt: row.updated_at,
  };
}

export class LocalSalesStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
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

  close(): void {
    this.db.close();
  }

  upsertLead(input: LeadUpsertInput): LeadRecord {
    const existing = this.getLead(input.userId);
    const merged: LeadRecord = {
      userId: input.userId,
      displayName: input.displayName ?? existing?.displayName ?? '',
      stage: input.stage ?? existing?.stage ?? 'NEW',
      tags: input.tags ?? existing?.tags ?? [],
      notes: input.notes ?? existing?.notes ?? '',
      nextFollowupAt:
        input.nextFollowupAt !== undefined
          ? input.nextFollowupAt
          : (existing?.nextFollowupAt ?? null),
      updatedAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO local_leads (user_id, display_name, stage, tags, notes, next_followup_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           display_name=excluded.display_name,
           stage=excluded.stage,
           tags=excluded.tags,
           notes=excluded.notes,
           next_followup_at=excluded.next_followup_at,
           updated_at=excluded.updated_at`,
      )
      .run(
        merged.userId,
        merged.displayName,
        merged.stage,
        JSON.stringify(merged.tags),
        merged.notes,
        merged.nextFollowupAt,
        merged.updatedAt,
      );
    return merged;
  }

  getLead(userId: string): LeadRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM local_leads WHERE user_id = ?')
      .get(userId) as LeadRow | undefined;
    return row ? decodeLead(row) : undefined;
  }

  listLeads(query: LeadsListQuery): LeadRecord[] {
    const clauses: string[] = [];
    const params: string[] = [];
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
      .prepare(
        `SELECT * FROM local_leads ${where}
         ORDER BY (next_followup_at IS NULL) ASC, next_followup_at ASC, updated_at DESC
         LIMIT ?`,
      )
      .all(...params, query.limit) as unknown as LeadRow[];
    return rows.map(decodeLead);
  }

  upsertGroup(input: TrackedGroupUpsertInput): TrackedGroupRecord {
    const existing = this.getGroup(input.chatId);
    const merged: TrackedGroupRecord = {
      chatId: input.chatId,
      label: input.label ?? existing?.label ?? '',
      purpose: input.purpose ?? existing?.purpose ?? '',
      tags: input.tags ?? existing?.tags ?? [],
      note: input.note ?? existing?.note ?? '',
      priority:
        input.priority !== undefined
          ? input.priority
          : (existing?.priority ?? null),
      updatedAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO tracked_groups (chat_id, label, purpose, tags, note, priority, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET
           label=excluded.label,
           purpose=excluded.purpose,
           tags=excluded.tags,
           note=excluded.note,
           priority=excluded.priority,
           updated_at=excluded.updated_at`,
      )
      .run(
        merged.chatId,
        merged.label,
        merged.purpose,
        JSON.stringify(merged.tags),
        merged.note,
        merged.priority,
        merged.updatedAt,
      );
    return merged;
  }

  getGroup(chatId: string): TrackedGroupRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM tracked_groups WHERE chat_id = ?')
      .get(chatId) as GroupRow | undefined;
    return row ? decodeGroup(row) : undefined;
  }

  listGroups(query: TrackedGroupsListQuery): TrackedGroupRecord[] {
    const clauses: string[] = [];
    const params: string[] = [];
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
      .prepare(
        `SELECT * FROM tracked_groups ${where} ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(...params, query.limit) as unknown as GroupRow[];
    return rows.map(decodeGroup);
  }

  upsertQuickReply(input: {
    readonly code: string;
    readonly title: string;
    readonly text: string;
  }): QuickReplyRecord {
    const record: QuickReplyRecord = {
      code: input.code,
      title: input.title,
      text: input.text,
      updatedAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO quick_replies (code, title, text, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET
           title=excluded.title,
           text=excluded.text,
           updated_at=excluded.updated_at`,
      )
      .run(record.code, record.title, record.text, record.updatedAt);
    return record;
  }

  getQuickReply(code: string): QuickReplyRecord | undefined {
    const row = this.db
      .prepare('SELECT * FROM quick_replies WHERE code = ?')
      .get(code) as QuickReplyRow | undefined;
    return row ? decodeQuickReply(row) : undefined;
  }

  listQuickReplies(limit: number): QuickReplyRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM quick_replies ORDER BY updated_at DESC LIMIT ?')
      .all(limit) as unknown as QuickReplyRow[];
    return rows.map(decodeQuickReply);
  }
}
