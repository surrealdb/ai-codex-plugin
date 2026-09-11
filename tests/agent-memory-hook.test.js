"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
	deprecatedEnvNames,
	flushTurn,
	recordPrompt,
	resolveConfig,
	stateFileFor,
} = require("../plugins/agent-memory/hooks/agent-memory-hook");

function tempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "agent-memory-codex-hook-"));
}

const fixedDate = () => new Date("2026-07-22T12:00:00.000Z");

test("resolveConfig reuses the plugin MCP endpoint and token", () => {
	assert.deepEqual(
		resolveConfig({
			AGENT_MEMORY_MCP_URL: "https://example.agent-memory.cloud/mcp",
			AGENT_MEMORY_MCP_TOKEN: "secret",
			AGENT_MEMORY_CONTEXT_ID: "acme",
		}),
		{
			baseUrl: "https://example.agent-memory.cloud",
			apiKey: "secret",
			contextId: "acme",
		},
	);
});

test("recordPrompt stages and deduplicates a turn", () => {
	const stateDir = tempDir();
	recordPrompt(
		{ session_id: "session-a", turn_id: "turn-a", prompt: "first" },
		{
			stateDir,
			now: fixedDate,
			env: { AGENT_MEMORY_CONTEXT_ID: "acme", AGENT_MEMORY_API_KEY: "secret" },
		},
	);
	recordPrompt(
		{ session_id: "session-a", turn_id: "turn-a", prompt: "updated" },
		{
			stateDir,
			now: fixedDate,
			env: { AGENT_MEMORY_CONTEXT_ID: "acme", AGENT_MEMORY_API_KEY: "secret" },
		},
	);

	const state = JSON.parse(fs.readFileSync(stateFileFor("session-a", stateDir), "utf8"));
	assert.equal(state.turns.length, 1);
	assert.equal(state.turns[0].messages.length, 1);
	assert.equal(state.turns[0].messages[0].content, "updated");
});

test("flushTurn sends a retry-safe whole-conversation batch", async () => {
	const stateDir = tempDir();
	const calls = [];
	recordPrompt(
		{ session_id: "session-b", turn_id: "turn-b", prompt: "hello" },
		{
			stateDir,
			now: fixedDate,
			env: { AGENT_MEMORY_CONTEXT_ID: "acme", AGENT_MEMORY_API_KEY: "secret" },
		},
	);

	const result = await flushTurn(
		{
			session_id: "session-b",
			turn_id: "turn-b",
			last_assistant_message: "hi there",
		},
		{
			stateDir,
			now: fixedDate,
			env: {
				AGENT_MEMORY_MCP_URL: "https://example.test/mcp",
				AGENT_MEMORY_MCP_TOKEN: "secret",
				AGENT_MEMORY_CONTEXT_ID: "acme",
			},
			fetchImpl: async (url, options) => {
				calls.push({ url, options });
				return new Response("{}", { status: 200 });
			},
			retries: 0,
		},
	);

	assert.deepEqual(result, { sent: 2 });
	assert.equal(calls[0].url, "https://example.test/api/v1/acme/facts/batch");
	const headers = new Headers(calls[0].options.headers);
	assert.equal(headers.get("Authorization"), "Bearer secret");
	assert.equal(headers.get("Idempotency-Key"), "codex:session-b:turn-b");
	assert.deepEqual(JSON.parse(calls[0].options.body), {
		session_id: "session-b",
		messages: [
			{ role: "user", content: "hello", ts: "2026-07-22T12:00:00.000Z" },
			{ role: "assistant", content: "hi there", ts: "2026-07-22T12:00:00.000Z" },
		],
		extract: "whole_conversation",
		infer: "full",
	});
	assert.equal(fs.existsSync(stateFileFor("session-b", stateDir)), false);
});

test("flushTurn preserves staged prompts when delivery fails", async () => {
	const stateDir = tempDir();
	recordPrompt(
		{ session_id: "session-c", turn_id: "turn-c", prompt: "keep me" },
		{
			stateDir,
			now: fixedDate,
			env: { AGENT_MEMORY_CONTEXT_ID: "acme", AGENT_MEMORY_API_KEY: "secret" },
		},
	);

	await assert.rejects(
		flushTurn(
			{
				session_id: "session-c",
				turn_id: "turn-c",
				last_assistant_message: "reply",
			},
			{
				stateDir,
				env: { AGENT_MEMORY_CONTEXT_ID: "acme", AGENT_MEMORY_API_KEY: "secret" },
				fetchImpl: async () => new Response("unavailable", { status: 503 }),
				retries: 0,
			},
		),
	);
	const state = JSON.parse(fs.readFileSync(stateFileFor("session-c", stateDir), "utf8"));
	assert.deepEqual(
		state.turns[0].messages.map(({ role, content }) => ({ role, content })),
		[
			{ role: "user", content: "keep me" },
			{ role: "assistant", content: "reply" },
		],
	);
});

