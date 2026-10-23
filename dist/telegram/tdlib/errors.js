export function sanitizeTdlibErrorMessage(code, rawMessage) {
    if (typeof code === 'number') {
        switch (code) {
            case 400:
                return 'TDLib bad request';
            case 401:
                return 'TDLib unauthorized';
            case 403:
                return 'TDLib access forbidden';
            case 404:
                return 'TDLib resource not found';
            case 429:
                return 'TDLib rate limit exceeded';
            case 500:
                return 'TDLib internal server error';
        }
    }
    if (typeof rawMessage === 'string') {
        if (rawMessage.startsWith('FLOOD_WAIT')) {
            return 'TDLib rate limit exceeded (flood wait)';
        }
        if (rawMessage === 'PHONE_CODE_INVALID') {
            return 'Invalid verification code';
        }
        if (rawMessage === 'PASSWORD_HASH_INVALID') {
            return 'Invalid password';
        }
    }
    return 'TDLib request failed';
}
export class TdlibError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.name = 'TdlibError';
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
