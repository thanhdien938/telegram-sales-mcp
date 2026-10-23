import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type LocalSalesStore } from '../sales/local-sales-store.js';
import { ALLOWED_TEMPLATE_VARS } from '../sales/quick-reply-template.js';
export declare const SALES_TOOL_NAMES: readonly ["telegram_sales_lead_upsert", "telegram_sales_lead_get", "telegram_sales_leads_list", "telegram_sales_group_track", "telegram_sales_groups_list", "telegram_sales_quick_reply_upsert", "telegram_sales_quick_replies_list", "telegram_sales_quick_reply_preview"];
/** Eight local tools, never a Telegram sender. */
export declare function registerSalesTools(server: McpServer, store: LocalSalesStore): void;
export { ALLOWED_TEMPLATE_VARS };
