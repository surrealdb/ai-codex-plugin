---
name: surrealdb-local
description: Use when the user wants Codex to query, inspect, administer, configure, or troubleshoot a local, self-hosted, private-network, or air-gapped SurrealDB instance through its built-in /mcp HTTP route.
---

# SurrealDB Local

This plugin bundles one Codex MCP server:

- **`surrealdb-local`** — the data plane for a SurrealDB instance the user runs, reached through the instance's built-in `/mcp` HTTP route.

Use this plugin for local development, self-hosted infrastructure, private networks, and air-gapped deployments. SurrealDB's managed MCP runs outside the user's network and cannot reach `localhost` or private endpoints. Account-level Cloud work still belongs to the managed `surrealdb` plugin.

## Configuration

Set both variables before starting Codex, then open a new task:

```sh
export SURREALDB_MCP_URL="http://127.0.0.1:8000/mcp"
export SURREALDB_MCP_TOKEN="<access-token-or-jwt>"
```

- `SURREALDB_MCP_URL` must be the full instance URL including `/mcp`. This differs from the managed service, whose URL is the bare `https://mcp.surrealdb.com` root.
- `SURREALDB_MCP_TOKEN` must be an access token or JWT accepted by the instance's MCP route.

Do not guess the user's host, namespace, database, or credentials. If the bundled server is unavailable, verify that both variables were present when Codex started and that the user opened a new task afterward.

## Getting a Scoped Token

Use a scoped database user rather than root. The instance resolves the `Authorization` header into a real session, so the token's permissions become Codex's permissions. Define a user with only the access required for the work and sign in as that user to obtain an access token:

```surql
DEFINE USER claude ON DATABASE PASSWORD "..." ROLES EDITOR;
```

Exchange those credentials through the instance's `/signin` route and place the resulting access token or JWT in `SURREALDB_MCP_TOKEN`.

A `surreal-bearer-...` grant key is not automatically an HTTP authorization token. If the user has only signin credentials or a bearer grant key, exchange it for an access token first.

## Server Details

- The `/mcp` route is capability-gated. An operator can disable it with `--deny-http mcp`; check that flag if an otherwise healthy instance returns 404.
- Do not use `surreal mcp` as a transport for a running instance. The stdio command starts its own embedded datastore instead of attaching to the running server, so Codex would see a different database. Embedded storage engines also hold exclusive locks, so it cannot safely reuse a live instance's data directory.
- For manual Codex configuration, use `codex mcp add surrealdb-local --url "$SURREALDB_MCP_URL" --bearer-token-env-var SURREALDB_MCP_TOKEN`.

## Safety

Every query or mutation runs against the user's real database. State the intended change and confirm before:

- Deletes or bulk updates.
- `DEFINE` or `REMOVE` operations on tables, fields, indexes, scopes, or accesses.
- Permission or authentication changes.
- Storage or availability changes.

Read-only `SELECT` and `INFO FOR` queries do not require confirmation.

## Starter Requests

- Connect to my local SurrealDB and show the schema.
- Run `SELECT * FROM user LIMIT 5;` against my development instance.
- Explain why Codex cannot see my self-hosted tables.
- Check whether my MCP URL includes the required `/mcp` route.
