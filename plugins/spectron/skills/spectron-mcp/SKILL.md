---
name: spectron-mcp
description: Use when the user asks Codex to connect to, inspect, or troubleshoot Spectron through a user-provided Spectron MCP endpoint URL.
---

# Spectron MCP

Use this skill when the user asks Codex to connect to, inspect, or troubleshoot Spectron through MCP.

## MCP Server

- The plugin bundles a Codex MCP server named `spectron`.
- Ask the user for their Spectron MCP endpoint URL when it is not already configured.
- For plugin-managed setup, ask the user to set `SPECTRON_MCP_URL` to the endpoint and `SPECTRON_MCP_TOKEN` to the final bearer token or JWT, then start a new Codex task.
- For manual setup, configure the server directly in Codex with `codex mcp add spectron --url <endpoint>`.
- Do not guess the user's Spectron instance. The user-provided URL is the source of truth.

## Configuration Notes

- Use a direct MCP URL such as `https://<instance>/mcp`.
- The endpoint must expose MCP over HTTP. A normal application URL is not enough unless it also serves MCP.
- For bearer auth in manual setup, prefer `codex mcp add spectron --url <endpoint> --bearer-token-env-var <ENV_VAR>`.
- When the server supports OAuth in manual setup, prefer `codex mcp login spectron` after adding the URL.
- Treat tool calls as operations against the user's Spectron instance. Confirm intent before any destructive or broad mutation.

## Useful Starter Requests

- Connect to my Spectron MCP URL.
- Inspect the tools exposed by my Spectron MCP server.
- Troubleshoot my Spectron MCP connection.
