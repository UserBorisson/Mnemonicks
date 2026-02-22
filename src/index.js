const API_PREFIX = "/api";
const API_VERSION = "v1-scaffold";
const SERVICE_NAME = "mnemonicks-api";

const PLAN_ORDER = ["free", "pro", "premium"];

const PLAN_PRESETS = Object.freeze({
  free: {
    features: {
      cloud_import: false,
      cloud_sync: false,
      advanced_generators: false,
      analytics_plus: false,
      priority_tts: false
    },
    limits: {
      maxDecks: 10,
      maxImportCardsPerRequest: 2000,
      dailyReviewEventIngest: 5000
    }
  },
  pro: {
    features: {
      cloud_import: true,
      cloud_sync: true,
      advanced_generators: false,
      analytics_plus: true,
      priority_tts: false
    },
    limits: {
      maxDecks: 200,
      maxImportCardsPerRequest: 10000,
      dailyReviewEventIngest: 50000
    }
  },
  premium: {
    features: {
      cloud_import: true,
      cloud_sync: true,
      advanced_generators: true,
      analytics_plus: true,
      priority_tts: true
    },
    limits: {
      maxDecks: 1000,
      maxImportCardsPerRequest: 50000,
      dailyReviewEventIngest: 250000
    }
  }
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith(API_PREFIX)) {
      if (env?.ASSETS?.fetch) return env.ASSETS.fetch(request);
      return jsonResponse({ ok: false, error: "not_found" }, 404);
    }

    if (request.method === "OPTIONS") {
      return handleOptions(request, env);
    }

    try {
      const auth = await authenticateRequest(request, env);
      return await routeApi(request, env, ctx, auth);
    } catch (err) {
      if (err instanceof HttpError && err.response) return err.response;
      console.error("Unhandled API error", err);
      return apiError("internal_error", "Unexpected server error.", 500, request, env);
    }
  }
};

async function routeApi(request, env, _ctx, auth) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === `${API_PREFIX}/health` && method === "GET") {
    return apiOk(request, env, {
      service: SERVICE_NAME,
      version: API_VERSION,
      now: new Date().toISOString(),
      environment: String(env?.APP_ENV || "production"),
      bindings: summarizeBindings(env)
    });
  }

  if (path === `${API_PREFIX}/auth/session` && method === "GET") {
    return apiOk(request, env, {
      user: auth.user,
      entitlements: auth.entitlements,
      authMode: auth.mode
    });
  }

  if (path === `${API_PREFIX}/entitlements` && method === "GET") {
    return apiOk(request, env, {
      user: auth.user,
      entitlements: auth.entitlements
    });
  }

  if (path === `${API_PREFIX}/voices` && method === "GET") {
    return handleTtsVoices(request, env, auth);
  }

  if (path === `${API_PREFIX}/tts` && method === "POST") {
    return handleTtsSynthesize(request, env, auth);
  }

  if (path === `${API_PREFIX}/openapi.json` && method === "GET") {
    return apiOk(request, env, buildOpenApiSkeleton(url));
  }

  if (path === `${API_PREFIX}/decks` && method === "GET") {
    const staticDecks = await loadStaticDeckManifest(request, env);
    return apiOk(request, env, {
      items: staticDecks,
      cloudDecksEnabled: hasDeckPersistenceBindings(env),
      notes: hasDeckPersistenceBindings(env)
        ? []
        : ["Cloud deck persistence bindings (D1/R2) are not configured yet."]
    });
  }

  if (path === `${API_PREFIX}/decks/import` && method === "POST") {
    requireAuthenticated(auth, request, env);
    requireFeature(auth, "cloud_import", request, env);

    const body = await readJsonBody(request, request, env);
    const name = sanitizeDeckName(body?.name || "");
    const cards = Array.isArray(body?.cards) ? body.cards.filter(isObjectRecord) : [];
    const overwrite = !!body?.overwrite;

    if (!name) {
      return apiError("invalid_request", "Field 'name' is required.", 400, request, env);
    }
    if (!cards.length) {
      return apiError("invalid_request", "Field 'cards' must contain at least one card.", 400, request, env);
    }
    if (cards.length > auth.entitlements.limits.maxImportCardsPerRequest) {
      return apiError(
        "plan_limit_exceeded",
        `Import exceeds plan limit (${auth.entitlements.limits.maxImportCardsPerRequest} cards per request).`,
        403,
        request,
        env,
        { limit: auth.entitlements.limits.maxImportCardsPerRequest }
      );
    }

    if (!hasDeckPersistenceBindings(env)) {
      return apiError(
        "not_implemented",
        "Cloud deck import persistence is not configured yet (add R2/D1 bindings).",
        501,
        request,
        env,
        {
          acceptedShape: true,
          requestSummary: { name, cardCount: cards.length, overwrite }
        }
      );
    }

    // Scaffold only: wire real persistence in next step (R2 blob + D1 metadata).
    return apiError(
      "not_implemented",
      "Persistence bindings detected, but import storage logic is not implemented yet.",
      501,
      request,
      env
    );
  }

  if (path === `${API_PREFIX}/reviews/events` && method === "POST") {
    requireAuthenticated(auth, request, env);

    const body = await readJsonBody(request, request, env);
    const events = Array.isArray(body?.events) ? body.events : [];
    if (!events.length) {
      return apiError("invalid_request", "Field 'events' must be a non-empty array.", 400, request, env);
    }
    if (events.length > auth.entitlements.limits.dailyReviewEventIngest) {
      return apiError(
        "plan_limit_exceeded",
        `Batch exceeds plan limit (${auth.entitlements.limits.dailyReviewEventIngest} events).`,
        403,
        request,
        env,
        { limit: auth.entitlements.limits.dailyReviewEventIngest }
      );
    }

    const validation = validateReviewEvents(events);
    return apiOk(request, env, {
      accepted: validation.accepted,
      rejected: validation.rejected,
      persisted: false,
      message: "Review event ingestion scaffold is active. Persistence is not implemented yet."
    }, 202);
  }

  if (path === `${API_PREFIX}/billing/portal` && method === "POST") {
    requireAuthenticated(auth, request, env);
    return apiError(
      "not_implemented",
      "Billing portal is not configured yet (Stripe integration pending).",
      501,
      request,
      env
    );
  }

  if (path === `${API_PREFIX}/webhooks/stripe` && method === "POST") {
    return apiError(
      "not_implemented",
      "Stripe webhook endpoint scaffold only. Add signature verification + D1 updates.",
      501,
      request,
      env
    );
  }

  return apiError("not_found", "API route not found.", 404, request, env);
}

