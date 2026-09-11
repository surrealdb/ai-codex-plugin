---
name: agent-memory
description: Use when the user references Agent Memory, when Agent Memory tools appear in the active toolset, or when they ask Codex about on-demand memory, context management, or the plugin's optional automatic turn-capture hooks.
---

# Agent Memory

This Codex plugin ships two separate integrations:

- **`agent-memory` MCP server** — `https://mcp.surrealdb.com`, authenticated with Surreal ID OAuth. Use it for on-demand memory and context work.
- **Codex turn-capture hooks** — optional `UserPromptSubmit` and `Stop` hooks that stage and persist completed conversation turns without requiring the model to choose a tool.

The MCP server needs no environment configuration. Complete the browser sign-in when Codex prompts for it. If a call is unauthenticated, ask the user to complete that sign-in instead of asking for an Agent Memory MCP URL or token.

Agent Memory is not a SurrealDB database server. Route SurrealQL, schema, and record work to the `surrealdb` plugin, or to `surrealdb-local` for an instance the user runs.

If the user also installed the `surrealdb` plugin, both plugins point at the same managed endpoint. The same tools may appear under two server names; this is expected and is not an authentication or connection error.

## Optional Automatic Turn Capture

`hooks/hooks.json` defines the Codex-specific capture lifecycle:

| Event | Behavior |
| --- | --- |
| `UserPromptSubmit` | Stages the current user prompt in the plugin's writable state directory. |
| `Stop` | Adds the assistant response and sends each complete turn to Agent Memory's `/facts/batch` API. |

Delivery uses the bundled official SurrealDB SDK (vendored from `@surrealdb/spectron@1.0.0-alpha.1`, the name it was published under), whole-conversation extraction, and a stable per-turn idempotency key. Failed delivery never blocks the Codex turn; staged complete turns remain available for a later retry.

Codex requires the user to review and trust plugin hooks before they run. Use `/hooks` in Codex CLI to inspect their status.

## Configuring the Hooks

The hooks run as separate processes and cannot reuse Codex's OAuth credential store. Configure their destination, token, and Context explicitly:

```sh
export AGENT_MEMORY_MCP_URL="https://your-agent-memory-instance.example.com/mcp"
export AGENT_MEMORY_MCP_TOKEN="<bearer-token-or-api-key>"
export AGENT_MEMORY_CONTEXT_ID="<context-id>"
```

- The hook removes the trailing `/mcp` from `AGENT_MEMORY_MCP_URL` to derive the Agent Memory REST base URL.
- `AGENT_MEMORY_CONTEXT` is accepted as a compatibility alias for `AGENT_MEMORY_CONTEXT_ID`.
- `AGENT_MEMORY_URL` or `AGENT_MEMORY_BASE_URL`, and `AGENT_MEMORY_API_KEY`, can explicitly override the derived REST URL and token.
- `AGENT_MEMORY_HOOK_VERBOSE=1` logs a one-line capture status.

The hook is fail-open. With its token or Context id unset, it transmits and retains no conversation content; the managed MCP tools remain available on demand.

## What Leaves the Machine

Once configured and trusted, the prompt hook stages the current user prompt locally. The stop hook sends the completed user/assistant exchange, including conversation content, to the configured Agent Memory endpoint for storage in the selected Context.

If the user does not want automatic capture, leave the hook variables unset or decline to trust the hooks. This does not disable the managed MCP server.

## Using the Tools

Inspect the active toolset rather than assuming a specific Agent Memory tool is available. Prefer read-only operations. Before deleting memories, broadly rewriting a Context, or making another material mutation, state the intended change and confirm it with the user.
