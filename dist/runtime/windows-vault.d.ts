import type { Vault } from './session-store.js';
/** Private helper stdin/stdout is not MCP stdin/stdout. Never use argv/env for material. */
export declare function createWindowsVault(python: string, helper: string): Vault;
