# Contributing

Use newly authored TEST_ONLY synthetic data. Never copy private chats, contacts, target IDs, account/session credentials, screenshots or customer records into source, tests, issue reports or artifacts.

Review package scripts and test imports first. The supported offline sequence is `npm run typecheck`, `npm run build`, `npm run test:offline` after `npm ci --ignore-scripts`. Tests use fake TDLib, in-memory/local subprocess MCP and disposable SQLite directories under `.qa/`. No public network, native login, protected external root, real backend or Telegram action is part of tests. Cleanup targets only directories created by that test.

Keep Telegram writes disabled at registration AND lower dispatch boundaries. Do not add env/model/argument-based send enablement, automatic retry after uncertainty, bulk messaging, tunnel defaults or unverified native downloads. Keep stdout protocol-only; redact error output and avoid content logging.

Any native integration, secure setup/vault or write capability needs separate architecture/provenance review and negative tests. Add newly owned fixtures and preserve third-party notice obligations. Do not broaden tests to historical live qualification harnesses.

Portable tests are tests/portable.test.mjs and tests/native_source_test.py. They use fake wire/TTY/vault/C libraries only. Never replace them with actual DPAPI, DLL loading, a real native fixture or an existing user session without distinct scoped approval. Run Python tests with -I -B to avoid importing local/private modules or generating bytecode. Keep the explicit native build HOLD until reviewed build/provenance evidence, not merely green mock tests.
