# Installation and qualification boundaries

## Offline source/CRM commands

Node 22.19+ and npm; Windows Node 22.19.0 was used for current source QA. SQLite emits an experimental warning. Other platforms/minor versions are unqualified.

```powershell
npm ci --ignore-scripts --userconfig .npmrc --globalconfig config/npm-globalrc
npm run typecheck
npm run build
npm run test:offline
python -I -B tests/native_source_test.py
node dist/cli.js --help
node dist/crm-init.js --help
node dist/login.js --help
```

Python mock tests use standard library only and never load TDLib/DPAPI. Dependencies use the public npm registry, candidate-local cache/config and disabled lifecycle hooks; no personal registry login is needed. Tests create disposable, unmistakable TEST_ONLY fixtures under `.qa/`, not production paths. Positive real terminal/native/account tests are NOT_RUN.

For a local MCP client spawn `node dist/cli.js` with this directory as cwd. Eleven read definitions are discoverable; Telegram stays NOT_CONFIGURED without a qualified provider. No network listener or cloud bridge is created. Client disconnect/Ctrl+C closes only this process/resources it owns.

## Optional local CRM

In a private interactive terminal, choose your own absolute, absent directory outside application repositories/state. The placeholder below is not a literal Windows path:

```powershell
node dist/crm-init.js "<ABSOLUTE_ABSENT_CRM_DIRECTORY>"
node dist/cli.js --crm "<ABSOLUTE_INITIALIZED_CRM_DIRECTORY>"
```

Read the disclosure and type the requested acknowledgment; no schema/open before consent. Noninteractive input, arbitrary existing roots and path/DB/marker links are refused. This local permission is not Telegram-send permission. Eight local tools appear only after accepted store opening. Do not use real customer data during beta qualification.

## Native setup — source interface present, execution HOLD

Verified upstream guidance: [official TDLib build generator](https://tdlib.github.io/td/build.html?language=Python), [official source/build overview](https://github.com/tdlib/td#building), [official JSON C API](https://core.telegram.org/tdlib/docs/td__json__client_8h.html). These are reference links, not a supplied binary or a successfully reproduced install recipe. [NATIVE_BUILD.md](NATIVE_BUILD.md) lists missing commit/compiler/dependency/ABI evidence. Do not use an existing account's binaries/session or random download.

After a distinct reviewed build/qualification revision ONLY, the source interfaces are intended to be:

```text
node dist/login.js --state <ABSOLUTE_ABSENT_STATE_ROOT> --native-manifest <ABSOLUTE_REVIEWED_MANIFEST> --python <ABSOLUTE_64BIT_PYTHON>
node dist/cli.js --state <ABSOLUTE_OWNED_STATE_ROOT> --native-manifest <ABSOLUTE_REVIEWED_MANIFEST> --python <ABSOLUTE_64BIT_PYTHON>
```

**Do not treat these as validated native setup commands today.** Current build gate rejects before opening native/state or prompting. `npm run login -- --help` is safe help only. No actual phone/code/2FA has been submitted.

Fresh source flow: explicit new-session acknowledgment, own Telegram API app credentials entered without echo, phone/code/2FA only as requested privately, bounded state transitions, verified Ready account binding, sealed vault and close. Native setup RPC authority is private to this command, never a tool. Unsupported email/QR/registration states stop; no automatic retry.

State root must be new, non-reparse, non-overlapping with this project, its sibling workspace parent or native bundle root; there is no implicit home/session path. Reopen requires marker/vault/account/native binding and exclusive writer lock. Auth-required/unseal/identity failure stops and requests separate private terminal setup, with no prompt on MCP stdin. Crash/unconfirmed cleanup leaves the lock and fails closed; no automatic stale-lock deletion, migration, session adoption or root removal. Resolve recovery only after a separately reviewed ownership check.

A provenance manifest is not self-certified by hashes: review official upstream commit, build recipe/compiler/architecture, all DLL dependencies/notices and our wrapper source. Current accepted manifest shape is an internal integrity contract, not a ready-made binary trust grant. Native assets are not bundled. Node/Python/DLL architecture and exact TDLib API revision must be independently qualified before any native gate revision.
