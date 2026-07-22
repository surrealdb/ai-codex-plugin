
//#region src/file-body.ts
/**
* Normalises a file-like input to a `Blob` for multipart uploads.
* `ReadableStream` inputs are buffered in full (suitable for typical document sizes).
*/
async function spectronFileInputToBlob(input, mimeType) {
	if (typeof File !== "undefined" && input instanceof File) return input;
	if (input instanceof Blob) return input;
	if (input instanceof ArrayBuffer) return new Blob([input], { type: mimeType });
	if (ArrayBuffer.isView(input)) return new Blob([input], { type: mimeType });
	const stream = input;
	const reader = stream.getReader();
	const chunks = [];
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const total = chunks.reduce((a, c) => a + c.byteLength, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		out.set(c, offset);
		offset += c.byteLength;
	}
	return new Blob([out], { type: mimeType });
}

//#endregion
//#region src/paths.ts
/**
* URL-encodes a single path segment (e.g. context id, entity name).
* @param value Raw segment value.
*/
function encodePathSegment(value) {
	return encodeURIComponent(value);
}
/**
* Returns the API path prefix for a Spectron context: `/api/v1/{contextId}`.
* @param contextId Context identifier.
*/
function getContextApiPrefix(contextId) {
	return `/api/v1/${encodePathSegment(contextId)}`;
}

//#endregion
//#region src/components/documents.ts
async function buildUploadForm(options) {
	const blob = await spectronFileInputToBlob(options.file, options.contentType);
	const form = new FormData();
	const metadata = {};
	if (options.title !== void 0) metadata.title = options.title;
	if (options.source !== void 0) metadata.source = options.source;
	if (Object.keys(metadata).length > 0) form.append("metadata", JSON.stringify(metadata));
	const name = options.filename ?? (typeof File !== "undefined" && options.file instanceof File ? options.file.name : "upload");
	form.append("file", blob, name);
	return form;
}
/** Keyword graph helpers for the document corpus. */
var DocumentKeywords = class {
	transport;
	contextId;
	constructor(transport, contextId) {
		this.transport = transport;
		this.contextId = contextId;
	}
	get base() {
		return `${getContextApiPrefix(this.contextId)}/documents/keywords`;
	}
	/** Lists keywords with optional filters and pagination. */
	async list(options) {
		const body = await this.transport.requestJson("GET", this.base, { query: options });
		return body;
	}
	/** Vector search over keyword embeddings. */
	async search(options) {
		const payload = { query: options.query };
		if (options.k !== void 0) payload.k = options.k;
		if (options.threshold !== void 0) payload.threshold = options.threshold;
		const body = await this.transport.requestJson("POST", `${this.base}/search`, { body: payload });
		return body;
	}
	/** Gets one keyword by its normalised form. */
	async get(normalised) {
		const body = await this.transport.requestJson("GET", `${this.base}/${encodePathSegment(normalised)}`);
		return body;
	}
	/** Keywords linked to a document. */
	async forDocument(documentId) {
		const path = `${getContextApiPrefix(this.contextId)}/documents/${encodePathSegment(documentId)}/keywords`;
		const body = await this.transport.requestJson("GET", path);
		return body.keywords;
	}
};
/** Document ingestion, retrieval, and corpus search. */
var Documents = class {
	transport;
	contextId;
	/** Keyword graph for the document corpus. */
	keywords;
	constructor(transport, contextId) {
		this.transport = transport;
		this.contextId = contextId;
		this.keywords = new DocumentKeywords(transport, contextId);
	}
	get base() {
		return `${getContextApiPrefix(this.contextId)}/documents`;
	}
	/** Uploads a document (multipart). Returns the ingestion handle. */
	async upload(options) {
		const form = await buildUploadForm(options);
		const body = await this.transport.requestJson("POST", this.base, { body: form });
		return body;
	}
	/** Reprocesses an existing document with replacement bytes (multipart). */
	async reprocess(documentId, options) {
		const form = await buildUploadForm(options);
		const path = `${this.base}/${encodePathSegment(documentId)}`;
		const body = await this.transport.requestJson("PUT", path, { body: form });
		if (body === null) return {
			id: documentId,
			status: "queued",
			contentHash: "",
			deduplicated: false
		};
		return body;
	}
	/** Metadata for one document. */
	async get(documentId) {
		const body = await this.transport.requestJson("GET", `${this.base}/${encodePathSegment(documentId)}`);
		return body;
	}
	/** Raw document bytes. */
	async raw(documentId) {
		return this.transport.requestBytes("GET", `${this.base}/${encodePathSegment(documentId)}/raw`);
	}
	/** Paginated text chunks. */
	async chunks(documentId, options) {
		const q = {};
		if (options?.page !== void 0) q.page = options.page;
		if (options?.pageSize !== void 0) q.page_size = options.pageSize;
		const body = await this.transport.requestJson("GET", `${this.base}/${encodePathSegment(documentId)}/chunks`, { query: q });
		return body;
	}
	/** Lists documents with optional filters. */
	async list(options) {
		const q = {};
		if (options?.status !== void 0) q.status = options.status;
		if (options?.mimeType !== void 0) q.mime_type = options.mimeType;
		if (options?.page !== void 0) q.page = options.page;
		if (options?.pageSize !== void 0) q.page_size = options.pageSize;
		const body = await this.transport.requestJson("GET", this.base, { query: q });
		return body;
	}
	/** Deletes a document. */
	async delete(documentId) {
		await this.transport.requestJson("DELETE", `${this.base}/${encodePathSegment(documentId)}`);
	}
	/** Hybrid / vector / BM25 / graph search over the document corpus. */
	async query(options) {
		const body = await this.transport.requestJson("POST", `${this.base}/query`, { body: options });
		return body;
	}
	/** Recomputes derived document↔keyword and document↔document links. */
	async recomputeLinks() {
		const body = await this.transport.requestJson("POST", `${this.base}/recompute-links`, { body: {} });
		return body;
	}
};

