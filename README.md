# SurrealDB Codex Marketplace

A Codex plugin marketplace from SurrealDB. It ships three plugins:

| Plugin | What it connects | Ships | Setup |
| --- | --- | --- | --- |
| [`surrealdb`](plugins/surrealdb/) | SurrealDB's managed MCP at `https://mcp.surrealdb.com` | MCP server plus official SurrealDB skills | Sign in with your Surreal ID |
| [`agent-memory`](plugins/agent-memory/) | The same managed MCP at `https://mcp.surrealdb.com` | MCP server plus optional Codex turn-capture hooks | Sign in with your Surreal ID; hook configuration is optional |
| [`surrealdb-local`](plugins/surrealdb-local/) | A local, self-hosted, or air-gapped SurrealDB instance | Instance MCP plus a setup skill | Set the instance URL and bearer token |

The managed plugins are zero-config: install one, then complete the browser sign-in when Codex first authenticates it. Use `surrealdb-local` when the target database is on `localhost`, a private network, or infrastructure that SurrealDB's managed MCP cannot reach.

## Requirements

- Codex with local marketplace support.
- A Surreal ID for the managed `surrealdb` and `agent-memory` plugins.
- For `surrealdb-local`, a SurrealDB instance exposing its built-in `/mcp` HTTP route and a scoped access token or JWT.

## Install From GitHub

Add this repository as a marketplace, then install the plugins you need:

```sh
codex plugin marketplace add surrealdb/ai-codex-plugin --ref main
codex plugin add surrealdb@surrealdb
codex plugin add agent-memory@surrealdb
codex plugin add surrealdb-local@surrealdb
```

## Install From A Local Checkout

The repo-local marketplace manifest lives at `.agents/plugins/marketplace.json`.

```sh
codex plugin marketplace add "$PWD"
codex plugin add surrealdb@surrealdb
codex plugin add agent-memory@surrealdb
codex plugin add surrealdb-local@surrealdb
```

Start a new Codex task after installing or updating a plugin so the task picks up its skills and MCP tools.

## Managed MCP (`surrealdb` and `agent-memory`)

Both managed plugins connect to:

| Server name | Endpoint | Authentication |
| --- | --- | --- |
| `surrealdb` | `https://mcp.surrealdb.com` | OAuth with your Surreal ID |
| `agent-memory` | `https://mcp.surrealdb.com` | OAuth with your Surreal ID |

Use the bare root URL exactly as shown. Do not append `/mcp` or `/sse` to the managed endpoint.

The endpoint exposes SurrealDB data-plane tools, SurrealDB account and infrastructure tools, and Agent Memory tools. Installing both plugins can therefore surface the same managed tools under two server names. This is harmless; install only one if you do not want the duplicate tool surface.

If you manually register the managed endpoint instead of using the plugins, use:

```sh
codex mcp add surrealdb --url https://mcp.surrealdb.com
codex mcp login surrealdb
```

For a headless or unattended environment, create a personal access token at <https://account.surrealdb.com/tokens>, put it in an environment variable, and register the server with bearer-token authentication:

```sh
export SURREALDB_MCP_TOKEN="<personal-access-token>"
codex mcp add surrealdb \
  --url https://mcp.surrealdb.com \
  --bearer-token-env-var SURREALDB_MCP_TOKEN
```

## Local and Self-hosted MCP (`surrealdb-local`)

The managed server cannot reach `localhost` or private-network instances. The `surrealdb-local` plugin connects directly to an instance's built-in `/mcp` route:

```sh
export SURREALDB_MCP_URL="http://127.0.0.1:8000/mcp"
export SURREALDB_MCP_TOKEN="<access-token-or-jwt>"
```

Use a scoped database user rather than root. The instance turns the request's bearer token into a real session, so the token's permissions are the permissions Codex receives.

Important:

