#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Spectron } = require("../vendor/spectron.cjs");

const DEFAULT_BASE_URL = "http://localhost:8080";
const DEFAULT_TIMEOUT_MS = 10_000;

function readStdin() {
	return new Promise((resolve, reject) => {
		let data = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (chunk) => {
			data += chunk;
		});
		process.stdin.on("end", () => resolve(data));
		process.stdin.on("error", reject);
	});
}

function stripMcpPath(value) {
	if (!value) return "";
	try {
		const url = new URL(value);
		url.pathname = url.pathname.replace(/\/mcp\/?$/, "") || "/";
		url.search = "";
		url.hash = "";
		return url.toString().replace(/\/+$/, "");
	} catch {
		return value.replace(/\/mcp\/?$/, "").replace(/\/+$/, "");
	}
}

function resolveConfig(env = process.env) {
	return {
		baseUrl: (
			env.SPECTRON_BASE_URL ||
			env.SPECTRON_URL ||
			stripMcpPath(env.SPECTRON_MCP_URL) ||
			DEFAULT_BASE_URL
		).replace(/\/+$/, ""),
		apiKey: env.SPECTRON_API_KEY || env.SPECTRON_MCP_TOKEN || "",
		contextId: env.SPECTRON_CONTEXT_ID || env.SPECTRON_CONTEXT || "",
	};
}

function isConfigured(config) {
	return Boolean(config.contextId && config.apiKey);
}

function defaultStateDir(env = process.env) {
	const root = env.PLUGIN_DATA || path.join(os.homedir(), ".codex", "spectron-state");
	return path.join(root, "turn-capture");
}

function stateFileFor(sessionId, stateDir = defaultStateDir()) {
	const hash = crypto.createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
	return path.join(stateDir, `${hash}.json`);
}

function readState(sessionId, stateDir) {
	const file = stateFileFor(sessionId, stateDir);
	try {
		const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
		return {
			turns: Array.isArray(parsed.turns) ? parsed.turns : [],
		};
	} catch (err) {
		if (err && err.code === "ENOENT") return { turns: [] };
		throw err;
	}
}

function writeState(sessionId, state, stateDir) {
	const file = stateFileFor(sessionId, stateDir);
	fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
	const temp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
	fs.writeFileSync(temp, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
	fs.renameSync(temp, file);
}

function removeState(sessionId, stateDir) {
	try {
		fs.unlinkSync(stateFileFor(sessionId, stateDir));
	} catch (err) {
		if (!err || err.code !== "ENOENT") throw err;
	}
}

function recordPrompt(payload, options = {}) {
	const sessionId = payload?.session_id;
	const turnId = payload?.turn_id;
	const content = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
	if (!sessionId || !turnId || !content) return { staged: false };
	if (!isConfigured(resolveConfig(options.env))) {
		return { staged: false, reason: "not configured" };
	}

	const stateDir = options.stateDir || defaultStateDir(options.env);
	const state = readState(sessionId, stateDir);
	const message = {
		role: "user",
		content,
		ts: (options.now || (() => new Date()))().toISOString(),
	};
	let turn = state.turns.find((item) => item.turnId === turnId);
	if (!turn) {
		turn = { turnId, messages: [] };
		state.turns.push(turn);
	}
	const index = turn.messages.findIndex((item) => item.role === "user");
	if (index >= 0) turn.messages[index] = message;
	else turn.messages.unshift(message);
	writeState(sessionId, state, stateDir);
	return { staged: true };
}

function createSpectronClient(config, options = {}) {
	const fetchImpl = options.fetchImpl || globalThis.fetch;
	if (!fetchImpl) throw new Error("global fetch is unavailable; Node.js 18 or newer is required");
	const fetchWithStableIdempotency = (url, init = {}) => {
		const headers = new Headers(init.headers);
		headers.set("Idempotency-Key", options.idempotencyKey);
		return fetchImpl(url, { ...init, headers });
	};
	return new Spectron({
		endpoint: config.baseUrl,
		context: config.contextId,
		apiKey: config.apiKey,
		timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
		maxRetries: Math.max(0, options.retries ?? 2),
		fetchImpl: fetchWithStableIdempotency,
	});
}

async function flushTurn(payload, options = {}) {
	const sessionId = payload?.session_id;
	const turnId = payload?.turn_id;
	if (!sessionId || !turnId) return { sent: 0 };
	const config = resolveConfig(options.env);
	if (!isConfigured(config)) return { sent: 0, reason: "not configured" };

	const stateDir = options.stateDir || defaultStateDir(options.env);
	const state = readState(sessionId, stateDir);
	const assistant =
		typeof payload?.last_assistant_message === "string"
			? payload.last_assistant_message.trim()
			: "";
	const now = (options.now || (() => new Date()))().toISOString();
	let currentTurn = state.turns.find((item) => item.turnId === turnId);
	if (!currentTurn && assistant) {
		currentTurn = { turnId, messages: [] };
		state.turns.push(currentTurn);
	}
	if (currentTurn && assistant) {
		const message = { role: "assistant", content: assistant, ts: now };
		const index = currentTurn.messages.findIndex((item) => item.role === "assistant");
		if (index >= 0) currentTurn.messages[index] = message;
		else currentTurn.messages.push(message);
		writeState(sessionId, state, stateDir);
	}

	let sent = 0;
	for (const turn of [...state.turns]) {
		if (!turn.messages.some((message) => message.role === "assistant")) continue;
		const messages = turn.messages.map(({ role, content, ts }) => ({ role, content, ts }));
		const client = createSpectronClient(config, {
				fetchImpl: options.fetchImpl,
				retries: options.retries,
				timeoutMs: options.timeoutMs,
				idempotencyKey: `codex:${sessionId}:${turn.turnId}`,
		});
		await client.rememberMany(messages, {
			sessionId,
			extract: "whole_conversation",
			infer: "full",
		});
		sent += messages.length;
		state.turns = state.turns.filter((item) => item.turnId !== turn.turnId);
		if (state.turns.length > 0) writeState(sessionId, state, stateDir);
		else removeState(sessionId, stateDir);
	}
	return { sent };
}

async function main() {
	const event = process.argv[2];
	let payload;
	try {
		payload = JSON.parse(await readStdin());
		let result;
		if (event === "prompt") result = recordPrompt(payload);
		else if (event === "stop") result = await flushTurn(payload);
		else throw new Error(`unknown hook event: ${event || "(missing)"}`);
		if (process.env.SPECTRON_HOOK_VERBOSE) {
			process.stderr.write(`spectron-hook: ${event} ${JSON.stringify(result)}\n`);
		}
	} catch (err) {
		process.stderr.write(`spectron-hook: ${err.message}\n`);
	}
	// Recording failures must never interrupt or continue the Codex turn.
	process.stdout.write('{"continue":true}\n');
}

if (require.main === module) {
	main();
}

module.exports = {
	createSpectronClient,
	defaultStateDir,
	flushTurn,
	recordPrompt,
	resolveConfig,
	stateFileFor,
	stripMcpPath,
};
