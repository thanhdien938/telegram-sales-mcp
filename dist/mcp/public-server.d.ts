import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type P4BServices } from './tools.js';
import { type SingleUserWriteConfig } from './single-user-write.js';
import type { LocalSalesStore } from '../sales/local-sales-store.js';
import type { MessagingWriteService } from '../domain/messaging-write/index.js';
import type { AccountService } from '../domain/index.js';
export interface PublicServerOptions {
    readonly services?: P4BServices | undefined;
    readonly salesStore?: LocalSalesStore | undefined;
    readonly singleUserWriteConfig?: SingleUserWriteConfig | undefined;
    readonly messagingWriteService?: MessagingWriteService | undefined;
    readonly accountService?: AccountService | undefined;
    readonly name?: string | undefined;
    readonly version?: string | undefined;
}
export declare function createPublicServer(options?: PublicServerOptions): McpServer;
