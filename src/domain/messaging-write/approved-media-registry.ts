import { DomainError } from '../common/errors.js';

/**
 * `localPath` entries exist only for the operator-staged media catalog (see
 * media-catalog.ts): the model never supplies a filesystem path, only an
 * opaque media_ref that resolves through this registry. Deliberately no
 * extra discriminant field: distinguished structurally by which of
 * `tdlibFileId` / `localPath` is present, so every pre-existing descriptor
 * literal stays valid unchanged.
 */
export type ApprovedMediaDescriptor =
  | { readonly kind: 'document'; readonly tdlibFileId: number }
  | { readonly kind: 'document'; readonly localPath: string; readonly tdlibFileId?: never }
  | {
      readonly kind: 'photo';
      readonly tdlibFileId: number;
      readonly width: number;
      readonly height: number;
    }
  | {
      readonly kind: 'photo';
      readonly localPath: string;
      readonly tdlibFileId?: never;
      readonly width: number;
      readonly height: number;
    }
  | {
      readonly kind: 'video';
      readonly tdlibFileId: number;
      readonly width: number;
      readonly height: number;
      readonly duration: number;
      readonly supportsStreaming: boolean;
    };

const positiveInt32 = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value > 0 &&
  value <= 2_147_483_647;

const validLocalPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 32767 &&
  !value.includes('\u0000');

const validDimensions = (width: unknown, height: unknown): boolean =>
  positiveInt32(width) &&
  positiveInt32(height) &&
  width + height <= 10000 &&
  Math.max(width, height) <= 20 * Math.min(width, height);

export function validateMediaDescriptor(
  value: ApprovedMediaDescriptor,
): ApprovedMediaDescriptor {
  const keys = Object.keys(value).sort().join(',');
  if (
    value.kind === 'document' &&
    'tdlibFileId' in value &&
    keys === 'kind,tdlibFileId' &&
    positiveInt32(value.tdlibFileId)
  )
    return Object.freeze({ ...value });
  if (
    value.kind === 'document' &&
    'localPath' in value &&
    keys === 'kind,localPath' &&
    validLocalPath(value.localPath)
  )
    return Object.freeze({ ...value });
  if (
    value.kind === 'photo' &&
    'tdlibFileId' in value &&
    keys === 'height,kind,tdlibFileId,width' &&
    positiveInt32(value.tdlibFileId) &&
    validDimensions(value.width, value.height)
  )
    return Object.freeze({ ...value });
  if (
    value.kind === 'photo' &&
    'localPath' in value &&
    keys === 'height,kind,localPath,width' &&
    validLocalPath(value.localPath) &&
    validDimensions(value.width, value.height)
  )
    return Object.freeze({ ...value });
  if (
    value.kind === 'video' &&
    keys === 'duration,height,kind,supportsStreaming,tdlibFileId,width' &&
    positiveInt32(value.tdlibFileId) &&
    positiveInt32(value.width) &&
    positiveInt32(value.height) &&
    positiveInt32(value.duration) &&
    typeof value.supportsStreaming === 'boolean'
  )
    return Object.freeze({ ...value });
  throw new DomainError('INVALID_ARGUMENT', 'Invalid media descriptor');
}

export class ApprovedMediaRegistry {
  private readonly entries = new Map<string, ApprovedMediaDescriptor>();
  approve(ref: string, descriptor: ApprovedMediaDescriptor): void {
    if (typeof ref !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(ref))
      throw new DomainError('INVALID_ARGUMENT', 'Invalid media reference');
    const approved = validateMediaDescriptor(descriptor);
    const old = this.entries.get(ref);
    if (
      old &&
      Object.keys(old).some(
        (key) =>
          old[key as keyof ApprovedMediaDescriptor] !==
          approved[key as keyof ApprovedMediaDescriptor],
      )
    )
      throw new DomainError(
        'IDEMPOTENCY_CONFLICT',
        'Media reference already bound',
      );
    if (!old) this.entries.set(ref, approved);
  }
  resolve(ref: unknown): ApprovedMediaDescriptor {
    if (typeof ref !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(ref))
      throw new DomainError('INVALID_ARGUMENT', 'Invalid media reference');
    const descriptor = this.entries.get(ref);
    if (!descriptor)
      throw new DomainError('INVALID_ARGUMENT', 'Unknown media reference');
    return descriptor;
  }
}
