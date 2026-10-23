import { DomainError } from '../common/errors.js';
const positiveInt32 = (value) => typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 2_147_483_647;
const validLocalPath = (value) => typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 32767 &&
    !value.includes('\u0000');
const validDimensions = (width, height) => positiveInt32(width) &&
    positiveInt32(height) &&
    width + height <= 10000 &&
    Math.max(width, height) <= 20 * Math.min(width, height);
export function validateMediaDescriptor(value) {
    const keys = Object.keys(value).sort().join(',');
    if (value.kind === 'document' &&
        'tdlibFileId' in value &&
        keys === 'kind,tdlibFileId' &&
        positiveInt32(value.tdlibFileId))
        return Object.freeze({ ...value });
    if (value.kind === 'document' &&
        'localPath' in value &&
        keys === 'kind,localPath' &&
        validLocalPath(value.localPath))
        return Object.freeze({ ...value });
    if (value.kind === 'photo' &&
        'tdlibFileId' in value &&
        keys === 'height,kind,tdlibFileId,width' &&
        positiveInt32(value.tdlibFileId) &&
        validDimensions(value.width, value.height))
        return Object.freeze({ ...value });
    if (value.kind === 'photo' &&
        'localPath' in value &&
        keys === 'height,kind,localPath,width' &&
        validLocalPath(value.localPath) &&
        validDimensions(value.width, value.height))
        return Object.freeze({ ...value });
    if (value.kind === 'video' &&
        keys === 'duration,height,kind,supportsStreaming,tdlibFileId,width' &&
        positiveInt32(value.tdlibFileId) &&
        positiveInt32(value.width) &&
        positiveInt32(value.height) &&
        positiveInt32(value.duration) &&
        typeof value.supportsStreaming === 'boolean')
        return Object.freeze({ ...value });
    throw new DomainError('INVALID_ARGUMENT', 'Invalid media descriptor');
}
export class ApprovedMediaRegistry {
    entries = new Map();
    approve(ref, descriptor) {
        if (typeof ref !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(ref))
            throw new DomainError('INVALID_ARGUMENT', 'Invalid media reference');
        const approved = validateMediaDescriptor(descriptor);
        const old = this.entries.get(ref);
        if (old &&
            Object.keys(old).some((key) => old[key] !==
                approved[key]))
            throw new DomainError('IDEMPOTENCY_CONFLICT', 'Media reference already bound');
        if (!old)
            this.entries.set(ref, approved);
    }
    resolve(ref) {
        if (typeof ref !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(ref))
            throw new DomainError('INVALID_ARGUMENT', 'Invalid media reference');
        const descriptor = this.entries.get(ref);
        if (!descriptor)
            throw new DomainError('INVALID_ARGUMENT', 'Unknown media reference');
        return descriptor;
    }
}
