export type NativeMode = 'fresh' | 'reopen';
export declare function assertNativeRpc(scope: 'read' | 'setup', method: unknown, mode: NativeMode): void;
export declare const NATIVE_BUILD_STATUS: 'HOLD' | 'VERIFIED';
export declare function requireQualifiedNativeBuild(): void;
