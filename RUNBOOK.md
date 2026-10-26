# Unofficial Telegram Sales MCP — Operational Runbook

**Edition:** Full 33-Tool Parity Release candidate  
**Date:** 2026-10-26  
**Project:** `thanhdien938/telegram-sales-mcp`  
**License:** MIT for first-party redistributable code; third-party software keeps its own terms  
**Architecture:** Single-user, Windows-first Model Context Protocol (MCP) server  

> **Overview:** This runbook provides complete operational guidance for deploying, authenticating, and running the Telegram Sales MCP server on Windows with full 33-tool parity: 11 Telegram Read tools, 13 Telegram Action tools, and 9 local Sales CRM tools.

---

## 1. Tool Inventory and Capabilities

| Category | Count | Tools | Description |
|---|---|---|---|
| **Telegram Read** | 11 | `telegram_health`<br>`telegram_capabilities`<br>`telegram_account`<br>`telegram_chats_list`<br>`telegram_chat_get`<br>`telegram_inbox`<br>`telegram_messages_get`<br>`telegram_messages_search`<br>`telegram_public_search`<br>`telegram_contacts`<br>`telegram_file_get` | Real-time inspection of account metadata, conversations, unread messages, message history, contacts, and bounded media downloads. |
| **Telegram Action** | 13 | `telegram_message_send`<br>`telegram_message_reply`<br>`telegram_message_edit`<br>`telegram_message_delete`<br>`telegram_message_forward`<br>`telegram_message_reaction_add`<br>`telegram_message_reaction_remove`<br>`telegram_message_pin`<br>`telegram_message_unpin`<br>`telegram_message_mark_read`<br>`telegram_message_media_send`<br>`telegram_message_text_schedule`<br>`telegram_message_media_schedule` | Complete Telegram mutation suite locked to the operator-approved bound chat target. All writes enforce SHA-256 idempotency request keys. |
| **Sales CRM** | 9 | `telegram_sales_lead_upsert`<br>`telegram_sales_lead_get`<br>`telegram_sales_leads_list`<br>`telegram_sales_group_track`<br>`telegram_sales_groups_list`<br>`telegram_sales_quick_reply_upsert`<br>`telegram_sales_quick_replies_list`<br>`telegram_sales_quick_reply_preview`<br>`telegram_sales_quick_reply_send` | Local SQLite sales funnel tracking, lead status management, group monitoring, and quick-reply template dispatch directly through the verified write pipeline. |

---

## 2. Project Directory Structure

| Path | Purpose |
|---|---|
| `src/cli.ts`, `dist/cli.js` | Local stdio MCP entrypoint supporting `--crm`, `--state`, `--writes`, `--chat-id`, and `doctor`. |
| `src/login.ts`, `dist/login.js` | Interactive terminal login program for authenticating own Telegram account. |
| `src/crm-init.ts`, `dist/crm-init.js` | Interactive initializer creating `sales.sqlite` and the required consent marker. |
| `src/doctor.ts` | Diagnostic runner checking Node, Python, TDLib manifest/DLL, session root, and CRM store. |
| `src/mcp/` | Model Context Protocol servers and tool registration (`public-server.ts`, `tools.ts`, `single-user-write.ts`, `single-user-sales.ts`). |
| `src/domain/` | Domain logic for messaging writes, idempotency ledger, CRM sales store, and media catalog. |
| `src/telegram/` | TDLib adapter and wire protocol abstraction. |
| `src/runtime/` | Native process supervision, DPAPI vault, session store, writer locks, and manifest integrity. |
| `native/tdjson_wrapper.py` | Python ctypes bridge communicating with official `tdjson.dll`. |
| `native/windows_vault.py` | Windows CurrentUser DPAPI helper script. |
| `scripts/generate-native-manifest.mjs` | Generates Schema 1 `manifest.json` with SHA-256 for local `tdjson.dll`. |
| `tests/` | Offline test suites (`public.test.mjs`, `portable.test.mjs`, `parity33.test.mjs`, `native_source_test.py`). |

---

## 3. Operational Procedures

### Procedure A: Environment Diagnostic Check
Before launching the server, execute the diagnostic command:
```powershell
npm run doctor
```
Or via CLI:
```powershell
node dist/cli.js doctor
```

