# SurrealDB MCP Codex Plugin

Connect Codex to a SurrealDB MCP endpoint.

This plugin ships skills and setup guidance for SurrealDB MCP. It does not bundle an `.mcp.json` or launcher script.

## Requirements

- A SurrealDB instance that exposes MCP over HTTP.
- The endpoint URL for the SurrealDB MCP server.

## Configuration

Add the MCP server directly in Codex:

```sh
codex mcp add surrealdb --url "https://<instance>/mcp"
```

For a local instance:

```sh
codex mcp add surrealdb --url "http://127.0.0.1:8000/mcp"
```

Add personal auth token:

```sh
export SURREALDB_MCP_TOKEN="<token>"
codex mcp add surrealdb \
  --url "https://<instance>/mcp" \
  --bearer-token-env-var SURREALDB_MCP_TOKEN
```

## How It Works

The plugin intentionally leaves MCP connection details in the user's Codex MCP configuration instead of shipping a prewired `.mcp.json`.

This means the plugin does not guess whether the user is running SurrealDB through Cloud, the local CLI, Docker, or another deployment. The instance URL is the source of truth.

## Usage

Once the MCP server is added, ask Codex things like:

- Inspect my SurrealDB schema.
- Run a read-only SurrealQL query.
- Explore records in this namespace and database.
- Help me troubleshoot my SurrealDB MCP connection.

Treat mutation requests as real database operations. Confirm intent before schema changes, bulk writes, deletes, permission changes, or storage changes.

## Troubleshooting

If tools do not appear, confirm the URL points to an MCP endpoint, not a normal SQL, REST, or WebSocket endpoint.

If authentication fails, re-add the server with `--bearer-token-env-var`

Use `codex mcp get surrealdb` or `codex mcp list` to inspect the current configuration.
