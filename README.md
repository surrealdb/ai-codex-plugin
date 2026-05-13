# Codex Plugin

Connect Codex to SurrealDB's first-party MCP server, plus curated SurrealDB agent skills.

This plugin ships:

- a bundled `.mcp.json` with ready-to-install HTTP MCP services for SurrealDB database, SurrealDB Cloud, and Spectron
- `mcp` Codex skill for connecting to SurrealDB's built-in MCP server
- synced upstream skills from `surrealdb/agent-skills` for SurrealQL, vector search, SDK usage, and related topics

## Requirements

- Either the local `surreal` CLI with the `surreal mcp stdio` subcommand, or a SurrealDB instance that exposes `/mcp` over HTTP.
- For HTTP mode, the endpoint URL for the SurrealDB MCP server.

## Configuration

## Bundled MCP Services

The plugin bundles these MCP services:

- `surrealdb-database` using `${SURREALDB_MCP_URL:-http://127.0.0.1:8000/mcp}` with `Authorization: Bearer ${SURREALDB_MCP_TOKEN}`
- `surrealdb-cloud` using `https://app.surrealdb.com/mcp` with `Authorization: Bearer ${SURREALDB_CLOUD_TOKEN}`
- `spectron` using `${SPECTRON_MCP_URL:-https://spectron.surrealdb.com/mcp}` with `Authorization: Bearer ${SPECTRON_MCP_TOKEN}`

Set the relevant environment variables before installing or using the plugin.

## Alternative Configuration

For local development, you can still prefer the built-in stdio transport:

```sh
codex mcp add surrealdb -- surreal mcp stdio
```

For HTTP mode, add the MCP server directly in Codex:

```sh
codex mcp add surrealdb --url "https://<instance>/mcp"
```

For a local instance:

```sh
codex mcp add surrealdb --url "http://127.0.0.1:8000/mcp"
```

If the HTTP endpoint accepts a ready-to-use access token or JWT in the `Authorization` header:

```sh
export SURREALDB_MCP_TOKEN="<access-token-or-jwt>"
codex mcp add surrealdb \
  --url "https://<instance>/mcp" \
  --bearer-token-env-var SURREALDB_MCP_TOKEN
```

Important:

- A `surreal-bearer-...` value is a bearer grant key, not automatically the token to send to `/mcp`.
- Bearer grant keys must first be exchanged through SurrealDB auth, typically `POST /signin` with the correct namespace, database, access method, and `key`, to obtain a JWT or session token.
- Use that resulting access token for HTTP MCP auth.
- If you already have a local SurrealDB process, `surreal mcp stdio` avoids this HTTP auth handoff entirely.

## How It Works

The plugin now bundles a prewired `.mcp.json` for the common SurrealDB HTTP endpoints while still allowing you to add or override MCP connections directly in your own Codex configuration.

## Upstream Skill Sync

This repo treats [`surrealdb/agent-skills`](https://github.com/surrealdb/agent-skills) as the upstream source for general SurrealDB knowledge skills.

To sync those skills into the Codex plugin:

```sh
./scripts/sync-agent-skills.sh
```

To sync from a local checkout instead of cloning:

```sh
./scripts/sync-agent-skills.sh --source /path/to/agent-skills
```

Notes:

- Synced skills are written into `plugins/surrealdb/skills/<skill-name>/`.
- The local `plugins/surrealdb/skills/mcp/` skill is protected and is not overwritten by the sync script.
- If an upstream skill contains a `references/` directory, it is copied alongside `SKILL.md`.
- The sync script itself is the source of truth for the upstream repo and ref.

## Usage

Once the MCP server is added, ask Codex things like:

- Inspect my SurrealDB schema.
- Run a read-only SurrealQL query.
- Explore records in this namespace and database.
- Help me troubleshoot my SurrealDB MCP connection.
- Write a SurrealQL query for graph traversal.
- Create an HNSW vector index for semantic search.
- Show how to connect to SurrealDB from Python.

Treat mutation requests as real database operations. Confirm intent before schema changes, bulk writes, deletes, permission changes, or storage changes.

## Troubleshooting

If tools do not appear, confirm the URL points to an MCP endpoint, not a normal SQL, REST, or WebSocket endpoint.

If `Authorization: Bearer surreal-bearer-...` returns `InvalidToken`, you are likely sending a bearer grant key directly to `/mcp`. Exchange it for a JWT first, or switch to `surreal mcp stdio` for local use.

If authentication fails with `--bearer-token-env-var`, confirm the env var contains the final access token or JWT, not the bearer grant key.

Use `codex mcp get surrealdb` or `codex mcp list` to inspect the current configuration.
