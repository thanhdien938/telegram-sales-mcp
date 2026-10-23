export interface Vault {
    protect(value: Buffer, context: string): Promise<Buffer>;
    unprotect(value: Buffer, context: string): Promise<Buffer>;
}
export interface Credentials {
    apiId: number;
    apiHash: string;
    databaseKey: string;
    nativeBundle: string;
}
export declare function validateRoot(raw: string, protectedRoots: readonly string[], existing: boolean): string;
export declare function acquireSession(raw: string, mode: 'fresh' | 'reopen', vault: Vault, protectedRoots: readonly string[]): Readonly<{
    root: string;
    databaseDirectory: string;
    filesDirectory: string;
    commit(credentials: Credentials, identity: string): Promise<void>;
    load(expectedNativeBundle: string): Promise<Readonly<{
        credentials: Credentials;
        verifyIdentity(identity: string): void;
    }>>;
    release: () => void;
}>;
