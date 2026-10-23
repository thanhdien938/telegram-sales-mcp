export class DomainError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.name = 'DomainError';
        this.code = code;
        this.details = details ?? null;
        Object.setPrototypeOf(this, new.target.prototype);
    }
    toJSON() {
        return {
            code: this.code,
            message: this.message,
            ...(this.details !== null ? { details: this.details } : {}),
        };
    }
}
