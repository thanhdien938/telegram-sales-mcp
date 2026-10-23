import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerP4BTools } from './tools.js';
import { registerSalesTools } from './single-user-sales.js';
/** No write registration, env opt-in, custom HTTP server or native login. */
export function createPublicServer(options = {}) {
    const server = new McpServer({ name: 'unofficial-telegram-sales-mcp', version: '1.0.0-beta.2' });
    registerP4BTools(server, { ...options.services, singleUserWritesEnabled: false, salesLocalEnabled: Boolean(options.salesStore) });
    if (options.salesStore)
        registerSalesTools(server, options.salesStore);
    return server;
}