//#endregion
//#region src/components/entities.ts
/** Entity records, attributes, relations, and attribute history. */
var Entities = class {
	transport;
	contextId;
	constructor(transport, contextId) {
		this.transport = transport;
		this.contextId = contextId;
	}
	get base() {
		return `${getContextApiPrefix(this.contextId)}/entities`;
	}
	/** Lists entities, optionally filtered by type. */
	async list(options) {
		const body = await this.transport.requestJson("GET", this.base, { query: options?.type !== void 0 ? { type: options.type } : void 0 });
		return body.entities;
	}
	/** Fetches a single entity by type and name, with its attributes and relations. */
	async get(entityType, name) {
		const path = `${this.base}/${encodePathSegment(entityType)}/${encodePathSegment(name)}`;
		const body = await this.transport.requestJson("GET", path);
		return body;
	}
	/** Returns the supersession history for one attribute key. */
	async history(entityType, name, key) {
		const path = `${this.base}/${encodePathSegment(entityType)}/${encodePathSegment(name)}/history/${encodePathSegment(key)}`;
		const body = await this.transport.requestJson("GET", path);
		return body.history;
	}
	/** Soft-deletes an entity (sets valid-until). */
	async delete(entityType, name) {
		const path = `${this.base}/${encodePathSegment(entityType)}/${encodePathSegment(name)}`;
		await this.transport.requestJson("DELETE", path);
	}
};

//#endregion
//#region src/components/keys.ts
/** Self-service API keys for this context (requires the `manage` grant). */
var Keys = class {
	transport;
	contextId;
	constructor(transport, contextId) {
		this.transport = transport;
		this.contextId = contextId;
	}
	get base() {
		return `${getContextApiPrefix(this.contextId)}/keys`;
	}
	/**
	* Mints a new key. The full secret is returned once in
	* {@link MintedKeyJson.key} and cannot be retrieved again.
	*/
	async create(options) {
		const payload = {};
		if (options?.name !== void 0) payload.name = options.name;
		if (options?.grants !== void 0) payload.grants = options.grants;
		const body = await this.transport.requestJson("POST", this.base, {
			body: Object.keys(payload).length > 0 ? payload : void 0,
			query: { ttlSeconds: options?.ttlSeconds }
		});
		return body;
	}
	/** Lists key metadata for the context (secrets are never included). */
	async list() {
		const body = await this.transport.requestJson("GET", this.base);
		return body ?? [];
	}
	/** Revokes a key by name. */
	async delete(keyName) {
		await this.transport.requestJson("DELETE", `${this.base}/${encodePathSegment(keyName)}`);
	}
	/** Rotates a key, returning a fresh secret in {@link MintedKeyJson.key}. */
	async rotate(keyName, options) {
		const body = await this.transport.requestJson("POST", `${this.base}/${encodePathSegment(keyName)}/rotate`, { query: { ttlSeconds: options?.ttlSeconds } });
		return body;
	}
};

//#endregion
//#region src/components/lifecycle.ts
/** Operator lifecycle sweeps (expiry and decay). */
var Lifecycle = class {
	transport;
	contextId;
	constructor(transport, contextId) {
		this.transport = transport;
		this.contextId = contextId;
	}
	get base() {
		return `${getContextApiPrefix(this.contextId)}/lifecycle`;
	}
	/** Runs the context-category expiry sweep. Returns the number of affected rows. */
	async expire() {
		const body = await this.transport.requestJson("POST", `${this.base}/expire`, { body: {} });
		return body;
	}
	/** Runs the importance decay sweep. Returns the number of affected rows. */
	async decay() {
		const body = await this.transport.requestJson("POST", `${this.base}/decay`, { body: {} });
		return body;
	}
};

//#endregion
//#region src/components/principals.ts
/** Principals and their scope grants (requires the `manage` grant). */
var Principals = class {
	transport;
	contextId;
	constructor(transport, contextId) {
		this.transport = transport;
		this.contextId = contextId;
	}
	get base() {
		return `${getContextApiPrefix(this.contextId)}/principals`;
	}
	/** Lists all principals in the context. */
	async list() {
		const body = await this.transport.requestJson("GET", this.base);
		return body;
	}
	/** Fetches a single principal and its declared grants. */
	async get(principalId) {
		const body = await this.transport.requestJson("GET", `${this.base}/${encodePathSegment(principalId)}`);
		return body;
	}
	/** Resolves the verbs a principal effectively holds at a scope path. */
	async effective(principalId, options) {
		const query = { path: options.path };
		if (options.asOf !== void 0) query.asOf = options.asOf;
		const body = await this.transport.requestJson("GET", `${this.base}/${encodePathSegment(principalId)}/effective`, { query });
		return body;
	}
	/** Grants a principal a set of verbs over a scope pattern. */
	async grant(principalId, options) {
		const body = await this.transport.requestJson("POST", `${this.base}/${encodePathSegment(principalId)}/grants`, { body: {
			path: options.path,
			verbs: options.verbs
		} });
		return body;
	}
	/** Revokes a set of verbs from a principal over a scope pattern. */
	async revoke(principalId, options) {
		const body = await this.transport.requestJson("DELETE", `${this.base}/${encodePathSegment(principalId)}/grants`, { body: {
			path: options.path,
			verbs: options.verbs
		} });
		return body;
	}
};

