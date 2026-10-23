export type DomainErrorCode =
  | 'INVALID_ARGUMENT'
  | 'INVALID_ID'
  | 'INVALID_CURSOR'
  | 'NOT_FOUND'
  | 'ACCOUNT_NOT_READY'
  | 'TRANSPORT_UNAVAILABLE'
  | 'READ_FAILED'
  | 'PAGINATION_INCOMPLETE'
  | 'PAGINATION_LIMIT_EXCEEDED'
  | 'FREE_PUBLIC_SEARCH_LIMIT_EXCEEDED'
  | 'FILE_TOO_LARGE'
  | 'FILE_READ_FAILED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RECONCILIATION_REQUIRED';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: string | null;

  constructor(code: DomainErrorCode, message: string, details?: string | null) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details ?? null;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): { code: DomainErrorCode; message: string; details?: string } {
    return {
      code: this.code,
      message: this.message,
      ...(this.details !== null ? { details: this.details } : {}),
    };
  }
}
