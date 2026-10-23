import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const operations = new Set([
    'SEND_TEXT',
    'REPLY_TEXT',
    'EDIT_TEXT',
    'DELETE_MESSAGE',
    'FORWARD_MESSAGE',
    'ADD_REACTION',
    'REMOVE_REACTION',
    'PIN_MESSAGE',
    'UNPIN_MESSAGE',
    'MARK_READ',
    'SEND_MEDIA',
    'SCHEDULE_TEXT',
    'SCHEDULE_MEDIA',
]);
const states = new Set([
    'PENDING',
    'CONFIRMED',
    'FAILED',
    'AMBIGUOUS',
]);
const columns = [
    'operation',
    'request_hash',
    'fingerprint',
    'target_hash',
    'reply_target_hash',
    'timestamp',
    'state',
    'message_id',
    'safe_error_type',
    'reconciliation_required',
    'provider_dispatch_attempted',
];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const hex = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function isValidPositiveSafeMessageId(value) {
    if (typeof value !== 'string')
        return false;
    if (!/^[1-9]\d*$/.test(value))
        return false;
    if (value.length > 16)
        return false;
    try {
        const bi = BigInt(value);
        return bi > 0n && bi <= BigInt(Number.MAX_SAFE_INTEGER);
    }
    catch {
        return false;
    }
}
function decode(row) {
    const valid = operations.has(row.operation) &&
        states.has(row.state) &&
        hex(row.request_hash) &&
        hex(row.fingerprint) &&
        hex(row.target_hash) &&
        (row.reply_target_hash === null || hex(row.reply_target_hash)) &&
        typeof row.timestamp === 'string' &&
        !Number.isNaN(Date.parse(row.timestamp)) &&
        (row.message_id === null || isValidPositiveSafeMessageId(row.message_id)) &&
        (row.safe_error_type === null ||
            row.safe_error_type === 'PROVIDER_REJECTED' ||
            row.safe_error_type === 'RESULT_UNCERTAIN') &&
        (row.reconciliation_required === 0 || row.reconciliation_required === 1) &&
        (row.provider_dispatch_attempted === 0 ||
            row.provider_dispatch_attempted === 1) &&
        row.reconciliation_required ===
            Number(row.state === 'PENDING' || row.state === 'AMBIGUOUS') &&
        row.provider_dispatch_attempted === Number(row.state !== 'PENDING') &&
        (row.state !== 'PENDING' ||
            (row.message_id === null && row.safe_error_type === null)) &&
        (row.state !== 'CONFIRMED' ||
            (isValidPositiveSafeMessageId(row.message_id) &&
                row.safe_error_type === null)) &&
        (row.state !== 'FAILED' ||
            (row.message_id === null &&
                row.safe_error_type === 'PROVIDER_REJECTED')) &&
        (row.state !== 'AMBIGUOUS' ||
            (row.message_id === null && row.safe_error_type === 'RESULT_UNCERTAIN'));
    if (!valid)
        throw new Error('Corrupt write evidence');
    return {
        operation: row.operation,
        requestHash: row.request_hash,
        fingerprint: row.fingerprint,
        targetHash: row.target_hash,
        replyTargetHash: row.reply_target_hash,
        timestamp: row.timestamp,
        state: row.state,
        messageId: row.message_id,
        safeErrorType: row.safe_error_type,
        reconciliationRequired: row.reconciliation_required === 1,
        providerDispatchAttempted: row.provider_dispatch_attempted === 1,
    };
}
function values(e) {
    return [
        e.operation,
        e.requestHash,
        e.fingerprint,
        e.targetHash,
        e.replyTargetHash,
        e.timestamp,
        e.state,
        e.messageId,
        e.safeErrorType,
        Number(e.reconciliationRequired),
        Number(e.providerDispatchAttempted),
    ];
}
const proofColumns = [
    'requestHash',
    'operation',
    'fingerprint',
    'targetHash',
    'replyTargetHash',
    'priorTimestamp',
    'expectedState',
    'expectedSafeErrorType',
    'expectedReconciliationRequired',
    'expectedProviderDispatchAttempted',
    'finalMessageId',
    'proofDigest',
    'proofKind',
    'authorityReference',
    'authorizationReference',
];
const reconciliationColumns = [...proofColumns, 'timestamp'];
const proofValues = (p) => proofColumns.map((c) => (typeof p[c] === 'boolean' ? Number(p[c]) : p[c]));
function validateProof(input) {
    const p = input;
    if (!p ||
        Object.keys(p).length !== proofColumns.length ||
        !proofColumns.every((c) => Object.hasOwn(p, c)) ||
        ![
            p.requestHash,
            p.fingerprint,
            p.targetHash,
            p.proofDigest,
            p.authorityReference,
            p.authorizationReference,
        ].every(hex) ||
        !operations.has(p.operation) ||
        !(p.replyTargetHash === null || hex(p.replyTargetHash)) ||
        typeof p.priorTimestamp !== 'string' ||
        new Date(p.priorTimestamp).toISOString() !== p.priorTimestamp ||
        p.expectedState !== 'AMBIGUOUS' ||
        p.expectedSafeErrorType !== 'RESULT_UNCERTAIN' ||
        p.expectedReconciliationRequired !== true ||
        p.expectedProviderDispatchAttempted !== true ||
        !isValidPositiveSafeMessageId(p.finalMessageId) ||
        p.proofKind !== 'INDEPENDENT_READ_ONLY_VERIFICATION')
        throw new Error('Invalid reconciliation proof');
}
const reconciliationSchema = `CREATE TABLE write_reconciliations (
  ${reconciliationColumns.map((c) => `${c} ${(c.startsWith('expected') && c.endsWith('Attempted')) || c === 'expectedReconciliationRequired' ? 'INTEGER' : 'TEXT'}${c === 'requestHash' ? ' PRIMARY KEY' : ''}${c === 'replyTargetHash' ? '' : ' NOT NULL'}`).join(',')},
  FOREIGN KEY(requestHash) REFERENCES write_ledger(request_hash));`;
