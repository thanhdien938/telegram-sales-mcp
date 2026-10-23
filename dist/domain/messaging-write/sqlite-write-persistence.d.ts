import type { WriteEvidence, WriteOperation, WritePersistence } from './messaging-write-service.js';
/** Metadata only: the caller must independently verify and authorize external proof.
 * References are SHA-256 digests of content-free authority/authorization handles.
 * This primitive does not authenticate proof or contact a provider.
 */
export interface AmbiguousWriteProof {
    readonly requestHash: string;
    readonly operation: WriteOperation;
    readonly fingerprint: string;
    readonly targetHash: string;
    readonly replyTargetHash: string | null;
    readonly priorTimestamp: string;
    readonly expectedState: 'AMBIGUOUS';
    readonly expectedSafeErrorType: 'RESULT_UNCERTAIN';
    readonly expectedReconciliationRequired: true;
    readonly expectedProviderDispatchAttempted: true;
    readonly finalMessageId: string;
    readonly proofDigest: string;
    readonly proofKind: 'INDEPENDENT_READ_ONLY_VERIFICATION';
    readonly authorityReference: string;
    readonly authorizationReference: string;
}
export interface WriteReconciliationAudit extends AmbiguousWriteProof {
    readonly timestamp: string;
}
export declare class SqliteWritePersistence implements WritePersistence {
    private readonly db;
    constructor(path: string, options?: {
        readonly createIfMissing?: boolean;
    });
    checkpoint(): void;
    close(): void;
    private transaction;
    get(key: string): WriteEvidence | undefined;
    /** Read-only terminal replay seam; never reserves or invokes a provider. */
    getByRequestHash(requestHash: string): WriteEvidence | undefined;
    reserve(key: string, evidence: WriteEvidence): WriteEvidence;
    finalize(key: string, evidence: WriteEvidence): void;
    private matchesProof;
    /** Exactly one transition. All replays, including identical proofs, are rejected. */
    reconcileAmbiguousWithVerifiedProof(key: string, proof: AmbiguousWriteProof): WriteEvidence;
    reconciliationAudits(): WriteReconciliationAudit[];
    cancelPreDispatch(key: string, fingerprint: string): void;
    auditEvents(): WriteEvidence[];
}
