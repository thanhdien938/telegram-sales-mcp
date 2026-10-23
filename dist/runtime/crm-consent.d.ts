import { LocalSalesStore } from '../sales/local-sales-store.js';
export declare const CRM_ACKNOWLEDGMENT = "I_ACCEPT_LOCAL_CRM_AND_MCP_DATA_DISCLOSURE";
/** The interactive CLI obtains this acknowledgment outside MCP/model fields. */
export declare function initializeCrm(input: string, acknowledgment: string): void;
/** No constructor/schema initialization before consent and non-link checks. */
export declare function openConsentedCrm(input: string): LocalSalesStore;
