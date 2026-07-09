---
name: database-mcp
description: Use when the user asks Codex to inspect, query, administer, or troubleshoot SurrealDB through the user-provided Database MCP endpoint URL.
---

# Database MCP

Use this skill when the user asks Codex to inspect, query, administer, or troubleshoot SurrealDB through Database MCP.

## MCP Server

- Ask the user for their SurrealDB MCP endpoint URL when they want HTTP mode and it is not already configured.
- Configure HTTP mode directly in Codex with `codex mcp add surrealdb --url <endpoint>`.
- Do not guess between local CLI, Docker, or Cloud. The user-provided URL is the source of truth.

## Configuration Notes

- Use a direct MCP URL such as `https://<cloud-instance>/mcp` or `http://127.0.0.1:8000/mcp` for HTTP mode.
- The endpoint must expose MCP over HTTP. A normal SQL, REST, or WebSocket endpoint is not enough unless it also serves MCP.
- For bearer auth, prefer `codex mcp add surrealdb --url <endpoint> --bearer-token-env-var <ENV_VAR>`.
- When the server supports OAuth, prefer `codex mcp login surrealdb` after adding the URL.
- Treat query and mutation tools as database operations with real side effects. Confirm intent before schema changes, bulk writes, deletes, storage changes, or permission changes.

## Useful Starter Requests

- Inspect the active namespace and database schema.
- Run a read-only SurrealQL query and summarize the records.
- Connect to my SurrealDB Cloud MCP URL.
- Connect to my local SurrealDB instance MCP URL.
