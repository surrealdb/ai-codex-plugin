# SurrealDB Codex Marketplace

A Codex plugin marketplace from SurrealDB. It currently ships two plugins:

| Plugin | What it connects | Ships |
| --- | --- | --- |
| [`surrealdb`](plugins/surrealdb/) | Your SurrealDB instance's `/mcp` route | Instance MCP plus SurrealDB skills for SurrealQL, vector search, SDK usage, and related workflows |
| [`spectron`](plugins/spectron/) | Your Spectron instance's `/mcp` route | Instance MCP plus a Spectron usage skill |

## Requirements

- Codex with local marketplace support.
- A SurrealDB or Spectron instance that exposes MCP over HTTP.
- The instance MCP endpoint URL, typically `https://<instance>/mcp`.

## Install From GitHub

Add this repo as a marketplace, then install whichever plugins you want:

```sh
codex plugin marketplace add surrealdb/ai-codex-plugin --ref main
codex plugin add surrealdb@surrealdb
codex plugin add spectron@surrealdb
```

## Install From A Local Checkout

The repo-local marketplace manifest lives at `.agents/plugins/marketplace.json`.

From this repository root, add the marketplace:

```sh
codex plugin marketplace add "$PWD"
```

Then install either plugin from the `surrealdb` marketplace:

```sh
codex plugin add surrealdb@surrealdb
codex plugin add spectron@surrealdb
```

## MCP Configuration

Each plugin bundles a Codex `.mcp.json` descriptor. The endpoint URLs are instance-specific, so set the environment variables before starting Codex or before opening a new task that should use the MCP tools.

For SurrealDB:

```sh
export SURREALDB_MCP_URL="https://<instance>/mcp"
export SURREALDB_MCP_TOKEN="<access-token-or-jwt>"
```

For Spectron:

```sh
export SPECTRON_MCP_URL="https://<instance>/mcp"
export SPECTRON_MCP_TOKEN="<access-token-or-jwt>"
```

The bundled MCP server names are:

- `surrealdb-database`
- `spectron`

If you prefer manual Codex MCP configuration instead of the bundled plugin descriptors, add the servers directly:

```sh
codex mcp add surrealdb-database \
  --url "https://<instance>/mcp" \
  --bearer-token-env-var SURREALDB_MCP_TOKEN

codex mcp add spectron \
  --url "https://<instance>/mcp" \
  --bearer-token-env-var SPECTRON_MCP_TOKEN
```

If the endpoint supports OAuth, authenticate after adding it manually with `codex mcp login surrealdb-database` or `codex mcp login spectron`.

For local development, you can still prefer the built-in stdio transport:

```sh
codex mcp add surrealdb-database -- surreal mcp stdio
```

Important:

- A `surreal-bearer-...` value is a bearer grant key, not automatically the token to send to `/mcp`.
- Bearer grant keys must first be exchanged through SurrealDB auth, typically `POST /signin` with the correct namespace, database, access method, and `key`, to obtain a JWT or session token.
- Use that resulting access token for HTTP MCP auth.

## How It Works

Each plugin installs skills, presentation metadata, and a Codex MCP descriptor. The descriptors intentionally read endpoints and bearer tokens from environment variables because the URL depends on the user's SurrealDB or Spectron instance.

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
- The local `plugins/surrealdb/skills/database-mcp/` skill is protected and is not overwritten by the sync script.
- If an upstream skill contains a `references/` directory, it is copied alongside `SKILL.md`.
- The sync script itself is the source of truth for the upstream repo and ref.

## Usage

Once the plugin is installed and the MCP server is configured, ask Codex things like:

- Inspect my SurrealDB schema.
- Run a read-only SurrealQL query.
- Explore records in this namespace and database.
- Help me troubleshoot my SurrealDB MCP connection.
- Help me troubleshoot my Spectron MCP connection.
- Write a SurrealQL query for graph traversal.
- Create an HNSW vector index for semantic search.
- Show how to connect to SurrealDB from Python.

Treat mutation requests as real database operations. Confirm intent before schema changes, bulk writes, deletes, permission changes, or storage changes.

## Troubleshooting

If tools do not appear, confirm the URL points to an MCP endpoint, not a normal SQL, REST, or WebSocket endpoint.

If `Authorization: Bearer surreal-bearer-...` returns `InvalidToken`, you are likely sending a bearer grant key directly to `/mcp`. Exchange it for a JWT first, or switch to `surreal mcp stdio` for local use.

If authentication fails with `--bearer-token-env-var`, confirm the env var contains the final access token or JWT, not the bearer grant key.

Use `codex mcp get surrealdb-database`, `codex mcp get spectron`, or `codex mcp list` to inspect the current configuration.