export class SqliteWritePersistence {
    db;
    constructor(path, options = {}) {
        const existingOnly = options.createIfMissing === false;
        if (existingOnly) {
            try {
                if (!isAbsolute(path) ||
                    (process.platform === 'win32' &&
                        !/^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+)/.test(path)) ||
                    path.startsWith('file:') ||
                    !statSync(path).isFile())
                    throw new Error();
            }
            catch {
                throw new Error('P5_STORE_INVALID');
            }
        }
        if (!path || path === ':memory:')
            throw new Error('Durable database path required');
        try {
            this.db = new DatabaseSync(path, existingOnly ? { readOnly: true } : {});
        }
        catch (error) {
            // eslint-disable-next-line preserve-caught-error -- fixed privacy boundary excludes native path/prose causes
            if (existingOnly)
                throw new Error('P5_STORE_INVALID');
            throw error;
        }
        try {
            this.db.exec(existingOnly
                ? 'PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON'
                : 'PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL');
            const tables = this.db
                .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
                .all()
                .map((r) => r.name);
            if (tables.length === 0) {
                if (existingOnly)
                    throw new Error('P5_STORE_INVALID');
                this.db.exec(`BEGIN IMMEDIATE;
          CREATE TABLE metadata (schema_version INTEGER NOT NULL CHECK(schema_version=1));
          INSERT INTO metadata VALUES (1);
          CREATE TABLE write_ledger (operation TEXT NOT NULL, request_hash TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, target_hash TEXT NOT NULL, reply_target_hash TEXT, timestamp TEXT NOT NULL, state TEXT NOT NULL, message_id TEXT, safe_error_type TEXT, reconciliation_required INTEGER NOT NULL, provider_dispatch_attempted INTEGER NOT NULL);
          CREATE TABLE write_audit_events (id INTEGER PRIMARY KEY, operation TEXT NOT NULL, request_hash TEXT NOT NULL, fingerprint TEXT NOT NULL, target_hash TEXT NOT NULL, reply_target_hash TEXT, timestamp TEXT NOT NULL, state TEXT NOT NULL, message_id TEXT, safe_error_type TEXT, reconciliation_required INTEGER NOT NULL, provider_dispatch_attempted INTEGER NOT NULL);
          COMMIT;`);
            }
            const names = this.db
                .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
                .all()
                .map((r) => r.name)
                .sort();
            if (JSON.stringify(names) !==
                JSON.stringify(['metadata', 'write_audit_events', 'write_ledger']) &&
                JSON.stringify(names) !==
                    JSON.stringify([
                        'metadata',
                        'write_audit_events',
                        'write_ledger',
                        'write_reconciliations',
                    ]))
                throw new Error('Unknown write schema');
            if (existingOnly) {
                const objects = this.db
                    .prepare("SELECT name,type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name")
                    .all();
                if (objects.length !== 4 ||
                    objects.some((o) => o.type !== 'table') ||
                    !names.includes('write_reconciliations'))
                    throw new Error('P5_STORE_INVALID');
            }
            const metaCols = this.db.prepare('PRAGMA table_info(metadata)').all();
            const metaCol0 = metaCols[0];
            if (!metaCol0 ||
                metaCols.length !== 1 ||
                metaCol0.name !== 'schema_version' ||
                metaCol0.type.toUpperCase() !== 'INTEGER' ||
                metaCol0.notnull !== 1 ||
                metaCol0.pk !== 0)
                throw new Error('Corrupt write schema');
            const metaRows = this.db
                .prepare('SELECT schema_version FROM metadata')
                .all();
            const metaRow0 = metaRows[0];
            if (!metaRow0 || metaRows.length !== 1 || metaRow0.schema_version !== 1)
                throw new Error('Unknown write schema version');
            const ledgerCols = this.db
                .prepare('PRAGMA table_info(write_ledger)')
                .all();
            if (JSON.stringify(ledgerCols.map((c) => c.name)) !==
                JSON.stringify([...columns]))
                throw new Error('Corrupt write schema');
            for (const col of ledgerCols) {
                const expectedPk = col.name === 'request_hash' ? 1 : 0;
                if (col.pk !== expectedPk)
                    throw new Error('Corrupt write schema');
                if (existingOnly &&
                    (col.type !==
                        ([
                            'reconciliation_required',
                            'provider_dispatch_attempted',
                        ].includes(col.name)
                            ? 'INTEGER'
                            : 'TEXT') ||
                        col.notnull !==
                            Number(![
                                'request_hash',
                                'reply_target_hash',
                                'message_id',
                                'safe_error_type',
                            ].includes(col.name))))
                    throw new Error('P5_STORE_INVALID');
            }
            const auditCols = this.db
                .prepare('PRAGMA table_info(write_audit_events)')
                .all();
            if (JSON.stringify(auditCols.map((c) => c.name)) !==
                JSON.stringify(['id', ...columns]))
                throw new Error('Corrupt write schema');
            for (const col of auditCols) {
                const expectedPk = col.name === 'id' ? 1 : 0;
                if (col.pk !== expectedPk)
                    throw new Error('Corrupt write schema');
                if (existingOnly &&
                    (col.type !==
                        ([
                            'id',
                            'reconciliation_required',
                            'provider_dispatch_attempted',
                        ].includes(col.name)
                            ? 'INTEGER'
                            : 'TEXT') ||
                        col.notnull !==
                            Number(![
                                'id',
                                'reply_target_hash',
                                'message_id',
                                'safe_error_type',
                            ].includes(col.name))))
                    throw new Error('P5_STORE_INVALID');
            }
            for (const table of ['write_ledger', 'write_audit_events']) {
                for (const row of this.db
                    .prepare(`SELECT ${columns.join(',')} FROM ${table}`)
                    .all())
                    decode(row);
            }
            if (this.db.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok')
                throw new Error('Corrupt write database');
            // Additive extension of the version-1 journal, only after old schema/data validation.
            this.transaction(() => {
                if (!existingOnly)
                    this.db.exec(reconciliationSchema.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'));
                const info = this.db
                    .prepare('PRAGMA table_info(write_reconciliations)')
                    .all();
                if (info.length !== reconciliationColumns.length ||
                    info.some((c, i) => c.name !== reconciliationColumns[i] ||
                        c.type !==
                            (c.name === 'expectedReconciliationRequired' ||
                                c.name === 'expectedProviderDispatchAttempted'
                                ? 'INTEGER'
                                : 'TEXT') ||
                        c.notnull !== Number(c.name !== 'replyTargetHash') ||
                        c.pk !== Number(c.name === 'requestHash')))
                    throw new Error('Corrupt reconciliation schema');
                const foreignKeys = this.db
                    .prepare('PRAGMA foreign_key_list(write_reconciliations)')
                    .all();
                const foreignKey = foreignKeys[0];
                if (!foreignKey ||
                    foreignKeys.length !== 1 ||
                    foreignKey.table !== 'write_ledger' ||
                    foreignKey.from !== 'requestHash' ||
                    foreignKey.to !== 'request_hash')
                    throw new Error('Corrupt reconciliation schema');
                for (const audit of this.reconciliationAudits()) {
                    const { timestamp, ...proof } = audit;
                    validateProof(proof);
                    const row = this.db
                        .prepare('SELECT * FROM write_ledger WHERE request_hash=?')
                        .get(proof.requestHash);
                    const e = row ? decode(row) : undefined;
                    if (!e ||
                        !this.matchesProof(e, proof) ||
                        e.state !== 'CONFIRMED' ||
                        e.messageId !== proof.finalMessageId ||
                        e.timestamp !== timestamp ||
                        !this.auditEvents().some((a) => JSON.stringify(a) === JSON.stringify(e)) ||
                        !this.auditEvents().some((a) => this.matchesProof(a, proof) &&
                            a.state === 'AMBIGUOUS' &&
                            a.timestamp === proof.priorTimestamp))
                        throw new Error('Corrupt reconciliation audit');
                }
            }, existingOnly);
            if (existingOnly) {
                this.db.close();
                this.db = new DatabaseSync(path);
                this.db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL');
            }
        }
        catch (error) {
            try {
                this.db.close();
            }
            catch {
                /* opening may have failed after read validation */
            }
            // eslint-disable-next-line preserve-caught-error -- fixed privacy boundary excludes native path/prose causes
            if (existingOnly)
                throw new Error('P5_STORE_INVALID');
            throw error;
        }
    }
    checkpoint() {
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    }
    close() {
        this.db.close();
    }
    transaction(fn, readOnly = false) {
        this.db.exec(readOnly ? 'BEGIN' : 'BEGIN IMMEDIATE');
        try {
            const result = fn();
            this.db.exec('COMMIT');
            return result;
        }
        catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }
    get(key) {
        return this.getByRequestHash(hash(key));
    }
    /** Read-only terminal replay seam; never reserves or invokes a provider. */
    getByRequestHash(requestHash) {
        if (!hex(requestHash))
            throw new Error('Invalid request hash');
        const row = this.db
            .prepare('SELECT * FROM write_ledger WHERE request_hash=?')
            .get(requestHash);
        return row ? decode(row) : undefined;
    }
    reserve(key, evidence) {
        if (evidence.requestHash !== hash(key) || evidence.state !== 'PENDING')
            throw new Error('Invalid reservation');
        decode(Object.fromEntries(columns.map((c, i) => [c, values(evidence)[i]])));
        return this.transaction(() => {
            const prior = this.get(key);
            if (prior)
                return prior;
            this.db
                .prepare(`INSERT INTO write_ledger (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
                .run(...values(evidence));
            this.db
                .prepare(`INSERT INTO write_audit_events (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
                .run(...values(evidence));
            return evidence;
        });
    }
    finalize(key, evidence) {
        if (evidence.requestHash !== hash(key) || evidence.state === 'PENDING')
            throw new Error('Invalid finalization');
        decode(Object.fromEntries(columns.map((c, i) => [c, values(evidence)[i]])));
        this.transaction(() => {
            const prior = this.get(key);
            if (prior?.state !== 'PENDING' ||
                prior.fingerprint !== evidence.fingerprint)
                throw new Error('Write reservation mismatch');
            const assignments = columns
                .filter((c) => c !== 'request_hash')
                .map((c) => `${c}=?`)
                .join(',');
            this.db
                .prepare(`UPDATE write_ledger SET ${assignments} WHERE request_hash=?`)
                .run(...values(evidence).filter((_, i) => i !== 1), evidence.requestHash);
            this.db
                .prepare(`INSERT INTO write_audit_events (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
                .run(...values(evidence));
        });
    }
    matchesProof(e, p) {
        return (e.requestHash === p.requestHash &&
            e.operation === p.operation &&
            e.fingerprint === p.fingerprint &&
            e.targetHash === p.targetHash &&
            e.replyTargetHash === p.replyTargetHash);
    }
    /** Exactly one transition. All replays, including identical proofs, are rejected. */
    reconcileAmbiguousWithVerifiedProof(key, proof) {
        validateProof(proof);
        if (typeof key !== 'string' ||
            !/^[A-Za-z0-9._:-]{1,128}$/.test(key) ||
            hash(key) !== proof.requestHash)
            throw new Error('Reconciliation identity mismatch');
        return this.transaction(() => {
            const prior = this.get(key);
            if (!prior ||
                !this.matchesProof(prior, proof) ||
                prior.timestamp !== proof.priorTimestamp ||
                prior.state !== 'AMBIGUOUS' ||
                prior.safeErrorType !== 'RESULT_UNCERTAIN' ||
                !prior.reconciliationRequired ||
                !prior.providerDispatchAttempted)
                throw new Error('Reconciliation prior mismatch');
            const timestamp = new Date().toISOString();
            const result = {
                ...prior,
                timestamp,
                state: 'CONFIRMED',
                messageId: proof.finalMessageId,
                safeErrorType: null,
                reconciliationRequired: false,
            };
            const changed = this.db
                .prepare(`UPDATE write_ledger SET state='CONFIRMED', message_id=?,
        timestamp=?, safe_error_type=NULL, reconciliation_required=0
        WHERE request_hash=? AND state='AMBIGUOUS' AND safe_error_type='RESULT_UNCERTAIN'
        AND reconciliation_required=1 AND provider_dispatch_attempted=1 AND fingerprint=?
        AND operation=? AND target_hash=? AND reply_target_hash IS ? AND timestamp=?`)
                .run(result.messageId, timestamp, proof.requestHash, proof.fingerprint, proof.operation, proof.targetHash, proof.replyTargetHash, proof.priorTimestamp);
            if (changed.changes !== 1)
                throw new Error('Reconciliation prior mismatch');
            this.db
                .prepare(`INSERT INTO write_audit_events (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
                .run(...values(result));
            this.db
                .prepare(`INSERT INTO write_reconciliations (${reconciliationColumns.join(',')}) VALUES (${reconciliationColumns.map(() => '?').join(',')})`)
                .run(...proofValues(proof), timestamp);
            return result;
        });
    }
    reconciliationAudits() {
        return this.db
            .prepare(`SELECT ${reconciliationColumns.join(',')} FROM write_reconciliations ORDER BY requestHash`)
            .all()
            .map((row) => ({
            ...row,
            expectedReconciliationRequired: row.expectedReconciliationRequired === 1,
            expectedProviderDispatchAttempted: row.expectedProviderDispatchAttempted === 1,
        }));
    }
    cancelPreDispatch(key, fingerprint) {
        this.transaction(() => {
            const result = this.db
                .prepare("DELETE FROM write_ledger WHERE request_hash=? AND fingerprint=? AND state='PENDING'")
                .run(hash(key), fingerprint);
            if (result.changes !== 1)
                throw new Error('Write reservation mismatch');
        });
    }
    auditEvents() {
        return this.db
            .prepare(`SELECT ${columns.join(',')} FROM write_audit_events ORDER BY id`)
            .all()
            .map((r) => decode(r));
    }
}
