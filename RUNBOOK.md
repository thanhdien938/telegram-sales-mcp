# Unofficial Telegram Sales MCP — Source-Only Runbook

**Edition:** Public-source handoff for `1.0.0-beta.2` candidate  
**Date:** 2026-10-22  
**Project:** `thanhdien938/telegram-sales-mcp` (proposed public GitHub repository; link only works once the owner publishes it)  
**License:** MIT for first-party redistributable code; third-party software keeps its own terms  
**Distribution model:** Source code and documentation. **No compiled TDLib, account session, private configuration, or turnkey Telegram client is included.**

> **Read this first.** This is an open-source development project, **not a verified ready-to-use Telegram client**. The candidate includes working *offline* MCP/CRM components and source for a portable TDLib wrapper, but its current native integration is intentionally blocked at `src/runtime/native-policy.ts` with `NATIVE_BUILD_STATUS = 'HOLD'`. The publisher has **not built or validated native TDLib**, performed real Telegram authentication, or qualified actual account reads in this source-only release. Users who want those features must independently build, integrate, test, and debug their own environment. Do not mistake a successful TypeScript build for native or end-to-end Telegram support.

## 1. What is included and what works

| Area | Status in the supplied source | Notes |
|---|---|---|
| Local stdio MCP server | Offline-verified | MCP tool discovery runs without a real Telegram provider |
| Eleven Telegram read-facing tool definitions | Exposed, **provider not configured by default** | Reads of real account data are **not qualified** |
| Eight local CRM / quick-reply tools | Offline-verified, explicit initialization required | Some tools write **only to the user's local SQLite database**; preview never sends messages |
| Python `tdjson` wrapper source | Included, mock-tested | Needs a separately built/verified Windows `tdjson.dll` and dependencies |
| Private terminal login source | Included, mock-tested | **Not usable until the native gate is properly reviewed and integrated** |
| DPAPI vault and reopen source | Included, mock-tested | Actual Windows DPAPI, account binding and session reopen not qualified |
| Telegram send/edit/delete/reaction/mark-read/media/schedule | **Hard-disabled** | Thirteen legacy write classes remain as source only; no normal setting enables them |
| HTTP endpoint / tunnel / ChatGPT Web remote connector | Not included | Stdio is for a local MCP client; it is **not** an HTTP MCP server |
| Production credentials, session, chat DB, owner runtime | Not included | Never migrate another person's session |

The archive is intentionally minimal. It does **not** guarantee that a later TDLib revision has precisely the same authorization schema as the current code. That compatibility work belongs to the person building and integrating the native layer.

## 2. Project layout

| Path | Purpose |
|---|---|
| `src/cli.ts`, `dist/cli.js` | Local stdio MCP server |
| `src/login.ts`, `dist/login.js` | Separate terminal login entry point (native-gated) |
| `src/crm-init.ts`, `dist/crm-init.js` | Opt-in creation of a new local CRM directory |
| `src/mcp/`, `src/domain/`, `src/telegram/` | MCP tools, Telegram read services and retained source |
| `src/policy/read-only.ts` | Allowed read-RPC list and unconditional Telegram write denial |
| `src/runtime/native-policy.ts` | `NATIVE_BUILD_STATUS = 'HOLD'` safety gate |
| `src/runtime/portable-provider.ts` | Native bundle verification, session setup and reopen composition |
| `src/runtime/native-integrity.ts` | Native manifest, DLL file hash and path validation |
| `src/runtime/session-store.ts` | Per-user state root, locks and account/session binding |
| `src/runtime/windows-vault.ts`, `native/windows_vault.py` | Windows DPAPI integration source |
| `src/runtime/auth-controller.ts`, `src/runtime/terminal-secrets.ts` | Private interactive authentication source |
| `src/runtime/native-channel.ts`, `src/runtime/native-process.ts` | JSONL transport and child process supervision |
| `native/tdjson_wrapper.py` | First-party wrapper using official TDLib JSON C API |
| `tests/public.test.mjs`, `tests/portable.test.mjs` | Synthetic Node offline tests |
| `tests/native_source_test.py` | Python/mock source tests; no actual DLL required |
| `EXPORT_MANIFEST.json`, `MANIFEST_FORMAT.md` | Source snapshot inventory and reproducible checksums |
| `scripts/refresh-manifest.mjs`, `scripts/verify-manifest.mjs`, `scripts/verify-export.mjs` | Candidate inventory/security checking helpers |
| `INSTALL.md`, `NATIVE_BUILD.md`, `SECURITY.md`, `THIRD_PARTY_NOTICES.md` | Companion documentation |

