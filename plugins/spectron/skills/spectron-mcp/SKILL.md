---
name: spectron-mcp
description: Use when the user asks Codex to connect to, inspect, capture conversations in, or troubleshoot Spectron through a user-provided Spectron MCP endpoint URL.
---

# Spectron MCP

Use this skill when the user asks Codex to connect to, inspect, or troubleshoot Spectron through MCP.

## MCP Server

- The plugin bundles a Codex MCP server named `spectron`.
- Ask the user for their Spectron MCP endpoint URL when it is not already configured.
- For plugin-managed setup, ask the user to set `SPECTRON_MCP_URL` to the endpoint, `SPECTRON_MCP_TOKEN` to the final bearer token or API key, and `SPECTRON_CONTEXT_ID` to the target Context, then start a new Codex task.
- For manual setup, configure the server directly in Codex with `codex mcp add spectron --url <endpoint>`.
- Do not guess the user's Spectron instance. The user-provided URL is the source of truth.

## Configuration Notes

- Use a direct MCP URL such as `https://<instance>/mcp`.
- The endpoint must expose MCP over HTTP. A normal application URL is not enough unless it also serves MCP.
- For bearer auth in manual setup, prefer `codex mcp add spectron --url <endpoint> --bearer-token-env-var <ENV_VAR>`.
- When the server supports OAuth in manual setup, prefer `codex mcp login spectron` after adding the URL.
- Treat tool calls as operations against the user's Spectron instance. Confirm intent before any destructive or broad mutation.

## Automatic Turn Capture

- The plugin bundles `UserPromptSubmit` and `Stop` hooks that mirror each completed Codex turn to Spectron's `/facts/batch` endpoint.
- Codex requires the user to review and trust the plugin hooks before they run. Use `/hooks` in Codex CLI to inspect their status.
- The hook reuses `SPECTRON_MCP_URL` and `SPECTRON_MCP_TOKEN`; it removes the trailing `/mcp` to form the REST base URL.
- Turn delivery uses the bundled official `@surrealdb/spectron` TypeScript SDK; hook execution does not install packages or require network access to npm.
- `SPECTRON_CONTEXT_ID` is required for the batch route. `SPECTRON_CONTEXT` remains supported for compatibility with Spectron's Claude Code hook.
- `SPECTRON_URL` or `SPECTRON_BASE_URL` and `SPECTRON_API_KEY` can override the derived REST URL and token.
- Failed recording attempts never block the Codex turn. Complete turns remain in the plugin's writable data directory so a later turn can retry them with the original idempotency key.
- Set `SPECTRON_HOOK_VERBOSE=1` to log a one-line capture summary.

## Useful Starter Requests

- Connect to my Spectron MCP URL.
- Inspect the tools exposed by my Spectron MCP server.
- Troubleshoot my Spectron MCP connection.