- The URL must include `/mcp` for an instance you run; this is different from the managed endpoint's bare root URL.
- Operators can disable the route with `--deny-http mcp`. Check that capability when a healthy instance returns 404 for `/mcp`.
- A `surreal-bearer-...` grant key is not automatically an HTTP access token. Exchange signin credentials or a grant key for a JWT/session token before using it as `SURREALDB_MCP_TOKEN`.
- Do not substitute `surreal mcp` for this connection. The stdio command starts its own embedded datastore instead of attaching to the running instance.

For equivalent manual Codex configuration:

```sh
codex mcp add surrealdb-local \
  --url "$SURREALDB_MCP_URL" \
  --bearer-token-env-var SURREALDB_MCP_TOKEN
```

## Optional Agent Memory Turn Capture

The Agent Memory plugin's managed MCP server needs only OAuth. Its Codex hooks are separate: once trusted, `UserPromptSubmit` stages the user prompt locally and `Stop` sends each completed user/assistant turn through the bundled official SurrealDB SDK to Agent Memory's `/facts/batch` API.

Configure the hooks only if you want automatic turn capture:

```sh
export AGENT_MEMORY_MCP_URL="https://your-agent-memory-instance.example.com/mcp"
export AGENT_MEMORY_MCP_TOKEN="<bearer-token-or-api-key>"
export AGENT_MEMORY_CONTEXT_ID="<context-id>"
```

The hooks cannot reuse Codex's OAuth credential store, so they need their own endpoint, token, and Context id. A default install with those variables unset transmits and retains no conversation content; the managed MCP tools still work on demand.

Codex requires the user to review and trust plugin hooks before they run. Use `/hooks` in Codex CLI to inspect their status. Delivery failures never block a turn, and completed turns remain in the plugin's writable data directory for a retry with the same idempotency key. Set `AGENT_MEMORY_HOOK_VERBOSE=1` for a one-line capture status. The pre-rename `SPECTRON_*` spellings are still accepted as a fallback.

## Upstream Skill Sync

This repository treats [`surrealdb/agent-skills`](https://github.com/surrealdb/agent-skills) as the upstream source for general SurrealDB knowledge skills.

```sh
./scripts/sync-agent-skills.sh
```

To sync from a local checkout instead of cloning:

```sh
./scripts/sync-agent-skills.sh --source /path/to/agent-skills
```

Synced skills are written to `plugins/surrealdb/skills/<skill-name>/`. The local `surrealdb-mcp` skill is protected from sync, and each upstream skill's `references/` directory is copied with it.

## Usage and Safety

Once a plugin is installed and authenticated, ask Codex things like:

- Sign me in to SurrealDB and show me my instances.
- Inspect the schema in my Cloud database.
- What have I spent on SurrealDB this month?
- Connect to my local SurrealDB and run a read-only query.
- Inspect my Agent Memory tools.
- Write an idiomatic SurrealQL graph traversal.
- Create an HNSW vector index for semantic search.

Treat mutation requests as real database, account, or memory operations. Confirm intent before schema changes, bulk writes, deletes, permission changes, billable infrastructure changes, organization-access changes, or broad memory mutations.

## Troubleshooting

- Managed authentication failure: complete the Surreal ID browser sign-in. For manual registrations, run `codex mcp login surrealdb`.
- Managed endpoint 404: confirm the URL is exactly `https://mcp.surrealdb.com`, without `/mcp` or `/sse`.
- Local endpoint 404: confirm the URL includes `/mcp` and the instance was not started with `--deny-http mcp`.
- Local `InvalidToken`: confirm `SURREALDB_MCP_TOKEN` contains the final access token or JWT, not a bearer grant key.
- Missing tools after install or update: start a new Codex task.
- Missing Agent Memory capture: open `/hooks`, trust the hook, and verify the three `AGENT_MEMORY_*` variables above.

Use `codex mcp get surrealdb`, `codex mcp get agent-memory`, `codex mcp get surrealdb-local`, or `codex mcp list` to inspect MCP configuration.
