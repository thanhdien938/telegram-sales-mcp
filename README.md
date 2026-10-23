# Unofficial Telegram Sales MCP — portable source beta

Unofficial, single-user, Windows-first. Not affiliated with or endorsed by Telegram. First-party source is [MIT](LICENSE); third-party/native software keeps its own license. This source-only beta is prepared for distribution using a fresh project history; `private: true` blocks accidental npm publication.

**Source-only developer release:** Read [RUNBOOK.md](RUNBOOK.md) for the complete self-service clone, installation, TDLib build/integration, credential safety, manifest maintenance, and troubleshooting guide. The publisher does not supply a built native runtime or a tested Telegram login; native integration remains gated until a developer independently validates and updates it.

## Implemented versus qualified

**NATIVE_BUILD=HOLD; REAL_TELEGRAM_QUALIFIED=NO.** A portable native/auth/session implementation is now present as source, but no independent tdjson DLL was built or acquired and no real login/read has been run. Login and native-reopen commands are deliberately gated before they inspect supplied state/native files or request credentials. Changing an env variable, MCP field or manifest flag cannot remove that gate. A reviewed later code revision with native evidence is required.

Working offline: local stdio MCP discovery; 11 read-facing tool definitions; opt-in eight-tool SQLite CRM and quick-reply preview. Default health distinguishes MCP readiness, NOT_CONFIGURED Telegram provider and native build HOLD. In-memory/native-wire fake tests exercise authentication and read plumbing; they do not prove actual authenticated Telegram reads. Search/contacts/file metadata sources remain individually unqualified; download is denied.

New source includes bounded JSONL transport, a first-party Python ctypes wrapper for official tdjson C API, separate private terminal authentication, CurrentUser DPAPI helper, dedicated-root lock/vault/account binding and noninteractive reopen composition. Details and VERIFIED/UNKNOWN evidence are in [NATIVE_BUILD.md](NATIVE_BUILD.md). No native binary or user session is included.

All Telegram actions remain hard disabled at registration, write service, adapter, native read facade and wrapper whitelist. Retained write classes are source-only and cannot be enabled by a toggle. No send, reply, edit, delete, forward, reaction, pin, mark-read, media or schedule dispatch; no bulk/unsolicited messaging. No human write-approval framework has been implemented or claimed.

## Local usage

Node 22.19+; tested with Node 22.19.0, whose SQLite API is experimental. Native source targets Windows x64 with matching 64-bit Python 3.11+ and independently reviewed TDLib; those native prerequisites remain UNQUALIFIED. Offline Node/CRM mode does not need Python.

```powershell
npm ci --ignore-scripts --userconfig .npmrc --globalconfig config/npm-globalrc
npm run typecheck
npm run build
npm run test:offline
node dist/cli.js --help
node dist/login.js --help
```

MCP client command: `node`, args `["dist/cli.js"]`, cwd this source directory. stdout is protocol-only; no HTTP listener/tunnel. Local stdio is not ChatGPT Web/cloud connectivity. See [INSTALL.md](INSTALL.md) for CRM initialization and currently gated native command interfaces.

## Data and consent

CRM upserts mutate local SQLite and require private interactive acknowledgment before DB construction. Eight tools: lead upsert/get/list, group track/list, template upsert/list, preview. Preview cannot dispatch. SQLite CRM is not encrypted. The acknowledgment file is not authentication against a compromised same-user process.

Telegram/contact/message/lead/template results can be forwarded by an MCP client to AI/cloud services. Local storage does not guarantee local-only processing; obtain appropriate consent and review client/provider retention. Never put real credentials, records, sessions or diagnostics in public artifacts.

Future native login uses a separate private TTY, not MCP stdin or argv/env secrets. DPAPI source protects only explicitly sealed material; no claim all TDLib/files/CRM/RAM are encrypted. Wrong identity, corrupt vault, auth-required reopen or unconfirmed shutdown fails closed. See [SECURITY.md](SECURITY.md), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [CONTRIBUTING.md](CONTRIBUTING.md).
