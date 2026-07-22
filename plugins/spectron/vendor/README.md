# Vendored Spectron SDK

`spectron.cjs` is the dependency-free CommonJS distribution from
`@surrealdb/spectron@1.0.0-alpha.1`.

It is vendored so plugin hooks remain self-contained after Codex installs the
plugin and never need to run `npm install` or `npx` during a conversation.

- Package: <https://www.npmjs.com/package/@surrealdb/spectron/v/1.0.0-alpha.1>
- Source: <https://github.com/surrealdb/surrealdb.js>
- SHA-256: `26e4642dca87b0267e8d2ea7a3a78588c16f5015b7775a6406d8dd4f7b33545b`
- License: Apache-2.0; see `SPECTRON-SDK-LICENSE.txt`.

To update it, download the intended package version with `npm pack`, replace
`dist/spectron.cjs`, copy the package license, update the version and checksum
above, and rerun `node --test tests/spectron-hook.test.js`.
