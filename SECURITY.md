# Security and privacy boundaries

Source beta; native build HOLD and REAL_TELEGRAM_QUALIFIED=NO. No exhaustive security/secret-free certification. No actual native/DPAPI/session/real account test in this task.

Telegram actions stay unconditionally denied at registrar, write service, adapter, NativeReadTransport and wrapper read allowlist. Unknown methods and auth RPCs through the MCP read channel are denied. The separate private setup port is fresh/reopen-mode and exact auth-state bound; after Ready it cannot be reused to authenticate. Reopen cannot prompt or switch account. No retry after timeout/ambiguous state; malformed/oversized/cross-client framing fails closed.

Private setup reads only a TTY without echo, uses bounded timeouts/cancellation and restores raw/paused state or fails closed. Credentials never come from CLI argv/env or model/tool fields. DPAPI helper input/output uses private child pipes, not MCP stdio. API/database material is sealed CurrentUser with root context; manifest uses keyed account/root binding. Corrupt/unsealed/transplanted state or mismatched native bundle/account is refused. This is not protection against a compromised same-user OS/terminal, malicious Python/DLL or rollback by that user.

Dedicated state/native roots must pass canonical/reparse/overlap checks. Fresh refuses any existing root; reopen accepts only the app's own schema/sealed state and exclusive writer lock. Link/hardlink state files rejected. No automatic stale-lock deletion; unconfirmed shutdown retains lock. Same-user time-of-check/time-of-use filesystem replacement cannot be ruled out by path checks alone. OS filesystem permission hardening and real cleanup/recovery need independent Windows qualification; no privileged service is installed.

Only explicitly sealed data is protected by DPAPI. TDLib receives a generated database key, but actual binary/database encryption behavior is not verified and no guarantee covers all TDLib/files/media, process memory or unencrypted CRM. Do not store sensitive beta data without appropriate controls.

CRM remains separately opt-in before constructor/schema, eight local tools and preview only; marker is acknowledgment, not same-user authentication. MCP results can reach client/cloud/AI retention/sharing systems; obtain appropriate consent and minimize disclosure. No content, credential or native stderr logging. Untrusted received text never expands machine/auth/write authority.

Never include real API values, phone/code/password, account/message/customer records, vault/session/native artifacts, endpoint or logs in public reports. Request a private security reporting channel from maintainer before sharing sensitive evidence; a dedicated reporting address is not configured. Use TEST_ONLY reproductions and do not send real messages.