Use `README.md` as the public project overview. This runbook is the longer technical reference, including known gaps and self-service debugging guidance.

## 3. Prerequisites (user responsibility)

For the current **Windows-first** candidate:

- Windows 64-bit (native implementation specifically targets `win32-x64`); use a standard non-admin user account when possible.
- Node.js **22.19.0+** and npm; `node:sqlite` may be experimental in the version used.
- Python **3.11+**, 64-bit, with a normal executable. The project source/mock work used Python 3.13.7; that does not qualify all Python minors.
- Git, if cloning after the repository is published.
- To build TDLib independently: a compatible C++17/MSVC toolchain, CMake, OpenSSL, zlib and additional prerequisites per **official TDLib platform-specific instructions**. Exact versions, package managers and build flags are chosen and supported by the person building it.
- A personal Telegram account and, **only for a future working native installation**, the user's own Telegram `api_id`/`api_hash` from [my.telegram.org](https://my.telegram.org) → **API development tools**.

Official upstream references (review their current versions before building):

- TDLib sources/build: <https://github.com/tdlib/td> and <https://tdlib.github.io/td/build.html?language=Python>
- TDLib JSON C API: <https://core.telegram.org/tdlib/docs/td__json__client_8h.html>
- Obtaining personal Telegram API credentials: <https://core.telegram.org/api/obtaining_api_id>
- Telegram API Terms: <https://core.telegram.org/api/terms>
- TDLib Boost Software License: <https://github.com/tdlib/td/blob/master/LICENSE_1_0.txt>

**Never enter API credentials, phone numbers, login codes or 2FA passwords in a GitHub issue, CLI argument, environment variable intended for MCP, screenshot, example configuration, or an AI chat.** The private login program must use a trusted interactive terminal.

## 4. Obtain source and install Node dependencies

Once the public repository actually exists:

```powershell
# Example clone command; URL becomes usable only AFTER publication.
git clone https://github.com/thanhdien938/telegram-sales-mcp.git
cd telegram-sales-mcp

node --version
npm --version
python --version

# Review .npmrc and config/npm-globalrc before running on your PC.
npm ci --ignore-scripts --userconfig .npmrc --globalconfig config/npm-globalrc
```

`npm ci` uses the provided lockfile and requires network access to package registries. `--ignore-scripts` prevents npm lifecycle scripts from running during installation. The project deliberately sets `"private": true` in `package.json` to avoid accidental npm publication; it does **not** prohibit cloning or using the MIT source.

If you wish to compile or test the Node/Python source yourself, these are **user-executed optional commands**, not release requirements or claims that the publisher tested your environment:

```powershell
npm run typecheck
npm run build
npm run test:offline
python -I -B tests/native_source_test.py
npm run verify:manifest
npm run verify:export
```

Expected offline behavior: the stdio server can advertise read tools while Telegram remains `NOT_CONFIGURED`; offline tests may use synthetic sessions. A successful result **does not** mean TDLib or real Telegram login works.

## 5. Run the offline-only local MCP server

From the source directory **after installing dependencies and building if needed**:

```powershell
node dist/cli.js --help
node dist/cli.js
```