test("a later stop retries each queued turn with its original idempotency key", async () => {
	const stateDir = tempDir();
	const env = { AGENT_MEMORY_CONTEXT_ID: "acme", AGENT_MEMORY_API_KEY: "secret" };
	recordPrompt(
		{ session_id: "session-d", turn_id: "turn-1", prompt: "one" },
		{ stateDir, now: fixedDate, env },
	);
	await assert.rejects(
		flushTurn(
			{ session_id: "session-d", turn_id: "turn-1", last_assistant_message: "first" },
			{
				stateDir,
				env,
				fetchImpl: async () => new Response("offline", { status: 503 }),
				retries: 0,
			},
		),
	);

	recordPrompt(
		{ session_id: "session-d", turn_id: "turn-2", prompt: "two" },
		{ stateDir, now: fixedDate, env },
	);
	const keys = [];
	await flushTurn(
		{ session_id: "session-d", turn_id: "turn-2", last_assistant_message: "second" },
		{
			stateDir,
			env,
			fetchImpl: async (_url, options) => {
				keys.push(new Headers(options.headers).get("Idempotency-Key"));
				return new Response("{}", { status: 200 });
			},
			retries: 0,
		},
	);
	assert.deepEqual(keys, ["codex:session-d:turn-1", "codex:session-d:turn-2"]);
});

test("an unconfigured hook does not retain conversation content", async () => {
	const stateDir = tempDir();
	assert.deepEqual(
		recordPrompt(
			{ session_id: "session-e", turn_id: "turn-e", prompt: "private" },
			{ stateDir, env: {} },
		),
		{ staged: false, reason: "not configured" },
	);
	assert.deepEqual(
		await flushTurn(
			{ session_id: "session-e", turn_id: "turn-e", last_assistant_message: "reply" },
			{ stateDir, env: {} },
		),
		{ sent: 0, reason: "not configured" },
	);
	assert.equal(fs.existsSync(stateFileFor("session-e", stateDir)), false);
});

test("resolveConfig still honours the pre-rename SPECTRON_* names", () => {
	assert.deepEqual(
		resolveConfig({
			SPECTRON_MCP_URL: "https://old.example/mcp",
			SPECTRON_MCP_TOKEN: "old-secret",
			SPECTRON_CONTEXT_ID: "old-ctx",
		}),
		{
			baseUrl: "https://old.example",
			apiKey: "old-secret",
			contextId: "old-ctx",
		},
	);
});

test("resolveConfig prefers AGENT_MEMORY_* over SPECTRON_*", () => {
	assert.deepEqual(
		resolveConfig({
			AGENT_MEMORY_MCP_URL: "https://new.example/mcp",
			AGENT_MEMORY_MCP_TOKEN: "new-secret",
			AGENT_MEMORY_CONTEXT_ID: "new-ctx",
			SPECTRON_MCP_URL: "https://old.example/mcp",
			SPECTRON_MCP_TOKEN: "old-secret",
			SPECTRON_CONTEXT_ID: "old-ctx",
		}),
		{
			baseUrl: "https://new.example",
			apiKey: "new-secret",
			contextId: "new-ctx",
		},
	);
});

test("deprecatedEnvNames reports legacy variables the hook falls back to", () => {
	assert.deepEqual(
		deprecatedEnvNames({
			SPECTRON_MCP_URL: "https://old.example/mcp",
			SPECTRON_CONTEXT_ID: "old-ctx",
		}),
		["SPECTRON_MCP_URL -> AGENT_MEMORY_MCP_URL", "SPECTRON_CONTEXT_ID -> AGENT_MEMORY_CONTEXT_ID"],
	);
});

test("deprecatedEnvNames stays quiet when the replacement is set", () => {
	assert.deepEqual(
		deprecatedEnvNames({
			AGENT_MEMORY_MCP_URL: "https://new.example/mcp",
			SPECTRON_MCP_URL: "https://old.example/mcp",
		}),
		[],
	);
});

test("deprecatedEnvNames is empty for a clean environment", () => {
	assert.deepEqual(deprecatedEnvNames({ AGENT_MEMORY_CONTEXT_ID: "acme" }), []);
});
