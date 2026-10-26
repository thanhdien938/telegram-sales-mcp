export type NativeMode = 'fresh' | 'reopen';
export declare function assertNativeRpc(scope: 'read' | 'setup' | 'write', method: unknown, mode: NativeMode, writesEnabled?: boolean): void;
export declare const NATIVE_BUILD_STATUS: 'HOLD' | 'VERIFIED';
export declare function isPlaceholderCommit(commit: string): boolean;
export declare function checkNativeManifestQualification(manifestFile?: string): 'HOLD' | 'VERIFIED';
export declare function requireQualifiedNativeBuild(manifestFile?: string): void;
