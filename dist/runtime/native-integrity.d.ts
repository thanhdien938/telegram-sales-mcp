export interface NativeBundle {
    python: string;
    dll: string;
    wrapper: string;
    bundleId: string;
}
/** SHA is integrity only, not evidence of provenance. This function never executes the bundle. */
export declare function verifyNativeBundle(manifestFile: string, wrapper: string, python: string, protectedRoots: readonly string[]): NativeBundle;
