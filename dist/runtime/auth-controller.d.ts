import type { SetupPort } from './native-channel.js';
import type { SecretReader } from './terminal-secrets.js';
import type { Credentials } from './session-store.js';
export interface AuthContext {
    mode: 'fresh' | 'reopen';
    credentials: Credentials;
    databaseDirectory: string;
    filesDirectory: string;
    readIdentity: () => Promise<string>;
}
export declare function authenticate(setup: SetupPort, context: AuthContext, secrets?: SecretReader, signal?: AbortSignal): Promise<string>;
export declare function readApiCredentials(secrets: SecretReader, signal?: AbortSignal): Promise<{
    apiId: number;
    apiHash: string;
}>;