- The server speaks MCP on **stdin/stdout**. Its stdout must be reserved for the protocol; do not type ordinary commands into that live process.
- By default Telegram is `NOT_CONFIGURED`. Account/chat/message read calls may be unavailable. That is expected without a qualified native installation.
- **Eleven Telegram read-facing definitions** can be discovered by an MCP client; a definition is not a guarantee that the underlying provider is ready.
- Telegram writes remain disabled irrespective of model prompts, environment switches or client-provided arguments.

Example configuration for a **generic local stdio MCP client** (illustrative; each client has a different configuration format):

```json
{
  "command": "node",
  "args": ["C:/PATH/TO/telegram-sales-mcp/dist/cli.js"]
}
```

Some clients also need a working-directory (`cwd`) setting or an absolute script path. See the documentation of **your** MCP client. A locally spawned stdio process is **not a ChatGPT Web remote MCP endpoint**; this release contains no hosted HTTP server/tunnel.

## 6. Initialize the optional local CRM (no Telegram native required)

CRM changes local data; it does **not** send Telegram messages. It starts **disabled** and is enabled only after the user creates a new, empty, personally owned directory from a trusted local terminal.

```powershell
# Substitute a real absolute path to a directory that does NOT yet exist.
node dist/crm-init.js "C:\PATH\TO\NEW_PRIVATE_CRM"
```

The command should display a disclosure and require the exact acknowledgment from the private terminal. The directory must not already exist, must not be a symlink/junction, and should not be shared with TDLib state or the source repository.

After successful initialization:

```powershell
node dist/cli.js --crm "C:\PATH\TO\NEW_PRIVATE_CRM"
```

This exposes **eight local CRM/lead/group/template/quick-reply preview tools** in addition to read-facing tools. SQLite storage is **not automatically encrypted**. Protect the directory with normal OS permissions and do not put it in a shared or auto-synced folder without understanding that service's privacy policy. Quick-reply **preview never dispatches a Telegram message**.

Note that an MCP client, including one backed by a cloud AI service, may receive user-selected chats, messages, contacts, leads or templates. Local SQLite storage does not mean those outputs remain on the PC. Review Telegram's API terms, your MCP client's data practices and applicable consent obligations before enabling real-data access.

## 7. Independently build TDLib (`tdjson.dll`) — optional user work

**The publisher has not performed this build and does not ship compiled native artifacts.** This section describes the required workflow and known integration interface; it is **not** a prevalidated, universal Windows build recipe.

