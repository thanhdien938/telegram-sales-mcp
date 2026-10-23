# Native provenance and build status

NATIVE_BUILD=HOLD. Windows x64 source target; Node 22.19.0 and Python 3.13.7 used only for source/mock QA (Python 3.11+ source target unqualified outside that environment); no real DLL load, native compile, session, login or account read performed. Source/fake verification does not qualify a binary. Tool inspection found no CMake/MSVC on the audited PATH; it was not a scan of private installations.

## Independently observed official references (2026-10-22)

- [TDLib source/build overview](https://github.com/tdlib/td#building) and [build generator](https://tdlib.github.io/td/build.html?language=Python): upstream build guidance and platform choices. No build executed here.
- [JSON C API documentation](https://core.telegram.org/tdlib/docs/td__json__client_8h.html) and [upstream header](https://raw.githubusercontent.com/tdlib/td/master/td/telegram/td_json_client.h): asynchronous JSON interface, correlation via extra metadata and serialized receive. Our wrapper binds td_create_client_id, td_send, td_receive, td_execute; one receive thread and owned client only. No deprecated private custom ABI reused.
- [TDLib license](https://github.com/tdlib/td/blob/master/LICENSE_1_0.txt): Boost Software License, separate from first-party MIT; dependency notices still require distribution-specific review.
- [Microsoft protect](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata) and [unprotect](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptunprotectdata): basis for CurrentUser/no-machine-scope/UI-forbidden helper contract. Actual DPAPI was not invoked.

Unpinned live documentation confirms interface intent, not compatibility with a selected binary. Native source revision/ABI/dependent-library versions and trusted artifact hashes are UNKNOWN. Official references must not be read as third-party legal clearance.

## First-party wrapper design

native/tdjson_wrapper.py is newly authored Python standard-library ctypes source. It loads only an explicitly selected DLL with restricted Windows DLL search flags, disables native log stream with an acknowledgment, bounds JSONL/queue/frame sizes, matches request IDs, forwards updates, checks client identity and rejects unknown/write RPCs. Setup requests are mode/state-bound and never exposed by the read facade. EOF asks only its own native client to close, with bounded parent cleanup; no production process enumeration/termination.

native/windows_vault.py is a separate private pipe helper for Windows CurrentUser DPAPI. No secret argv/env/MCP stdin; no plaintext fallback. Application context, root and account binding are also checked. Python/JavaScript strings and OS/runtime memory are not guaranteed zeroized. DPAPI protects the sealed vault, not every media file, SQLite CRM or all TDLib state.

## Evidence required before removing HOLD in reviewed code

1. Exact official upstream commit/source archive origin and license; a reproducible Windows x64 build recipe with compiler, CMake, Python and dependency versions (including cryptography/compression notices).
2. Exact tdjson ABI/API schema and protocol compatibility, all dependent DLLs, architecture, hashes derived from the reviewed build and manifest trust review. No copy/hash pins from another account's runtime.
3. Review first-party wrapper/helper and DLL search/loading/timeouts/shutdown; actual Windows helper/native tests on disposable owned roots with no existing sessions.
4. Distinct Owner permission before any real authentication/read qualification. Current audit task supplies none.

A later native gate change is a reviewed source change, not an env/config/model toggle. Integrity checks alone never establish provenance. No manifest example with fabricated real hashes or ready-to-use credentials is supplied.