//#endregion
//#region src/components/scopes.ts
/** The scope tree: register, list, delete, and forget scope subtrees. */
var Scopes = class {
	transport;
	contextId;
	constructor(transport, contextId) {
		this.transport = transport;
		this.contextId = contextId;
	}
	get base() {
		return `${getContextApiPrefix(this.contextId)}/scopes`;
	}
	/** Lists registered scope nodes. */
	async list() {
		const body = await this.transport.requestJson("GET", this.base);
		return body;
	}
	/** Registers a scope path with optional display metadata. */
	async register(options) {
		const payload = { path: options.path };
		if (options.displayName !== void 0) payload.displayName = options.displayName;
		if (options.description !== void 0) payload.description = options.description;
		const body = await this.transport.requestJson("POST", this.base, { body: payload });
		return body;
	}
	/** Deletes (tombstones) a scope node by path. */
	async delete(path) {
		await this.transport.requestJson("DELETE", this.base, { query: { path } });
	}
	/** Forgets (erases) a scope subtree. Returns the number of rows forgotten. */
	async forget(options) {
		const payload = {};
		if (options?.path !== void 0) payload.path = options.path;
		const body = await this.transport.requestJson("POST", `${this.base}/forget`, { body: payload });
		return body;
	}
};

//#endregion
//#region src/scope.ts
function isTupleArray(value) {
	return value.length > 0 && Array.isArray(value[0]);
}
/**
* Normalises a {@link Scope} input to the wire `ScopeSet` (an ordered,
* de-duplicated array of `key/value` slash-path strings).
*
* Mappings and `[key, value]` tuples become `key/value` paths; path strings pass
* through. Empty strings are dropped and duplicates are removed while preserving
* first-seen order.
*
* @param scope Scope input in any accepted shape.
* @returns The normalised path list, or `undefined` when empty (so callers can
*   omit the field entirely and use the key's default write region).
*/
function normaliseScope(scope) {
	if (scope === void 0 || scope === null) return void 0;
	let paths;
	if (typeof scope === "string") paths = [scope];
	else if (Array.isArray(scope)) paths = isTupleArray(scope) ? scope.map(([k, v]) => `${k}/${v}`) : scope.slice();
	else paths = Object.entries(scope).map(([k, v]) => `${k}/${v}`);
	const out = [...new Set(paths.filter((p) => p.length > 0))];
	return out.length > 0 ? out : void 0;
}

//#endregion
//#region src/components/sessions.ts
/** An open conversation session within a Spectron context. */
var Session = class {
	transport;
	contextId;
	/** Session id (API path segment). */
	id;
	/** Creation timestamp. */
	createdAt;
	/** Scope paths the session writes to. */
	scope;
	constructor(transport, contextId, info) {
		this.transport = transport;
		this.contextId = contextId;
		this.id = info.id;
		this.createdAt = info.createdAt;
		this.scope = info.scope;
	}
	get base() {
		return `${getContextApiPrefix(this.contextId)}/sessions/${encodePathSegment(this.id)}`;
	}
	/** Deletes this session on the server. */
	async close() {
		await this.transport.requestJson("DELETE", this.base);
	}
	/** Lists turns recorded against this session. */
	async turns() {
		const body = await this.transport.requestJson("GET", `${this.base}/turns`);
		return body.turns;
	}
	/** Retrieves session-scoped LLM context text for a query. */
	async context(options) {
		const body = await this.transport.requestJson("POST", `${this.base}/context`, { body: { query: options.query } });
		return body;
	}
};
/** Creates and manages conversation sessions for a context. */
var Sessions = class {
	transport;
	contextId;
	constructor(transport, contextId) {
		this.transport = transport;
		this.contextId = contextId;
	}
	/** Opens a new session with optional scope and metadata. */
	async create(options) {
		const base = `${getContextApiPrefix(this.contextId)}/sessions`;
		const payload = {};
		const scope = normaliseScope(options?.scope);
		if (scope) payload.scope = scope;
		if (options?.metadata !== void 0) payload.metadata = options.metadata;
		const body = await this.transport.requestJson("POST", base, { body: payload });
		return new Session(this.transport, this.contextId, body);
	}
};

//#endregion
//#region src/components/traces.ts
/** Retrieval decision traces for a context. */
var Traces = class {
	transport;
	contextId;
	constructor(transport, contextId) {
		this.transport = transport;
		this.contextId = contextId;
	}
	get base() {
		return `${getContextApiPrefix(this.contextId)}/traces`;
	}
	/** Lists recent trace records. */
	async list(options) {
		const body = await this.transport.requestJson("GET", this.base, { query: options?.limit !== void 0 ? { limit: options.limit } : void 0 });
		return body.traces;
	}
	/** Fetches one trace by id. */
	async get(traceId) {
		const body = await this.transport.requestJson("GET", `${this.base}/${encodePathSegment(traceId)}`);
		return body;
	}
	/** Aggregate trace statistics over the recent window. */
	async stats() {
		const body = await this.transport.requestJson("GET", `${this.base}/stats`);
		return body;
	}
};

