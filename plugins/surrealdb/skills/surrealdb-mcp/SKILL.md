---
name: surrealdb-mcp
description: Use when the user asks Codex to query, inspect, administer, or troubleshoot SurrealDB through the bundled managed MCP server, including database work and account-level instances, organizations, access, and spend.
---

# SurrealDB MCP

This plugin bundles one Codex MCP server:

- **`surrealdb`** — SurrealDB's managed MCP server at `https://mcp.surrealdb.com`, scoped to the user's SurrealDB account.

The server covers both the data plane and control plane: it can run SurrealQL and inspect schemas and records against account instances, as well as manage Cloud instances, organizations, access, and spend.

## Authentication

There is nothing to configure for an interactive Codex session. The server uses OAuth; complete the Surreal ID browser sign-in when Codex prompts for it. If a tool call is unauthenticated, ask the user to finish that sign-in instead of asking for an MCP URL or bearer-token environment variable.

The managed endpoint is the bare root `https://mcp.surrealdb.com`. Do not append `/mcp` or `/sse`; those paths do not identify the managed service.

## What It Is For

| Task | Notes |
| --- | --- |
| Run SurrealQL, inspect tables and fields, define schema, and work with records | Requires a compatible target instance |
| Deploy an instance, upgrade its version, or resize resources | Billable; confirm first |
| Invite organization users or change access levels | Confirm first |
| List instances or check monthly spend | Read-only; no confirmation needed |

## Local and Self-hosted Instances

The managed MCP runs in SurrealDB's infrastructure, so it cannot reach `localhost`, private networks, or air-gapped deployments. For those targets, use the separate `surrealdb-local` plugin:

```sh
codex plugin add surrealdb-local@surrealdb
```

That plugin adds a `surrealdb-local` server pointed at `${SURREALDB_MCP_URL}`, including the instance's own `/mcp` route, with a bearer token from `SURREALDB_MCP_TOKEN`. When both plugins are installed, route local data work to `surrealdb-local` and account-level work to `surrealdb`.

## Headless or Unattended Use

OAuth needs a browser. In CI, on a remote box, or in another unattended environment, the user can create a personal access token at <https://account.surrealdb.com/tokens>, place it in an environment variable, and register the server manually:

```sh
export SURREALDB_MCP_TOKEN="<personal-access-token>"
codex mcp add surrealdb \
  --url https://mcp.surrealdb.com \
  --bearer-token-env-var SURREALDB_MCP_TOKEN
```

## Safety

Every tool call operates on the user's real databases and account. State the intended change and confirm before:

- Deletes or bulk updates.
- `DEFINE` or `REMOVE` operations on tables, fields, indexes, scopes, or accesses.
- Permission or authentication changes.
- Creating, resizing, upgrading, or deleting an instance, because these can change billing or availability.
- Inviting organization users or changing access levels.

Read-only work such as `SELECT`, `INFO FOR`, listing instances, and checking spend does not require confirmation.

## Starter Requests

- Sign in to SurrealDB and show my instances.
- Show the schema for the selected namespace and database.
- Run `SELECT * FROM user LIMIT 5;` against my database.
- Define a `post` table with `title` and `body` fields.
- What have I spent on SurrealDB this month?
