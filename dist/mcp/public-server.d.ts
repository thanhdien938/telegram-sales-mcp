import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type P4BServices } from './tools.js';
import type { LocalSalesStore } from '../sales/local-sales-store.js';
/** No write registration, env opt-in, custom HTTP server or native login. */
export declare function createPublicServer(options?: {
    services?: P4BServices;
    salesStore?: LocalSalesStore;
}): McpServer;
