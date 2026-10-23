/**
 * `localPath` entries exist only for the operator-staged media catalog (see
 * media-catalog.ts): the model never supplies a filesystem path, only an
 * opaque media_ref that resolves through this registry. Deliberately no
 * extra discriminant field: distinguished structurally by which of
 * `tdlibFileId` / `localPath` is present, so every pre-existing descriptor
 * literal stays valid unchanged.
 */
export type ApprovedMediaDescriptor = {
    readonly kind: 'document';
    readonly tdlibFileId: number;
} | {
    readonly kind: 'document';
    readonly localPath: string;
    readonly tdlibFileId?: never;
} | {
    readonly kind: 'photo';
    readonly tdlibFileId: number;
    readonly width: number;
    readonly height: number;
} | {
    readonly kind: 'photo';
    readonly localPath: string;
    readonly tdlibFileId?: never;
    readonly width: number;
    readonly height: number;
} | {
    readonly kind: 'video';
    readonly tdlibFileId: number;
    readonly width: number;
    readonly height: number;
    readonly duration: number;
    readonly supportsStreaming: boolean;
};
export declare function validateMediaDescriptor(value: ApprovedMediaDescriptor): ApprovedMediaDescriptor;
export declare class ApprovedMediaRegistry {
    private readonly entries;
    approve(ref: string, descriptor: ApprovedMediaDescriptor): void;
    resolve(ref: unknown): ApprovedMediaDescriptor;
}