function summarizeBindings(env) {
  return {
    hasAssets: !!env?.ASSETS?.fetch,
    hasD1: !!env?.DB?.prepare,
    hasDecksBucket: !!env?.DECKS_BUCKET?.get,
    hasTtsUpstream: !!String(env?.TTS_UPSTREAM_BASE_URL || "").trim()
  };
}

function hasDeckPersistenceBindings(env) {
  return !!(env?.DB?.prepare && env?.DECKS_BUCKET?.put);
}

async function loadStaticDeckManifest(request, env) {
  const fallback = [];
  if (!env?.ASSETS?.fetch) return fallback;
  try {
    const url = new URL(request.url);
    url.pathname = "/decks/manifest.json";
    url.search = "";
    const res = await env.ASSETS.fetch(new Request(url.toString(), { method: "GET" }));
    if (!res.ok) return fallback;
    const data = await res.json();
    const rawList = Array.isArray(data) ? data : (Array.isArray(data?.decks) ? data.decks : []);
    const seen = new Set();
    const items = [];
    for (const entry of rawList) {
      let path = "";
      let label = "";
      if (typeof entry === "string") {
        path = normalizeDeckPath(entry);
        label = basename(path).replace(/\.json$/i, "");
      } else if (isObjectRecord(entry)) {
        path = normalizeDeckPath(String(entry.path || entry.name || ""));
        label = String(entry.name || basename(path).replace(/\.json$/i, "")).trim();
      }
      if (!path) continue;
      const key = path.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        id: path,
        path,
        name: label || basename(path),
        source: "static"
      });
    }
    return items;
  } catch (err) {
    console.warn("Failed to read static deck manifest", err);
    return fallback;
  }
}