//#endregion
//#region src/streaming.ts
function frameToChunk(payload, done) {
	const delta = typeof payload.delta === "string" ? payload.delta : typeof payload.token === "string" ? payload.token : "";
	const traceId = typeof payload.traceId === "string" ? payload.traceId : typeof payload.trace_id === "string" ? payload.trace_id : void 0;
	const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : typeof payload.session_id === "string" ? payload.session_id : void 0;
	return {
		delta,
		traceId,
		sessionId,
		done,
		raw: payload
	};
}
/**
* Parses an SSE response body into {@link ChatChunk}s.
*
* Handles multi-line `data:` payloads, comment lines, and the terminal
* `[DONE]` sentinel.
*
* @param response A streaming `fetch` response with a readable body.
*/
async function* parseChatStream(response) {
	const body = response.body;
	if (!body) return;
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (value) buffer += decoder.decode(value, { stream: true });
			if (done) buffer += decoder.decode();
			let sep;
			while ((sep = buffer.search(/\r?\n\r?\n/)) !== -1) {
				const rawFrame = buffer.slice(0, sep);
				buffer = buffer.slice(sep + (buffer[sep] === "\r" ? 4 : 2));
				const dataLines = [];
				for (const line of rawFrame.split(/\r?\n/)) {
					if (line.startsWith(":")) continue;
					if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
				}
				if (dataLines.length === 0) continue;
				const data = dataLines.join("\n");
				if (data === "[DONE]") {
					yield {
						delta: "",
						done: true,
						raw: {}
					};
					return;
				}
				let payload;
				try {
					payload = JSON.parse(data);
				} catch {
					payload = { delta: data };
				}
				const isDone = payload.done === true;
				yield frameToChunk(payload, isDone);
				if (isDone) return;
			}
			if (done) break;
		}
	} finally {
		reader.releaseLock();
	}
}

//#endregion
//#region src/errors.ts
/** Base class for all Spectron client errors. */
var SpectronError = class extends Error {
	name = "SpectronError";
	/** HTTP status code, or `0` for connection failures. */
	status;
	/** Short error title from the API or a generic label. */
	title;
	/** Human-readable detail when provided. */
	detail;
	/** RFC 7807 `type` URI when provided. */
	type;
	/** RFC 7807 `instance` when provided. */
	instance;
	/** Additional problem-details fields. */
	extensions;
	constructor(options) {
		const detail = options.detail ?? void 0;
		let message = `[${options.status}] ${options.title}`;
		if (detail) message += `: ${detail}`;
		super(message, options.cause !== void 0 ? { cause: options.cause } : void 0);
		this.status = options.status;
		this.title = options.title;
		this.detail = detail;
		this.type = options.type ?? void 0;
		this.instance = options.instance ?? void 0;
		this.extensions = options.extensions ?? {};
	}
};
/** Missing or invalid bearer token (401). */
var AuthError = class extends SpectronError {
	name = "AuthError";
};
/** Principal or scope floor rejected the call (403). */
var ScopeError = class extends SpectronError {
	name = "ScopeError";
};
/** Resource not found (404). */
var NotFoundError = class extends SpectronError {
	name = "NotFoundError";
};
/** Invalid request body or parameters (400 / 422). */
var ValidationError = class extends SpectronError {
	name = "ValidationError";
};
/** Rate or token budget exceeded (429). */
var RateLimitError = class extends SpectronError {
	name = "RateLimitError";
	/** Seconds from `Retry-After` when numeric. */
	retryAfter;
	constructor(options) {
		super(options);
		this.retryAfter = options.retryAfter ?? void 0;
	}
};
/** Server error after retries exhausted (5xx). */
var ServerError = class extends SpectronError {
	name = "ServerError";
};
/** Network failure, timeout, or other non-HTTP error (status 0). */
var ConnectionError = class extends SpectronError {
	name = "ConnectionError";
};
const STATUS_MAP = {
	400: ValidationError,
	401: AuthError,
	403: ScopeError,
	404: NotFoundError,
	422: ValidationError
};
function parseRetryAfter(headers) {
	const raw = headers.get("Retry-After") ?? headers.get("retry-after");
	if (raw === null) return void 0;
	const n = Number(raw);
	return Number.isFinite(n) ? n : void 0;
}
/**
* Builds a typed error from an API error response body and headers.
* @param status HTTP status code.
* @param body Parsed JSON body or plain text, or null.
* @param headers Response headers (for `Retry-After` on 429).
*/
function errorFromResponse(status, body, headers) {
	const extensions = {};
	let title = "Spectron request failed";
	let detail;
	let type;
	let instance;
	if (body !== null && typeof body === "object" && !Array.isArray(body)) {
		const o = body;
		const t = o.title ?? o.message;
		if (typeof t === "string") title = t;
		if (typeof o.detail === "string") detail = o.detail;
		if (typeof o.type === "string") type = o.type;
		if (typeof o.instance === "string") instance = o.instance;
		for (const [key, value] of Object.entries(o)) if (![
			"status",
			"title",
			"detail",
			"type",
			"instance",
			"message"
		].includes(key)) extensions[key] = value;
	} else if (typeof body === "string" && body.length > 0) detail = body;
	const base = {
		status,
		title,
		detail,
		type,
		instance,
		extensions
	};
	if (status >= 500) return new ServerError(base);
	if (status === 429) return new RateLimitError({
		...base,
		retryAfter: parseRetryAfter(headers)
	});
	const Ctor = STATUS_MAP[status];
	if (Ctor) return new Ctor(base);
	return new SpectronError(base);
}