1. Consult the [official TDLib build instruction generator](https://tdlib.github.io/td/build.html?language=Python) and select Windows, Python/JSON interface and your toolchain. Install **its current required** MSVC/CMake/OpenSSL/zlib/gperf prerequisites.
2. Obtain an official upstream source revision from <https://github.com/tdlib/td>. **Pin an exact commit** and retain the source provenance and upstream license. Building `master` without pinning makes later troubleshooting non-reproducible.
3. Follow the exact instructions for your environment and compile the `tdjson` target in **Release / x64**. Example of generic CMake invocation *only after prerequisite/toolchain configuration*:

   ```powershell
   # Commands run in a separate TDLib source checkout, NOT in this MCP repository.
   cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
   cmake --build build --config Release --target tdjson
   ```

   Visual Studio and dependency-manager generators may require additional `-G`, architecture flags, include/library paths or environment setup; use the upstream generator rather than treating the two commands as a guarantee.
4. Collect **only** the user-built `tdjson.dll` and any DLLs that must reside alongside it into a **dedicated native bundle directory outside the MCP repo and outside the shared project parent directory**. Do not copy a production installation, cached session or another person's native runtime.
5. Record the exact upstream commit, compiler/ABI/architecture, dependency provenance and applicable notices. Hash **every DLL included in the bundle**:

   ```powershell
   Get-FileHash -Algorithm SHA256 -LiteralPath "C:\PATH\TO\NATIVE_BUNDLE\tdjson.dll"
   ```

6. Review [the current upstream JSON C API](https://core.telegram.org/tdlib/docs/td__json__client_8h.html). The wrapper expects `td_create_client_id`, `td_send`, `td_receive`, `td_execute`, correlation through `@extra`, and client identity through `@client_id`. Some TDLib authorization APIs can change between minor/patch versions; adapt and test against the **pinned build**.
7. **Do not change `NATIVE_BUILD_STATUS` to `VERIFIED` merely to make an error go away.** First perform your own actual native provenance, dependency/ABI and isolated-load checks. Only then may you review and modify `src/runtime/native-policy.ts` and rebuild **your fork**. Publishing a ready-to-run claim without that verification would be misleading.

### 7.1 Native bundle manifest contract

`src/runtime/native-integrity.ts` expects a JSON manifest **inside the native bundle directory**. The following is a **template with intentionally invalid placeholder values**; it is NOT a trusted signed manifest:

```json
{
  "schema": 1,
  "platform": "win32-x64",
  "protocol": 1,
  "upstream": "https://github.com/tdlib/td",
  "upstreamCommit": "REPLACE_WITH_EXACT_40_CHARACTER_UPSTREAM_COMMIT",
  "api": "td-json-1.x",
  "noticeReview": "OWNER_REVIEW_REQUIRED",
  "artifacts": {
    "tdjson.dll": "REPLACE_WITH_LOWERCASE_64_CHARACTER_SHA256"
  }
}
```

Add all other bundled DLL filenames and SHA256 values to `artifacts`. The currently implemented verifier requires `tdjson.dll`, scans for unlisted DLLs, and validates content hashes, bundle location and file types. It does **not** prove the upstream build is trustworthy, and manifest self-assertions are not cryptographic release signatures. Store this manifest and its DLLs in an independent directory with no inherited private Telegram files.

## 8. Fresh login with *your own* Telegram account — after native integration

**Not available in the published candidate until the user independently qualifies the native build and reviews the implementation.** After your own integration work is complete:

1. Obtain your own Telegram API application credentials via the official portal. Use a Telegram account you are authorized to operate.
2. Pick a **new, absent, absolute** state directory outside the repo and native bundle; keep it private to your Windows account.
3. Use a **real interactive terminal** for the separate login command; it rejects non-TTY input and must never ask the AI/MCP client to handle codes or passwords.
4. Example CLI shape (only for an independently qualified fork):

   ```powershell
   node dist/login.js --state "C:\PATH\TO\NEW_PRIVATE_TDLIB_STATE" --native-manifest "C:\PATH\TO\NATIVE_BUNDLE\manifest.json" --python "C:\PATH\TO\python.exe"
   ```

5. The source expects a private first-run acknowledgment, `CREATE_NEW_PRIVATE_SESSION`, then API ID/hash and any requested phone, login code or 2FA password through the terminal. Do not supply secrets in argv, environment flags, `.env`, JSON tool arguments, GitHub discussions or logs.
6. A successful private login should create user-owned state, seal selected credential material using Windows **CurrentUser DPAPI**, and bind the stored account/native identity. It does **not** claim to encrypt every TDLib/media/CRM file. Never transfer another person's vault/session directory.

The login source supports a bounded subset of auth states. Email verification, QR login, registration, changed upstream schema and platform-specific console behavior may need **user-owned implementation/debugging**. If the terminal or state transition fails, do not work around it by exposing credentials through MCP stdin.

## 9. Reopen an already authorized session — after native integration

The intended reopen command shape is:

```powershell
node dist/cli.js --state "C:\PATH\TO\EXISTING_PRIVATE_TDLIB_STATE" --native-manifest "C:\PATH\TO\NATIVE_BUNDLE\manifest.json" --python "C:\PATH\TO\python.exe"
```

With a separately initialized CRM, the local CLI also accepts its optional `--crm "C:\PATH\TO\NEW_PRIVATE_CRM"` pair. Both native and CRM state directories must be user-owned, outside the repo and not symbolic links or junctions.

Source-level expectations: the stored CurrentUser vault must unseal for the correct Windows user; the native bundle and account identity must match; a second process cannot own the same session. If credentials are missing, corrupted or reauthentication is required, **stop** and use the separate private login flow. Never automatically adopt an arbitrary existing TDLib DB, bypass a lock, or replace an account identity just because it is convenient.

Again, this path has **not** been verified against real native TDLib or a real account in the distributed version. It is a developer integration guide.

## 10. Safety boundaries that users should preserve

- Telegram action methods (send, reply, edit, delete, forward, reactions, pin/unpin, mark read, upload/media send, schedule) are deliberately disabled in the default public-source candidate. Do not enable them merely by setting an environment variable or removing a top-level registration check. The read RPC allowlist is enforced again at adapter/native transport levels.
- The login/auth private setup port is not part of the MCP tool surface. Do not expose generic `td_send`, raw RPC, OTP, password or account switching as an AI-controlled tool.
- Local CRM writes, if opted in, are separate from Telegram actions and remain the user's responsibility.
- Avoid logging plaintext credentials, chat contents, customer databases, phone numbers and Telegram session artifacts.
- Do not promise that Telegram data remains local when it is returned through a cloud-backed MCP client. Respect the current [Telegram API Terms](https://core.telegram.org/api/terms) and user/client privacy requirements, including restrictions on AI/ML uses.
- Do not set up an HTTP listener on a public interface or create an unauthenticated tunnel from this stdio-only source release.
- Old private repository docs, historical Git commits, production runtime, tokens, user IDs and customer materials are not redistributable parts of this candidate.

## 11. Troubleshooting (self-service)

| Observation / error | Likely cause | User's next check |
|---|---|---|
| `NATIVE_BUILD_HOLD` | Intentional source gate | Review `NATIVE_BUILD.md`; independently build/verify TDLib and wrapper before adapting your own fork |
| `NOT_CONFIGURED` in Telegram health | MCP server is running without native provider | This is expected offline-only behavior, not proof Telegram is down |
| `PUBLIC_START_REJECTED` | Bad options, CRM consent path, or native reopen rejected | Run `--help`; check CLI argument pairs, absent vs existing state semantics, and path permissions; don't dump secrets |
| `PRIVATE_LOGIN_UNAVAILABLE_NATIVE_BUILD_OR_SETUP_HOLD` | Native gate, TTY or setup failure | Do not enter credentials until native is qualified; use a real local terminal and review native/auth contracts |
| `NATIVE_PROVENANCE_REJECTED` / `NATIVE_INTEGRITY_REJECTED` | Manifest layout, hash, source commit or artifacts do not match | Rebuild a dedicated bundle, calculate local hashes, review every dependency and manifest field |
| DLL load error / missing export / wrong architecture | Incorrect tdjson build, dependent DLL, ABI or Python bitness | Check x64, pinned TDLib JSON ABI, all required DLLs and OS loader prerequisites |
| Auth state unsupported / timeout | TDLib version-specific login state or transport timing | Inspect pinned TDLib docs and test in an isolated personal account; avoid insecure automatic retries |
| `WINDOWS_DPAPI_REQUIRED` / `DPAPI_OPERATION_FAILED` | Unsupported OS/host or failed CurrentUser operation | Use Windows under the same logged-in user; inspect local permissions and helper process without printing secret inputs |
| Session lock / identity mismatch | Another process, wrong account/native bundle or inconsistent state | Stop own process cleanly; do not forcibly delete another process's lock or reuse an unrelated state directory |
| CRM missing acknowledgment | Initializer not run in interactive terminal, or path already exists | Use a **new absent** directory and the dedicated initializer, not an MCP tool parameter |
| `ERR_MODULE_NOT_FOUND` | Dependencies not installed or stale compiled `dist` | Run your own `npm ci` and optionally `npm run build`; check Node version |
| Manifest verification fails after edits | Manifest hashes the old exported tree | Run `npm run manifest:refresh` followed by `npm run verify:manifest` on your edited copy |
| ChatGPT Web cannot connect to local stdio | No remote HTTP MCP bridge | A separate explicitly designed/secured bridge would be required; **not shipped** |

For debugging, reproduce failures in your **own new directory and account**. Redact API hashes, credentials, chat IDs, customer text, local session roots and native crash dumps before sharing diagnostic reports. A screenshot showing a live login code or real chat is not an acceptable public issue attachment.

## 12. Developer checks and known test limits

The candidate includes automated offline tests, but users should not treat the previous developer's results as guarantees for their environment. Optional self-tests are:

```powershell
npm run typecheck
npm run build
npm run test:offline
python -I -B tests/native_source_test.py
npm run verify:manifest
npm run verify:export
```

The prior candidate review reported **36 Node synthetic tests and 5 Python mock tests** passing on Windows Node 22.19.0 / Python 3.13.7. These mock tests do not load `tdjson.dll`, exercise a real DPAPI vault/login, connect to Telegram, or prove that all 11 real read methods work. Failures from later native/OS versions are user-debugging tasks, not evidence that the publisher advertised a tested native release.

The native wire interface uses `@extra` correlation and a read-only method list. Reference [TDLib JSON C API](https://core.telegram.org/tdlib/docs/td__json__client_8h.html) for request/response ordering, single-receiver constraints and version changes. The C API is distinct from this repository's custom JSONL framing between Node and the Python wrapper; debugging must account for both boundaries.

## 13. Maintaining the export manifest after documentation or source changes

The candidate uses **manifest schema 2**. It lists candidate-relative paths, individual SHA256 hashes and a canonical tree digest; the manifest itself is excluded from that digest. A canonical record consists of UTF-8 NFC path, a NUL byte, lowercase hex SHA256(raw file bytes), and a newline. Records are sorted by UTF-8 byte order.

After **any** edit, including copying this runbook into the public candidate, refresh its manifest **in that candidate**:

```powershell
node scripts/refresh-manifest.mjs
node scripts/verify-manifest.mjs
node scripts/verify-export.mjs
```

These commands inspect the candidate tree and update/verify its inventory; they are **not native builds or login tests**. Review their source before executing on your own system. Do not include `.git`, `node_modules`, `.npm-cache`, `.qa`, private credentials, binaries, `.env`, SQLite, authentication/session files or old private documentation in the published snapshot. Never try to repair manifest mismatches by silently excluding unexpected sensitive files; first remove such files from the candidate safely.

## 14. Source-only release checklist for the maintainer

**A source-only release does not require the maintainer to build TDLib, authenticate with Telegram or run live smoke tests.** It does require accuracy and privacy in the actual files made public.

- [ ] Publish only the reviewed, isolated candidate. **Never change the original private Telegram Sales production repository to Public.**
- [ ] Keep a **new Git history**; do not copy the original private `.git`, tags or commit objects. No live session or runtime artifacts.
- [ ] Keep `LICENSE` MIT only for first-party redistributable source; retain accurate third-party notices and TDLib's Boost license.
- [ ] Include `README.md`, `INSTALL.md`, `NATIVE_BUILD.md`, `SECURITY.md`, `THIRD_PARTY_NOTICES.md` and this `RUNBOOK.md`.
- [ ] Link to this runbook from README and label the release **SOURCE-ONLY / NATIVE NOT VERIFIED / REAL TELEGRAM LOGIN NOT TESTED**.
- [ ] Leave Telegram Write hard-disabled and the native qualification gate intact.
- [ ] Recheck tracked candidate filenames/content for secrets, original private paths, sessions and accidental archives; don't rely only on old audit results.
- [ ] Regenerate and verify the manifest after inserting this runbook and editing README.
- [ ] Confirm the exact intended GitHub destination and its privacy setting before separately authorizing `git init`, commit, push or making it Public.
- [ ] Do not promise turnkey Windows support, real Telegram read success, remote ChatGPT connectivity or binary downloads that have not been verified.
- [ ] Provide a GitHub Issues template requesting redacted, synthetic reproducible examples; discourage actual credentials/account/chat data.

The source-only release may be tagged as a development/beta source snapshot, **not** a stable binary or tested native distribution. Future fixes, native build recipes and portability contributions can be submitted through ordinary pull requests if the repository owner chooses.

## 15. Maintainer: publish a new GitHub repository (only after owner authorizes publication)

This section is for the **source maintainer**, not an action performed as part of this runbook. No GitHub repository was created, committed to or made public when this document was prepared.

1. Copy this document into the reviewed candidate root as `RUNBOOK.md` and link it from `README.md` (e.g., `[Source-only installation and troubleshooting runbook](RUNBOOK.md)`). Do not edit or replace the private production repository.
2. Keep the candidate as a **separate source tree** with no old `.git`, old commits, historical operational `docs`, session, customer data, private config or runtime binaries. A plain copy of Git-tracked files is safer than cloning an existing private repository with its history.
3. Before creating **any** new Git metadata, inspect the candidate and refresh its snapshot metadata:

   ```powershell
   node scripts/refresh-manifest.mjs
   node scripts/verify-manifest.mjs
   node scripts/verify-export.mjs
   ```

   The last script is designed to reject a `.git` folder in the *export candidate*. **Run it before** `git init`; afterward, run future export checks on a separate history-free staging copy instead of weakening a scanner solely to accommodate fresh `.git`.
4. Review the final file list, `LICENSE`, `THIRD_PARTY_NOTICES.md` and README status language. If the only release is **source-only**, explicitly say **"Native TDLib not built or tested by maintainer; login and real Telegram reads unqualified."** No native DLL or private credentials should be staged.
5. With explicit owner permission, create a **new empty repository** under the intended account (e.g., `thanhdien938/telegram-sales-mcp`). Do **not** use import-from-private-repository or a mirror push. Confirm the target URL and selected visibility before uploading.
6. In the *clean candidate only*, after inspecting `.gitignore` and the review snapshot, initialize a new Git history and review what will actually be committed:

   ```powershell
   # Example of OWNER-executed commands ONLY, after the publication decision.
   git init -b main
   git add -A
   git status --short
   git diff --cached --name-only
   # Compare the staged paths with the reviewed public manifest before proceeding.
   git commit -m "Initial source-only beta release"
   git remote add origin https://github.com/thanhdien938/telegram-sales-mcp.git
   git push -u origin main
   ```

   If the remote repository already has commits or the staging list differs from the approved export, **stop and reconcile**; do not force-push or merge private history. These commands are documented for the owner/user; **they have not been executed**.
7. Once the owner intentionally makes the new repository Public, confirm the README renders correctly, the source-only limitations are visible, MIT and third-party notices are present, and GitHub downloads contain no private/production files. Create a release/tag or update a website **only through another explicitly chosen action**, not automatically.

## 16. Ownership, license and support expectations

The first-party candidate states `Copyright (c) 2026 thanhdien938` and uses the MIT License. That statement covers first-party code subject to the owner's rights to distribute it. TDLib and other third-party packages are subject to their own licenses and notices. The application is **unofficial** and is not affiliated with or endorsed by Telegram.

**Support model:** source and documentation are provided *as is*. Users are responsible for their environment, toolchain, native build, credentials, test account, lawful data processing, debugging and deployment. The maintainer is not claiming that real login or every Telegram read method was successfully executed in the distributed release. Security issues should be reported without any real secret or customer data; consult `SECURITY.md`.

---

### Primary authoritative upstream references

1. TDLib upstream project and Boost license: <https://github.com/tdlib/td>
2. Official Windows build instructions generator: <https://tdlib.github.io/td/build.html?language=Python>
3. TDLib C JSON API documentation: <https://core.telegram.org/tdlib/docs/td__json__client_8h.html>
4. TDLib concepts: <https://core.telegram.org/tdlib/getting-started>
5. Telegram API app credentials: <https://core.telegram.org/api/obtaining_api_id>
6. Telegram API Terms: <https://core.telegram.org/api/terms>

*This runbook documents the observed P1 R2 source snapshot as of 2026-10-22. It does not represent a native build or end-to-end acceptance test.*