async function handleTtsVoices(request, env, auth) {
  const requireAuth = parseBooleanEnv(env?.TTS_REQUIRE_AUTH, false);
  if (requireAuth) requireAuthenticated(auth, request, env);

  const upstreamBase = String(env?.TTS_UPSTREAM_BASE_URL || "").trim();
  if (!upstreamBase) {
    const fallbackVoices = getFallbackTtsVoices(env);
    return jsonResponse(fallbackVoices, 200, {
      ...buildCorsHeaders(request, env),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300"
    });
  }

  const upstreamUrl = buildTtsUpstreamUrl(env, "voices");
  const forwardAuthorization = parseBooleanEnv(env?.TTS_FORWARD_AUTH, false)
    ? String(request.headers.get("authorization") || "").trim()
    : "";
  const upstreamRes = await fetchWithTimeout(
    upstreamUrl,
    {
      method: "GET",
      headers: buildTtsUpstreamHeaders(env, { forwardAuthorization }),
      cache: "no-store"
    },
    env,
    15000
  ).catch((err) => {
    console.warn("TTS voices upstream request failed", err);
    return null;
  });

  if (!upstreamRes) {
    return apiError("tts_unavailable", "Could not reach the TTS voices upstream.", 502, request, env);
  }

  const contentType = upstreamRes.headers.get("content-type") || "application/json; charset=utf-8";
  const bodyText = await upstreamRes.text();
  if (!upstreamRes.ok) {
    return apiError(
      "tts_upstream_error",
      `TTS voices upstream returned ${upstreamRes.status}.`,
      502,
      request,
      env,
      { upstreamStatus: upstreamRes.status, upstreamBody: bodyText.slice(0, 300) }
    );
  }

  return new Response(bodyText, {
    status: 200,
    headers: {
      ...buildCorsHeaders(request, env),
      "content-type": contentType,
      "cache-control": "public, max-age=300"
    }
  });
}

async function handleTtsSynthesize(request, env, auth) {
  const requireAuth = parseBooleanEnv(env?.TTS_REQUIRE_AUTH, false);
  if (requireAuth) requireAuthenticated(auth, request, env);

  const body = await readJsonBody(request, request, env);
  const text = String(body?.text ?? "").trim();
  const voice = String(body?.voice ?? "").trim();
  if (!text) {
    return apiError("invalid_request", "Field 'text' is required.", 400, request, env);
  }

  const maxChars = getTtsMaxCharsForAuth(auth, env);
  if (text.length > maxChars) {
    return apiError(
      "plan_limit_exceeded",
      `TTS text exceeds limit (${maxChars} chars for plan '${auth?.entitlements?.plan || "free"}').`,
      403,
      request,
      env,
      { limit: maxChars }
    );
  }

  const upstreamBase = String(env?.TTS_UPSTREAM_BASE_URL || "").trim();
  if (!upstreamBase) {
    return apiError(
      "not_configured",
      "TTS upstream is not configured. Set TTS_UPSTREAM_BASE_URL and related secrets in Wrangler.",
      501,
      request,
      env
    );
  }

  const upstreamUrl = buildTtsUpstreamUrl(env, "tts");
  const upstreamPayload = { text, voice };
  const forwardAuthorization = parseBooleanEnv(env?.TTS_FORWARD_AUTH, false)
    ? String(request.headers.get("authorization") || "").trim()
    : "";
  const upstreamRes = await fetchWithTimeout(
    upstreamUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...buildTtsUpstreamHeaders(env, { forwardAuthorization })
      },
      body: JSON.stringify(upstreamPayload)
    },
    env,
    parsePositiveIntEnv(env?.TTS_UPSTREAM_TIMEOUT_MS, 25000, 1000, 120000)
  ).catch((err) => {
    console.warn("TTS synth upstream request failed", err);
    return null;
  });

  if (!upstreamRes) {
    return apiError("tts_unavailable", "Could not reach the TTS upstream.", 502, request, env);
  }

  if (!upstreamRes.ok) {
    const detail = await upstreamRes.text().catch(() => "");
    return apiError(
      "tts_upstream_error",
      `TTS upstream returned ${upstreamRes.status}.`,
      502,
      request,
      env,
      { upstreamStatus: upstreamRes.status, upstreamBody: detail.slice(0, 300) }
    );
  }

  const headers = {
    ...buildCorsHeaders(request, env),
    "cache-control": "no-store",
    "content-type": upstreamRes.headers.get("content-type") || "audio/mpeg"
  };
  const errorHint = upstreamRes.headers.get("X-TTS-Error");
  if (errorHint) headers["X-TTS-Error"] = errorHint;

  return new Response(upstreamRes.body, {
    status: 200,
    headers
  });
}

function getFallbackTtsVoices(env) {
  const jsonRaw = String(env?.TTS_PUBLIC_VOICES_JSON || "").trim();
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw);
      if (Array.isArray(parsed)) {
        const items = parsed
          .map((entry) => normalizeVoiceEntry(entry))
          .filter(Boolean);
        if (items.length) return items;
      }
    } catch (err) {
      console.warn("Invalid TTS_PUBLIC_VOICES_JSON", err);
    }
  }

  const csv = parseCsv(String(env?.TTS_PUBLIC_VOICES || ""));
  if (csv.length) {
    return csv.map((name) => ({ ShortName: name, Name: name }));
  }

  return [
    { ShortName: "en-US-AriaNeural", Name: "en-US-AriaNeural" },
    { ShortName: "en-US-GuyNeural", Name: "en-US-GuyNeural" },
    { ShortName: "cs-CZ-VlastaNeural", Name: "cs-CZ-VlastaNeural" },
    { ShortName: "tr-TR-AhmetNeural", Name: "tr-TR-AhmetNeural" }
  ];
}

