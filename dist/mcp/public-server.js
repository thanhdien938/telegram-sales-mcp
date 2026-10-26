import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerP4BTools } from './tools.js';
import { registerSalesTools } from './single-user-sales.js';
import { registerSingleUserWriteTool } from './single-user-write.js';
export function createPublicServer(options = {}) {
    const name = options.name ?? 'unofficial-telegram-sales-mcp';
    const version = options.version ?? '1.0.0-beta.2';
    const server = new McpServer({ name, version });
    const singleUserWritesEnabled = Boolean(options.singleUserWriteConfig && options.messagingWriteService);
    const salesLocalEnabled = Boolean(options.salesStore);
    // 1. Register 11 Telegram Read tools
    registerP4BTools(server, {
        ...options.services,
        singleUserWritesEnabled,
        salesLocalEnabled,
    });
    // 2. Register 13 Telegram Action tools (when single-user writes enabled)
    if (singleUserWritesEnabled && options.messagingWriteService && options.singleUserWriteConfig) {
        registerSingleUserWriteTool(server, options.messagingWriteService, options.singleUserWriteConfig, options.accountService ?? options.services?.accountService);
    }
    // 3. Register Sales CRM tools (8 local tools, plus 9th quick_reply_send when writes enabled)
    if (options.salesStore) {
        registerSalesTools(server, options.salesStore, options.messagingWriteService, options.singleUserWriteConfig, options.accountService ?? options.services?.accountService);
    }
    return server;
}