//#endregion
//#region src/idempotency.ts
/**
* Idempotency-key derivation for safe write retries.
*
* Mirrors the reference clients: the key is a SHA-256 digest of the request
* method, path, body, and a 30-second time bucket. Identical writes replayed
* within the same bucket collapse to a single server-side effect, which makes
* the `/facts` and `/facts/batch` writes safe to retry.
*/
const BUCKET_SECONDS = 30;
function toHex(buffer) {
	const bytes = new Uint8Array(buffer);
	let out = "";
	for (const b of bytes) out += b.toString(16).padStart(2, "0");
	return out;
}
/**
* Computes an idempotency key for a write request.
*
* @param method HTTP method (e.g. `POST`).
* @param path Request path including the context prefix.
* @param body Serialised request body (empty string when none).
* @param now Current epoch milliseconds (injectable for tests).
* @returns A hex-encoded SHA-256 digest.
*/
async function idempotencyKey(method, path, body, now = Date.now()) {
	const bucket = Math.floor(now / 1e3 / BUCKET_SECONDS);
	const material = `${method}\0${path}\0${body}\0${bucket}`;
	const data = new TextEncoder().encode(material);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return toHex(digest);
}

//#endregion
//#region src/retry.ts
const _BACKOFF_MS = [
	250,
	500,
	1e3
];
/** Back-off delays (ms) used between retry attempts for idempotent reads. */
function backoffSchedule(maxRetries) {
	const capped = Math.max(0, Math.min(maxRetries, _BACKOFF_MS.length));
	return _BACKOFF_MS.slice(0, capped);
}
/**
* Whether a failed request should be retried.
*
* Retries apply to idempotent reads (`GET`/`HEAD`) and writes explicitly marked
* idempotent, on `5xx` responses or connection errors (`status === null`).
*/
function shouldRetry(method, status, attempt, maxRetries, idempotent = false) {
	if (attempt >= maxRetries) return false;
	const m = method.toUpperCase();
	if (m !== "GET" && m !== "HEAD" && !idempotent) return false;
	if (status === null) return true;
	return status >= 500;
}