function normalizeVoiceEntry(entry) {
  if (typeof entry === "string") return { ShortName: entry, Name: entry };
  if (!isObjectRecord(entry)) return null;
  const short = String(entry.ShortName || entry.shortName || entry.Name || entry.name || "").trim();
  if (!short) return null;
  return {
    ...entry,
    ShortName: short,
    Name: String(entry.Name || entry.name || short)
  };
}

function buildTtsUpstreamUrl(env, kind) {
  const base = String(env?.TTS_UPSTREAM_BASE_URL || "").trim().replace(/\/+$/, "");
  const path = kind === "voices"
    ? String(env?.TTS_UPSTREAM_VOICES_PATH || "/api/voices")
    : String(env?.TTS_UPSTREAM_TTS_PATH || "/api/tts");
  const normalizedPath = String(path || "").trim();
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
  return `${base}${normalizedPath.startsWith("/") ? "" : "/"}${normalizedPath}`;
}

function buildTtsUpstreamHeaders(env, { forwardAuthorization = "" } = {}) {
  const headers = {};
  const key = String(env?.TTS_UPSTREAM_API_KEY || "").trim();
  const keyHeader = String(env?.TTS_UPSTREAM_API_KEY_HEADER || "X-API-Key").trim();
  if (key && keyHeader) headers[keyHeader] = key;
  if (forwardAuthorization) headers.authorization = forwardAuthorization;
  return headers;
}

function getTtsMaxCharsForAuth(auth, env) {
  const plan = String(auth?.entitlements?.plan || "free").toLowerCase();
  if (plan === "premium") {
    return parsePositiveIntEnv(env?.TTS_MAX_TEXT_CHARS_PREMIUM, 4000, 50, 20000);
  }
  if (plan === "pro") {
    return parsePositiveIntEnv(env?.TTS_MAX_TEXT_CHARS_PRO, 2000, 50, 20000);
  }
  return parsePositiveIntEnv(env?.TTS_MAX_TEXT_CHARS_FREE, 1200, 50, 20000);
}

