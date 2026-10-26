# Unofficial Telegram Sales MCP — 33-Tool Parity

Unofficial, single-user, Windows-first Model Context Protocol (MCP) server providing full 33-tool functional parity with Telegram Sales Plugin v1. Not affiliated with or endorsed by Telegram. First-party source code is licensed under [MIT](LICENSE).

This release restores complete capability across Telegram reads, authorized Telegram actions, and local Sales CRM persistence:
- **11 Telegram Read tools** (health, capabilities, account profile, chat lists, chat inspection, unread inbox, message history, messages search, public search, contacts directory, bounded file retrieval).
- **13 Telegram Action tools** (send, reply, edit, delete, forward, reaction add, reaction remove, pin, unpin, mark-read, media send, text schedule, media schedule).
- **9 Sales CRM tools** (lead upsert, lead get, lead list, group tracking, group list, quick-reply template upsert, quick-reply list, quick-reply preview, and quick-reply send).

## Architecture and Safety Controls

- **Single-User Target Binding:** Outbound Telegram actions are disabled by default. When explicitly enabled via `--writes --chat-id <CHAT_ID>` (or environment variables `TELEGRAM_SINGLE_USER_WRITES=1` and `TELEGRAM_SINGLE_USER_CHAT_ID=<CHAT_ID>`), every mutation is strictly constrained to the single operator-approved chat. The model cannot supply arbitrary recipient IDs.
- **Idempotency & Audit Ledger:** All write operations enforce unique client request keys and store cryptographic SHA-256 fingerprints to guarantee strict deduplication and audit traceability.
- **Local SQLite CRM:** Sales leads and quick-reply templates are stored in a local SQLite database requiring explicit operator consent before database creation.
- **Isolated Native TDLib Wrapper:** A Python 3.11+ ctypes wrapper interfaces with the official TDLib JSON C API (`tdjson.dll`), enforcing frame boundaries, log stream suppression, and dedicated subprocess isolation.
- **Windows DPAPI Vault:** Sensitive session metadata and account credentials are encrypted at rest using Windows CurrentUser Data Protection API (DPAPI).
- **Diagnostics First:** Built-in `doctor` command inspects local Node, Python, native DLL manifests, session roots, and CRM stores, outputting clear health status and remediation steps.

## Tool Inventory (33/33 Parity)

| Category | Count | Tools |
|---|---|---|
| **Telegram Read** | 11 | `telegram_health`, `telegram_capabilities`, `telegram_account`, `telegram_chats_list`, `telegram_chat_get`, `telegram_inbox`, `telegram_messages_get`, `telegram_messages_search`, `telegram_public_search`, `telegram_contacts`, `telegram_file_get` |
| **Telegram Action** | 13 | `telegram_message_send`, `telegram_message_reply`, `telegram_message_edit`, `telegram_message_delete`, `telegram_message_forward`, `telegram_message_reaction_add`, `telegram_message_reaction_remove`, `telegram_message_pin`, `telegram_message_unpin`, `telegram_message_mark_read`, `telegram_message_media_send`, `telegram_message_text_schedule`, `telegram_message_media_schedule` |
| **Sales CRM** | 9 | `telegram_sales_lead_upsert`, `telegram_sales_lead_get`, `telegram_sales_leads_list`, `telegram_sales_group_track`, `telegram_sales_groups_list`, `telegram_sales_quick_reply_upsert`, `telegram_sales_quick_replies_list`, `telegram_sales_quick_reply_preview`, `telegram_sales_quick_reply_send` |

## Quick Start on Windows

### 1. Prerequisites
- **Operating System:** Windows 10/11 64-bit (x64)
- **Node.js:** v22.19.0 or higher
- **Python:** v3.11+ 64-bit (standard distribution with `ctypes`)
- **TDLib:** 64-bit `tdjson.dll` (built from official upstream source or acquired from vetted release)

### 2. Install & Build
```powershell
npm ci --ignore-scripts --userconfig .npmrc --globalconfig config/npm-globalrc
npm run build
npm run test:offline
```

### 3. Run Doctor Check
```powershell
npm run doctor
```
The doctor diagnostics will report the status of Node, Python, TDLib manifest/DLL, session root, CRM database, and write opt-in configuration.

### 4. Setup Steps
Refer to [INSTALL.md](INSTALL.md) and [RUNBOOK.md](RUNBOOK.md) for full setup instructions:
1. Generate native TDLib manifest: `node scripts/generate-native-manifest.mjs <PATH_TO_TDJSON_DLL>`
2. Authenticate account in private terminal: `node dist/login.js --state <STATE_DIR> --native-manifest <MANIFEST_PATH> --python <PYTHON_EXE>`
3. Initialize local CRM database: `node dist/crm-init.js <CRM_DIR>`
4. Launch MCP Server with 33 tools:
   ```powershell
   node dist/cli.js --crm <CRM_DIR> --state <STATE_DIR> --native-manifest <MANIFEST_PATH> --python <PYTHON_EXE> --writes --chat-id <TARGET_CHAT_ID>
   ```

## License and Notices
First-party TypeScript and Python code is licensed under [MIT](LICENSE). Upstream TDLib is licensed under the Boost Software License 1.0. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [SECURITY.md](SECURITY.md).