//#endregion
//#region src/transport.ts
const DEFAULT_TIMEOUT_MS = 3e4;
const DEFAULT_MAX_RETRIES = 3;
function buildUrl(endpoint, path, query) {
	const urlStr = path.startsWith("http://") || path.startsWith("https://") ? path : `${endpoint.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
	if (!query || Object.keys(query).length === 0) return urlStr;
	const url = new URL(urlStr);
	for (const [k, v] of Object.entries(query)) {
		if (v === void 0 || v === null) continue;
		url.searchParams.set(k, String(v));
	}
	return url.toString();
}
function decodeBody(text) {
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}
function sleep(ms) {
	return new Promise((r) => setTimeout(r, ms));
}
/**
* Performs authenticated HTTP requests with retries, idempotency keys, JSON
* handling, and server-sent-event streaming.
*/
var Transport = class Transport {
	endpoint;
	apiKey;
	timeoutMs;
	maxRetries;
	fetchImpl;
	onBehalfOf;
	constructor(options) {
		if (!options.endpoint) throw new TypeError("Spectron endpoint is required.");
		if (!options.apiKey) throw new TypeError("Spectron API key is required.");
		this.endpoint = options.endpoint.replace(/\/$/, "");
		this.apiKey = options.apiKey;
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
		this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
		this.onBehalfOf = options.onBehalfOf;
	}
	/**
	* Returns a copy of this transport that issues every request on behalf of
	* `principalId` (adds the `X-Spectron-On-Behalf-Of` header).
	*/
	withOnBehalfOf(principalId) {
		return new Transport({
			endpoint: this.endpoint,
			apiKey: this.apiKey,
			timeoutMs: this.timeoutMs,
			maxRetries: this.maxRetries,
			fetchImpl: this.fetchImpl,
			onBehalfOf: principalId
		});
	}
	/** Builds the common request headers, including delegation when configured. */
	baseHeaders(accept) {
		const headers = {
			Accept: accept,
			Authorization: `Bearer ${this.apiKey}`,
			"User-Agent": `surrealdb-spectron-js/1.0.0-alpha.1`
		};
		if (this.onBehalfOf) headers["X-Spectron-On-Behalf-Of"] = this.onBehalfOf;
		return headers;
	}
	/**
	* Sends a JSON or multipart request.
	* @returns Parsed JSON, or `null` for empty 204 responses.
	*/
	async requestJson(method, path, init) {
		const methodUpper = method.toUpperCase();
		const url = buildUrl(this.endpoint, path, init?.query);
		const timeoutMs = init?.timeoutMs ?? this.timeoutMs;
		const schedule = backoffSchedule(this.maxRetries);
		const headerObj = this.baseHeaders("application/json");
		let body;
		let serialisedBody = "";
		const bodyInput = init?.body;
		if (bodyInput !== void 0) if (bodyInput instanceof FormData) body = bodyInput;
		else {
			serialisedBody = JSON.stringify(bodyInput);
			body = serialisedBody;
			headerObj["Content-Type"] = "application/json";
		}
		if (init?.idempotent) headerObj["Idempotency-Key"] = await idempotencyKey(methodUpper, path, serialisedBody);
		let attempt = 0;
		for (;;) {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), timeoutMs);
			const headersForFetch = { ...headerObj };
			if (body instanceof FormData) delete headersForFetch["Content-Type"];
			try {
				const response = await this.fetchImpl(url, {
					method: methodUpper,
					headers: headersForFetch,
					body: methodUpper === "GET" || methodUpper === "HEAD" ? void 0 : body,
					signal: controller.signal
				});
				clearTimeout(timer);
				if (response.status >= 400 && shouldRetry(methodUpper, response.status, attempt, this.maxRetries, init?.idempotent)) {
					await sleep(schedule[attempt] ?? 1e3);
					attempt += 1;
					continue;
				}
				const text = await response.text();
				if (!response.ok) throw errorFromResponse(response.status, decodeBody(text), response.headers);
				if (response.status === 204 || text.length === 0) return null;
				return decodeBody(text);
			} catch (e) {
				clearTimeout(timer);
				if (e instanceof Error && e.name === "AbortError") throw new ConnectionError({
					status: 0,
					title: "Request timed out",
					detail: `Exceeded ${timeoutMs}ms`,
					cause: e
				});
				if (shouldRetry(methodUpper, null, attempt, this.maxRetries, init?.idempotent) && !(e instanceof Error && "status" in e)) {
					await sleep(schedule[attempt] ?? 1e3);
					attempt += 1;
					continue;
				}
				if (e && typeof e === "object" && "status" in e) throw e;
				throw new ConnectionError({
					status: 0,
					title: "Connection failed",
					detail: e instanceof Error ? e.message : String(e),
					cause: e
				});
			}
		}
	}
	/**
	* GET that returns raw bytes (e.g. document `raw`).
	*/
	async requestBytes(method, path, init) {
		const methodUpper = method.toUpperCase();
		const url = buildUrl(this.endpoint, path, init?.query);
		const timeoutMs = init?.timeoutMs ?? this.timeoutMs;
		const schedule = backoffSchedule(this.maxRetries);
		const headers = this.baseHeaders("*/*");
		let attempt = 0;
		for (;;) {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), timeoutMs);
			try {
				const response = await this.fetchImpl(url, {
					method: methodUpper,
					headers,
					signal: controller.signal
				});
				clearTimeout(timer);
				if (response.status >= 400 && shouldRetry(methodUpper, response.status, attempt, this.maxRetries)) {
					await sleep(schedule[attempt] ?? 1e3);
					attempt += 1;
					continue;
				}
				if (!response.ok) {
					const text = await response.text();
					throw errorFromResponse(response.status, decodeBody(text), response.headers);
				}
				return await response.arrayBuffer();
			} catch (e) {
				clearTimeout(timer);
				if (e instanceof Error && e.name === "AbortError") throw new ConnectionError({
					status: 0,
					title: "Request timed out",
					detail: `Exceeded ${timeoutMs}ms`,
					cause: e
				});
				if (shouldRetry(methodUpper, null, attempt, this.maxRetries)) {
					await sleep(schedule[attempt] ?? 1e3);
					attempt += 1;
					continue;
				}
				if (e && typeof e === "object" && "status" in e) throw e;
				throw new ConnectionError({
					status: 0,
					title: "Connection failed",
					detail: e instanceof Error ? e.message : String(e),
					cause: e
				});
			}
		}
	}
	/**
	* Opens a server-sent-event stream (e.g. streaming `chat`).
	*
	* Streams are not retried; the returned {@link Response} carries the raw SSE
	* body for the caller to parse.
	*/
	async stream(method, path, init) {
		const methodUpper = method.toUpperCase();
		const url = buildUrl(this.endpoint, path, init?.query);
		const headers = this.baseHeaders("text/event-stream");
		let body;
		if (init?.body !== void 0) {
			body = JSON.stringify(init.body);
			headers["Content-Type"] = "application/json";
		}
		let response;
		try {
			response = await this.fetchImpl(url, {
				method: methodUpper,
				headers,
				body
			});
		} catch (e) {
			throw new ConnectionError({
				status: 0,
				title: "Connection failed",
				detail: e instanceof Error ? e.message : String(e),
				cause: e
			});
		}
		if (!response.ok) {
			const text = await response.text();
			throw errorFromResponse(response.status, decodeBody(text), response.headers);
		}
		return response;
	}
};

//#endregion
//#region src/client.ts
function addDefined(target, key, value) {
	if (value !== void 0) target[key] = value;
}
/**
* Typed client for the public Spectron API: memory writes and recall, document
* ingestion, sessions, entities, lifecycle, traces, and scope administration.
*
* The client is pinned to a single `context`; every call targets
* `/api/v1/{context}/…`.
*/
var Spectron = class Spectron {
	transport;
	/** Spectron context id this client calls. */
	contextId;
	/** Document ingestion, retrieval, corpus search, and the keyword graph. */
	documents;
	/** Entity records, attributes, relations, and attribute history. */
	entities;
	/** Conversation sessions for this context. */
	sessions;
	/** Expiry and decay sweeps. */
	lifecycle;
	/** Retrieval trace tooling. */
	traces;
	/** Principals and their scope grants. */
	principals;
	/** The scope tree. */
	scopes;
	/** Self-service API keys for this context. */
	keys;
	constructor(options) {
		if (!options.context) throw new TypeError("Spectron context is required.");
		this.contextId = options.context;
		this.transport = new Transport({
			apiKey: options.apiKey,
			endpoint: options.endpoint,
			timeoutMs: options.timeout,
			maxRetries: options.maxRetries,
			fetchImpl: options.fetchImpl
		});
		const components = Spectron.buildComponents(this.transport, this.contextId);
		this.documents = components.documents;
		this.entities = components.entities;
		this.sessions = components.sessions;
		this.lifecycle = components.lifecycle;
		this.traces = components.traces;
		this.principals = components.principals;
		this.scopes = components.scopes;
		this.keys = components.keys;
	}
	static buildComponents(transport, contextId) {
		return {
			documents: new Documents(transport, contextId),
			entities: new Entities(transport, contextId),
			sessions: new Sessions(transport, contextId),
			lifecycle: new Lifecycle(transport, contextId),
			traces: new Traces(transport, contextId),
			principals: new Principals(transport, contextId),
			scopes: new Scopes(transport, contextId),
			keys: new Keys(transport, contextId)
		};
	}
	get base() {
		return getContextApiPrefix(this.contextId);
	}
	/**
	* Returns a client that issues every request on behalf of `principalId`,
	* sending the `X-Spectron-On-Behalf-Of` delegation header. Requires the
	* `manage` grant. The original client is left unchanged.
	*/
	onBehalfOf(principalId) {
		if (!principalId) throw new TypeError("onBehalfOf requires a principal id.");
		const transport = this.transport.withOnBehalfOf(principalId);
		const delegate = Object.create(Spectron.prototype);
		return Object.assign(delegate, {
			contextId: this.contextId,
			transport,
			...Spectron.buildComponents(transport, this.contextId)
		});
	}
	/**
	* Liveness probe for the API (`GET /api/v1/health`).
	* @throws {SpectronError} When the service is unhealthy or unreachable.
	*/
	async health() {
		await this.transport.requestJson("GET", "/api/v1/health");
	}
	/**
	* Persists facts from free-form text and/or caller-supplied triples
	* (`POST /facts`). Idempotent within a 30-second window.
	*/
	async remember(text, options) {
		const payload = {};
		addDefined(payload, "text", text);
		addDefined(payload, "infer", options?.infer);
		addDefined(payload, "session_id", options?.sessionId);
		addDefined(payload, "scope", normaliseScope(options?.scope));
		addDefined(payload, "role", options?.role);
		addDefined(payload, "memory_category", options?.memoryCategory);
		addDefined(payload, "labels", options?.labels);
		addDefined(payload, "triples", options?.triples);
		const body = await this.transport.requestJson("POST", `${this.base}/facts`, {
			body: payload,
			idempotent: true
		});
		return body;
	}
	/**
	* Persists facts from a batch of conversation messages (`POST /facts/batch`).
	* Idempotent within a 30-second window.
	*/
	async rememberMany(messages, options) {
		const payload = { messages };
		addDefined(payload, "session_id", options?.sessionId);
		addDefined(payload, "scope", normaliseScope(options?.scope));
		addDefined(payload, "extract", options?.extract);
		addDefined(payload, "infer", options?.infer);
		addDefined(payload, "labels", options?.labels);
		const body = await this.transport.requestJson("POST", `${this.base}/facts/batch`, {
			body: payload,
			idempotent: true
		});
		return body;
	}
	/** Semantic recall over memory for this context (`POST /query`). */
	async recall(query, options) {
		const payload = { query };
		addDefined(payload, "k", options?.k);
		addDefined(payload, "mode", options?.mode);
		addDefined(payload, "sessionId", options?.sessionId);
		addDefined(payload, "include", options?.include);
		addDefined(payload, "asOf", options?.asOf);
		addDefined(payload, "atInstant", options?.atInstant);
		addDefined(payload, "labels", options?.labels);
		addDefined(payload, "lens", options?.lens);
		addDefined(payload, "scopeView", options?.scopeView);
		addDefined(payload, "validFrom", options?.validFrom);
		addDefined(payload, "validUntil", options?.validUntil);
		addDefined(payload, "source", options?.source);
		addDefined(payload, "location", options?.location);
		const body = await this.transport.requestJson("POST", `${this.base}/query`, { body: payload });
		return body;
	}
	/** Forgets memory matching a natural-language query (`POST /forget`). */
	async forget(query, options) {
		const payload = { query };
		if (options?.purge) payload.purge = true;
		const body = await this.transport.requestJson("POST", `${this.base}/forget`, { body: payload });
		return body;
	}
	async chat(message, options) {
		const payload = { message };
		addDefined(payload, "sessionId", options?.sessionId);
		addDefined(payload, "scope", normaliseScope(options?.scope));
		addDefined(payload, "model", options?.model);
		if (options?.bypassCache) payload.bypassCache = true;
		addDefined(payload, "labels", options?.labels);
		if (options?.stream) {
			payload.stream = true;
			const response = await this.transport.stream("POST", `${this.base}/chat`, { body: payload });
			return parseChatStream(response);
		}
		const body = await this.transport.requestJson("POST", `${this.base}/chat`, { body: payload });
		return body;
	}
	/** Retrieves LLM-facing context text for a query without a session (`POST /context`). */
	async context(query, options) {
		const payload = { query };
		addDefined(payload, "k", options?.k);
		addDefined(payload, "labels", options?.labels);
		addDefined(payload, "lens", options?.lens);
		addDefined(payload, "scopeView", options?.scopeView);
		const body = await this.transport.requestJson("POST", `${this.base}/context`, { body: payload });
		return body;
	}
	/** Runs a reflection pass; may persist attributes when `persist` is true (`POST /reflect`). */
	async reflect(query, options) {
		const body = await this.transport.requestJson("POST", `${this.base}/reflect`, { body: {
			query,
			persist: options?.persist ?? false
		} });
		return body;
	}
	/** Consolidates accumulated observations into durable facts (`POST /consolidate`). */
	async consolidate(options) {
		const payload = {};
		if (options?.dryRun) payload.dryRun = true;
		addDefined(payload, "factLimit", options?.factLimit);
		addDefined(payload, "observationLimit", options?.observationLimit);
		const body = await this.transport.requestJson("POST", `${this.base}/consolidate`, { body: payload });
		return body;
	}
	/** Infers and emits new relation edges between entities (`POST /elaborate`). */
	async elaborate(options) {
		const payload = {};
		addDefined(payload, "entityRef", options?.entityRef);
		addDefined(payload, "budget", options?.budget);
		if (options?.sweep) payload.sweep = true;
		if (options?.dryRun) payload.dryRun = true;
		const body = await this.transport.requestJson("POST", `${this.base}/elaborate`, { body: payload });
		return body;
	}
	/** Runs an integrity check over the memory store (`POST /fsck`). */
	async fsck(options) {
		const payload = {};
		addDefined(payload, "check", options?.check);
		addDefined(payload, "duplicateThreshold", options?.duplicateThreshold);
		addDefined(payload, "maxResults", options?.maxResults);
		const body = await this.transport.requestJson("POST", `${this.base}/fsck`, { body: payload });
		return body;
	}
	/** Inspects an entity, attribute, or trace by reference (`GET /inspect`). */
	async inspect(ref, options) {
		const query = { ref };
		addDefined(query, "asOf", options?.asOf);
		addDefined(query, "atInstant", options?.atInstant);
		addDefined(query, "validFrom", options?.validFrom);
		addDefined(query, "validUntil", options?.validUntil);
		const body = await this.transport.requestJson("GET", `${this.base}/inspect`, { query });
		return body;
	}
	/** Lists audit rows for write/recall activity (`GET /audit`). */
	async audit(options) {
		const query = {};
		addDefined(query, "principal", options?.principal);
		addDefined(query, "key", options?.key);
		addDefined(query, "kind", options?.kind);
		addDefined(query, "since", options?.since);
		addDefined(query, "until", options?.until);
		addDefined(query, "limit", options?.limit);
		const body = await this.transport.requestJson("GET", `${this.base}/audit`, { query });
		return body;
	}
	/** Structured memory state snapshot (`GET /state`). */
	async state() {
		const body = await this.transport.requestJson("GET", `${this.base}/state`);
		return body;
	}
	/** Static and dynamic profile slices (`GET /profile`). */
	async profile() {
		const body = await this.transport.requestJson("GET", `${this.base}/profile`);
		return body;
	}
	/** The calling principal's identity and resolved grants (`GET /me`). */
	async whoami() {
		const body = await this.transport.requestJson("GET", `${this.base}/me`);
		return body;
	}
};

//#endregion
//#region src/types/domain.ts
/** Inference mode for the `/facts` write API. */
const InferMode = {
	full: "full",
	triples: "triples",
	preview: "preview",
	none: "none"
};
/** Bulk extraction strategy for `/facts/batch`. */
const BatchExtractionMode = {
	per_message: "per_message",
	whole_conversation: "whole_conversation"
};
/** Memory category classification applied during extraction. */
const MemoryCategory = {
	identity: "identity",
	knowledge: "knowledge",
	context: "context"
};
/** Role of a conversation turn participant. */
const TurnRole = {
	user: "user",
	assistant: "assistant",
	system: "system",
	tool: "tool"
};
/** Chunk query mode for `/documents/query`. */
const QueryMode = {
	hybrid: "hybrid",
	vector: "vector",
	bm25: "bm25",
	hybrid_graph: "hybrid_graph"
};
/** Grant verb in the scope permission model. */
const Verb = {
	read: "read",
	write: "write",
	create_scope: "create_scope",
	delete_scope: "delete_scope",
	grant: "grant",
	manage: "manage",
	forget: "forget"
};
/** Scope read breadth for memory queries. */
const ScopeView = {
	strict: "strict",
	merged: "merged",
	crossTeam: "crossTeam"
};
/** Document pipeline status values returned by the API. */
const DocumentStatus = {
	queued: "queued",
	extracting: "extracting",
	chunking: "chunking",
	embedding: "embedding",
	keywording: "keywording",
	extracting_nodes: "extracting_nodes",
	ready: "ready",
	failed: "failed"
};

//#endregion
exports.AuthError = AuthError;
exports.BatchExtractionMode = BatchExtractionMode;
exports.ConnectionError = ConnectionError;
exports.DocumentKeywords = DocumentKeywords;
exports.DocumentStatus = DocumentStatus;
exports.Documents = Documents;
exports.Entities = Entities;
exports.InferMode = InferMode;
exports.Keys = Keys;
exports.Lifecycle = Lifecycle;
exports.MemoryCategory = MemoryCategory;
exports.NotFoundError = NotFoundError;
exports.Principals = Principals;
exports.QueryMode = QueryMode;
exports.RateLimitError = RateLimitError;
exports.ScopeError = ScopeError;
exports.ScopeView = ScopeView;
exports.Scopes = Scopes;
exports.ServerError = ServerError;
exports.Session = Session;
exports.Sessions = Sessions;
exports.Spectron = Spectron;
exports.SpectronError = SpectronError;
exports.Traces = Traces;
exports.Transport = Transport;
exports.TurnRole = TurnRole;
exports.ValidationError = ValidationError;
exports.Verb = Verb;
exports.backoffSchedule = backoffSchedule;
exports.encodePathSegment = encodePathSegment;
exports.errorFromResponse = errorFromResponse;
exports.getContextApiPrefix = getContextApiPrefix;
exports.idempotencyKey = idempotencyKey;
exports.normaliseScope = normaliseScope;
exports.parseChatStream = parseChatStream;
exports.shouldRetry = shouldRetry;
exports.spectronFileInputToBlob = spectronFileInputToBlob;