async function fetchWithTimeout(url, init, _env, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function authenticateRequest(request, env) {
  const header = request.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";

  const allowDevHeaders = String(env?.ALLOW_DEV_AUTH_HEADERS || "true").toLowerCase() !== "false";
  const devPlan = allowDevHeaders ? String(request.headers.get("x-dev-plan") || "").trim().toLowerCase() : "";
  const devUserId = allowDevHeaders ? String(request.headers.get("x-dev-user-id") || "").trim() : "";

  if (token) {
    const demo = parseDemoToken(token);
    if (demo) {
      const entitlements = buildEntitlements(demo.plan);
      return {
        mode: "demo-token",
        user: { id: demo.userId, plan: demo.plan, email: null },
        entitlements
      };
    }
  }

  if (devPlan && PLAN_PRESETS[devPlan]) {
    const entitlements = buildEntitlements(devPlan);
    return {
      mode: "dev-header",
      user: { id: devUserId || `u_${devPlan}`, plan: devPlan, email: null },
      entitlements
    };
  }

  // Anonymous free tier context for public endpoints.
  return {
    mode: "anonymous",
    user: null,
    entitlements: buildEntitlements("free")
  };
}

function parseDemoToken(token) {
  const normalized = String(token || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "demo_free") return { userId: "u_demo_free", plan: "free" };
  if (normalized === "demo_pro") return { userId: "u_demo_pro", plan: "pro" };
  if (normalized === "demo_premium") return { userId: "u_demo_premium", plan: "premium" };
  return null;
}

function buildEntitlements(planInput) {
  const plan = normalizePlan(planInput);
  const preset = PLAN_PRESETS[plan] || PLAN_PRESETS.free;
  return {
    plan,
    features: { ...preset.features },
    limits: { ...preset.limits }
  };
}

function normalizePlan(planInput) {
  const value = String(planInput || "").trim().toLowerCase();
  return PLAN_ORDER.includes(value) ? value : "free";
}

function requireAuthenticated(auth, request, env) {
  if (auth?.user) return;
  throwHttpError("unauthorized", "Authentication required.", 401, request, env);
}

function requireFeature(auth, featureKey, request, env) {
  if (auth?.entitlements?.features?.[featureKey]) return;
  throwHttpError(
    "feature_not_available",
    `Your plan does not include '${featureKey}'.`,
    403,
    request,
    env,
    { feature: featureKey, plan: auth?.entitlements?.plan || "free" }
  );
}

function validateReviewEvents(events) {
  const accepted = [];
  const rejected = [];

  events.forEach((event, index) => {
    if (!isObjectRecord(event)) {
      rejected.push({ index, reason: "event must be an object" });
      return;
    }
    const cardId = String(event.cardId ?? "").trim();
    const deckId = String(event.deckId ?? "").trim();
    const rating = Number(event.rating);
    if (!cardId) {
      rejected.push({ index, reason: "cardId is required" });
      return;
    }
    if (!deckId) {
      rejected.push({ index, reason: "deckId is required" });
      return;
    }
    if (!Number.isFinite(rating) || rating < 0 || rating > 4) {
      rejected.push({ index, reason: "rating must be a number between 0 and 4" });
      return;
    }
    accepted.push({
      deckId,
      cardId,
      rating,
      reviewedAt: String(event.reviewedAt || new Date().toISOString()),
      elapsedMs: Number.isFinite(Number(event.elapsedMs)) ? Number(event.elapsedMs) : 0
    });
  });

  return { accepted, rejected };
}

function buildOpenApiSkeleton(url) {
  const origin = `${url.protocol}//${url.host}`;
  return {
    openapi: "3.0.3",
    info: {
      title: "Mnemonicks API",
      version: API_VERSION,
      description: "Scaffold for auth, entitlements, deck import, review sync, and billing."
    },
    servers: [{ url: `${origin}${API_PREFIX}` }],
    paths: {
      "/health": { get: { summary: "Health probe" } },
      "/auth/session": { get: { summary: "Current session and entitlements" } },
      "/entitlements": { get: { summary: "Entitlement snapshot" } },
      "/decks": { get: { summary: "List visible decks" } },
      "/decks/import": { post: { summary: "Import deck (cloud, plan-gated)" } },
      "/reviews/events": { post: { summary: "Ingest review events" } },
      "/billing/portal": { post: { summary: "Open billing portal session" } },
      "/webhooks/stripe": { post: { summary: "Stripe webhook" } }
    }
  };
}

function sanitizeDeckName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  return raw.replace(/\s+/g, " ").slice(0, 120);
}

function normalizeDeckPath(value) {
  let path = String(value || "").trim();
  if (!path) return "";
  path = path.replace(/\\/g, "/");
  if (/^[a-z]+:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      path = url.pathname.replace(/^\/+/, "");
    } catch {}
  }
  if (!path.includes("/")) path = `decks/${path}`;
  if (!/\.json$/i.test(path)) path += ".json";
  return path;
}

function basename(path) {
  const parts = String(path || "").split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

function isObjectRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function readJsonBody(request, reqForError, env) {
  try {
    return await request.json();
  } catch {
    throwHttpError("invalid_json", "Request body must be valid JSON.", 400, reqForError, env);
  }
}

function handleOptions(request, env) {
  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(request, env)
  });
}

function apiOk(request, env, data, status = 200) {
  return jsonResponse({ ok: true, ...data }, status, buildCorsHeaders(request, env));
}

function apiError(code, message, status, request, env, extra = {}) {
  return jsonResponse({ ok: false, error: code, message, ...extra }, status, buildCorsHeaders(request, env));
}

function throwHttpError(code, message, status, request, env, extra = {}) {
  throw new HttpError(apiError(code, message, status, request, env, extra));
}

function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}

function buildCorsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  const configured = parseCsv(String(env?.API_CORS_ORIGINS || ""));
  const allowAll = configured.includes("*");

  let allowOrigin = "";
  if (!origin) allowOrigin = "*";
  else if (allowAll || configured.includes(origin)) allowOrigin = origin;

  const headers = {
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization, X-API-Key, X-Dev-User-Id, X-Dev-Plan",
    "access-control-max-age": "86400",
    "vary": "Origin"
  };
  if (allowOrigin) headers["access-control-allow-origin"] = allowOrigin;
  return headers;
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseBooleanEnv(value, fallback = false) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return !!fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return !!fallback;
}

function parsePositiveIntEnv(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(min, Math.min(max, n));
}

class HttpError extends Error {
  constructor(response) {
    super("HTTP error");
    this.response = response;
  }
}