The report provides status on all prerequisites:
- **Node.js:** Verifies version >= 22.19.0.
- **Python:** Verifies 64-bit Python 3.11+ executable.
- **Native Manifest & DLL:** Verifies manifest existence, DLL existence, and SHA-256 hash match.
- **Session Root:** Checks if an authenticated Telegram session and writer lock exist.
- **Sales CRM:** Checks if `sales.sqlite` and the consent file exist.
- **Write Mode:** Confirms if write mode is enabled and whether a target chat is bound.

### Procedure B: Manifest Generation
When preparing your native bundle with `tdjson.dll`:
```powershell
node scripts/generate-native-manifest.mjs `
  --dll "<PATH_TO_TDJSON_DLL>" `
  --commit "<REAL_TDLIB_COMMIT_SHA>" `
  --out "<USER_NATIVE_BUNDLE_DIR>"
```
This produces `<USER_NATIVE_BUNDLE_DIR>\manifest.json` with Schema 1 format:
```json
{
  "schema": 1,
  "platform": "win32-x64",
  "protocol": 1,
  "upstream": "https://github.com/tdlib/td",
  "upstreamCommit": "<REAL_TDLIB_COMMIT_SHA>",
  "api": "td-json-1.x",
  "noticeReview": "OWNER_REVIEW_REQUIRED",
  "artifacts": {
    "tdjson.dll": "<COMPUTED_SHA256_HASH>"
  }
}
```

### Procedure C: Account Authentication (Login)
Execute in a private terminal:
```powershell
node dist/login.js --state "<STATE_DIR>" --native-manifest "<MANIFEST_PATH>" --python "<PYTHON_EXE>"
```
1. Enter your Telegram API ID and API Hash from `my.telegram.org`.
2. Enter your phone number in international format (`+<country_code><phone_number>`).
3. Enter the verification code sent to your Telegram apps.
4. If cloud password (2FA) is enabled, enter it securely.
5. All credentials are encrypted with Windows DPAPI and stored in `<STATE_DIR>/session.json`.

### Procedure D: Reopening an Existing Session
To reopen an existing session without prompting for credentials, run:
```powershell
node dist/cli.js --state "<STATE_DIR>" --native-manifest "<MANIFEST_PATH>" --python "<PYTHON_EXE>"
```
The server will read the DPAPI-encrypted token, verify account binding, acquire the exclusive writer lock, and expose the 11 Read tools.

### Procedure E: Enabling Full 33-Tool Mode (Writes + CRM)
To enable the 13 Telegram Action tools and the 9th CRM tool (`telegram_sales_quick_reply_send`):
```powershell
node dist/cli.js `
  --crm "<CRM_DIR>" `
  --state "<STATE_DIR>" `
  --native-manifest "<MANIFEST_PATH>" `
  --python "<PYTHON_EXE>" `
  --writes `
  --chat-id "<TARGET_CHAT_ID>"
```
All mutations will be strictly confined to `<TARGET_CHAT_ID>`. Calls attempting to dispatch to any other chat will be rejected with `TARGET_CHAT_MISMATCH`.

---

## 4. Troubleshooting Guide

| Issue / Error | Root Cause | Solution |
|---|---|---|
| `NATIVE_MANIFEST_MISMATCH` | The SHA-256 hash in `tdlib-manifest.json` does not match the actual `tdjson.dll` file. | Re-run `npm run generate:manifest "<PATH_TO_TDJSON_DLL>"` to update the manifest. |
| `WRITER_LOCK_ACQUISITION_FAILED` | Another instance of the MCP server or login script is holding `writer.lock` in the state directory. | Ensure only one server process is active per state directory. If a prior process crashed, inspect the process list and remove the stale lock file if no process is active. |
| `DPAPI_UNPROTECT_FAILED` | The session file was copied from another machine or another Windows user profile. | Session keys are protected with CurrentUser DPAPI and cannot be shared across machines. Re-run `dist/login.js` on the current machine. |
| `TARGET_CHAT_MISMATCH` | An action tool or quick-reply send was invoked with an unapproved chat ID. | In single-user mode, all writes are bound strictly to the chat specified in `--chat-id`. Ensure your requests target the bound chat ID. |
| `CRM_ACKNOWLEDGMENT_MISSING` | The CRM directory lacks the required consent marker. | Re-run `node dist/crm-init.js "<CRM_DIR>"` and follow the interactive consent prompt. |
