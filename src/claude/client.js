const OpenAI = require("openai");
const crypto = require("crypto");
const { callAIPlatform } = require("../services/aiPlatform");
const cache = require("../cache/cache");

const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_OLLAMA_MODEL  = "llama3.1";
const DEFAULT_GROQ_MODEL    = "llama-3.1-8b-instant";
const DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_AI_TIMEOUT_MS = 60_000;

const CACHE_TTL_MS = 10 * 60 * 1000;
const BREAKER_TTL_MS = 5 * 60 * 1000;
const BREAKER_OPEN_MS = 60 * 1000;

const breaker = {
  ai_platform: { failures: 0, openUntil: 0 },
  groq: { failures: 0, openUntil: 0 },
  openai: { failures: 0, openUntil: 0 },
  ollama: { failures: 0, openUntil: 0 },
};

function cacheKey(systemPrompt, userPrompt) {
  return crypto.createHash("sha256").update(`${systemPrompt}::${userPrompt}`).digest("hex");
}

function breakerKey(name) {
  return `ai:breaker:${name}`;
}

async function getCached(key) {
  return cache.get(`ai:response:${key}`);
}

async function setCached(key, value) {
  await cache.set(`ai:response:${key}`, value, CACHE_TTL_MS);
}

async function getBreakerState(name) {
  if (!breaker[name]) return { failures: 0, openUntil: 0 };
  const cachedState = await cache.get(breakerKey(name));
  if (cachedState) {
    breaker[name] = cachedState;
    return cachedState;
  }
  return breaker[name];
}

async function saveBreakerState(name, nextState) {
  if (!breaker[name]) return;
  breaker[name] = nextState;
  await cache.set(breakerKey(name), nextState, BREAKER_TTL_MS);
}

async function canTryProvider(name) {
  const state = await getBreakerState(name);
  return Date.now() >= (state.openUntil || 0);
}

async function markProviderSuccess(name) {
  if (!breaker[name]) return;
  await saveBreakerState(name, { failures: 0, openUntil: 0 });
}

async function markProviderFailure(name) {
  if (!breaker[name]) return;
  const currentState = await getBreakerState(name);
  const nextFailures = (currentState.failures || 0) + 1;
  await saveBreakerState(name, {
    failures: nextFailures,
    openUntil: nextFailures >= 3 ? Date.now() + BREAKER_OPEN_MS : 0,
  });
}

function withTimeout(fn, timeoutMs, providerName) {
  let timer = null;
  const timeoutError = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${providerName} timed out after ${timeoutMs} ms.`);
      err.code = "TIMEOUT_ERROR";
      reject(err);
    }, timeoutMs);
  });

  return Promise.race([fn(), timeoutError]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

function sanitizePromptSegment(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/ignore\s+previous\s+instructions/gi, "[redacted]")
    .replace(/system\s+prompt/gi, "prompt context")
    .replace(/developer\s+message/gi, "trusted message")
    .trim();
}

function sanitizePrompt(systemPrompt, userPrompt) {
  return {
    systemPrompt: sanitizePromptSegment(systemPrompt),
    userPrompt: sanitizePromptSegment(userPrompt),
  };
}

function buildAttemptsError(attempts) {
  const hasTimeout = attempts.some((a) => a.code === "TIMEOUT_ERROR");
  const err = new Error(
    hasTimeout
      ? "AI service took too long. Try again."
      : "AI service is currently unavailable. Please retry shortly."
  );
  err.code = hasTimeout ? "TIMEOUT_ERROR" : "UPSTREAM_ERROR";
  err.details = attempts;
  return err;
}

async function tryProviderCall({ name, fn, timeoutMs, attempts }) {
  if (!(await canTryProvider(name))) {
    attempts.push({ provider: name, status: "circuit_open" });
    return null;
  }

  try {
    const start = Date.now();
    const data = await withTimeout(fn, timeoutMs, name);
    const latencyMs = Date.now() - start;
    await markProviderSuccess(name);
    attempts.push({ provider: name, status: "ok", latencyMs });
    console.log(`[AI] provider=${name} status=success latency=${latencyMs}ms`);
    return { data, provider: name, latencyMs };
  } catch (err) {
    const latencyMs = err.latencyMs || 0;
    await markProviderFailure(name);
    attempts.push({
      provider: name,
      status: "failed",
      code: err.code || "UNKNOWN",
      reason: err.message,
      latencyMs,
    });
    console.error(`[AI] provider=${name} status=failed code=${err.code} msg=${err.message}`);
    return null;
  }
}

function extractJson(rawText) {
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonString = jsonMatch ? jsonMatch[1].trim() : rawText.trim();
  return JSON.parse(jsonString);
}

// ── OpenAI ───────────────────────────────────────────────────────────────────

async function callOpenAI(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || apiKey === "your_openai_api_key_here") {
    const err = new Error("OPENAI_API_KEY is missing or still using placeholder value.");
    err.code = "CONFIG_ERROR";
    throw err;
  }

  const model  = process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt   },
    ],
    max_tokens: 4096,
  });

  const rawText = completion.choices?.[0]?.message?.content?.trim();
  if (!rawText) {
    const err = new Error("OpenAI returned an empty response.");
    err.code = "UPSTREAM_ERROR";
    throw err;
  }

  return extractJson(rawText);
}

// ── Groq (OpenAI-compatible) ─────────────────────────────────────────────────

async function callGroq(systemPrompt, userPrompt) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    const err = new Error("GROQ_API_KEY is not configured in environment.");
    err.code = "CONFIG_ERROR";
    throw err;
  }

  const model   = process.env.GROQ_MODEL?.trim()    || DEFAULT_GROQ_MODEL;
  const baseURL = process.env.GROQ_BASE_URL?.trim() || DEFAULT_GROQ_BASE_URL;

  console.log(`[Groq] calling model=${model} base=${baseURL}`);

  const groq = new OpenAI({ apiKey, baseURL });

  let completion;
  try {
    completion = await groq.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt   },
      ],
      max_tokens: 4096,
    });
  } catch (apiErr) {
    console.error(`[Groq] API error — ${apiErr.message}`);
    const err = new Error(`Groq request failed: ${apiErr.message}`);
    err.code = "UPSTREAM_ERROR";
    throw err;
  }

  const rawText = completion.choices?.[0]?.message?.content?.trim();
  if (!rawText) {
    const err = new Error("Groq returned an empty response.");
    err.code = "UPSTREAM_ERROR";
    throw err;
  }

  try {
    return extractJson(rawText);
  } catch (parseErr) {
    const err = new Error(`Groq JSON parse failed: ${parseErr.message}`);
    err.code = "PARSE_ERROR";
    err.rawResponse = rawText;
    throw err;
  }
}

async function callAIPlatformProvider(systemPrompt, userPrompt, opts = {}) {
  const feature = opts.feature || "content_generation";
  const prompt = opts.promptKey || "content.generate.v1";
  const input = opts.input || { systemPrompt, userPrompt };

  const result = await callAIPlatform({
    feature,
    prompt,
    input,
    model: opts.model,
    userId: opts.userId,
  });

  return result.data;
}

// ── Ollama (local only) ──────────────────────────────────────────────────────

// opts.model      — overrides OLLAMA_MODEL env (e.g. "phi3:mini")
// opts.rawBypass  — if true, skip JSON parsing and return { _raw: "<text>" }
async function callOllama(systemPrompt, userPrompt, { model: modelOverride, rawBypass = false } = {}) {
  const baseUrl = process.env.OLLAMA_BASE_URL?.trim();
  if (!baseUrl) {
    const err = new Error("OLLAMA_BASE_URL is not configured in environment.");
    err.code = "CONFIG_ERROR";
    throw err;
  }
  const model  = modelOverride || process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
  const prompt = `${systemPrompt}\n\n${userPrompt}`;

  const t0 = Date.now();
  console.log(`[Ollama] START  model=${model}  base=${baseUrl}  rawBypass=${rawBypass}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000); // 5 min

  let response;
  try {
    console.log(`[Ollama] calling ${baseUrl}/api/generate …`);
    response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ model, prompt, stream: false, format: "json" }),
    });
    console.log(`[Ollama] HTTP ${response.status} received after ${Date.now() - t0} ms`);
  } catch (fetchErr) {
    console.error(`[Ollama] fetch ERROR after ${Date.now() - t0} ms — ${fetchErr.message}`);
    if (fetchErr.name === "AbortError") {
      const err = new Error("Ollama fetch timed out after 5 minutes.");
      err.code = "TIMEOUT_ERROR";
      throw err;
    }
    const err = new Error(`Ollama unreachable: ${fetchErr.message}`);
    err.code = "UPSTREAM_ERROR";
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    const err  = new Error(`Ollama request failed (${response.status}): ${body || "No body"}`);
    err.code   = "UPSTREAM_ERROR";
    throw err;
  }

  console.log(`[Ollama] reading payload …`);
  const payload = await response.json();
  console.log(`[Ollama] payload ready after ${Date.now() - t0} ms  eval_duration=${payload.eval_duration ?? "n/a"}`);

  if (!payload?.response || typeof payload.response !== "string") {
    const err = new Error("Ollama response missing expected `response` text.");
    err.code  = "UPSTREAM_ERROR";
    throw err;
  }

  if (rawBypass) {
    console.log(`[Ollama] rawBypass=true — returning raw text, skipping JSON parse`);
    return { _raw: payload.response };
  }

  console.log(`[Ollama] parsing JSON response …`);
  try {
    const parsed = extractJson(payload.response);
    console.log(`[Ollama] parse OK — total ${Date.now() - t0} ms`);
    return parsed;
  } catch (parseErr) {
    console.error(`[Ollama] PARSE FAILED after ${Date.now() - t0} ms — ${parseErr.message}`);
    console.error(`[Ollama] raw response (first 500 chars): ${payload.response.slice(0, 500)}`);
    const err = new Error(`Ollama JSON parse failed: ${parseErr.message}`);
    err.code      = "PARSE_ERROR";
    err.rawResponse = payload.response;
    throw err;
  }
}

// ── Router ───────────────────────────────────────────────────────────────────

// opts forwarded from route: { model, rawBypass }
async function callLLM(systemPrompt, userPrompt, opts = {}) {
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || DEFAULT_AI_TIMEOUT_MS);
  const configuredProvider = (process.env.AI_PROVIDER || "groq").trim().toLowerCase();
  const hasPlatformConfig = Boolean(process.env.AI_PLATFORM_URL?.trim() && process.env.AI_PLATFORM_API_KEY?.trim());
  const hasGroqConfig = Boolean(process.env.GROQ_API_KEY?.trim());
  const attempts = [];
  const sanitizedPrompt = sanitizePrompt(systemPrompt, userPrompt);
  const key = cacheKey(sanitizedPrompt.systemPrompt, sanitizedPrompt.userPrompt);

  const providerCalls = [];

  if (hasPlatformConfig) {
    providerCalls.push(() => tryProviderCall({
      name: "ai_platform",
      timeoutMs,
      attempts,
      fn: () => callAIPlatformProvider(sanitizedPrompt.systemPrompt, sanitizedPrompt.userPrompt, opts),
    }));
  }

  if (hasGroqConfig) {
    providerCalls.push(() => tryProviderCall({
      name: "groq",
      timeoutMs,
      attempts,
      fn: () => callGroq(sanitizedPrompt.systemPrompt, sanitizedPrompt.userPrompt),
    }));
  }

  if (configuredProvider === "openai") {
    providerCalls.push(() => tryProviderCall({
      name: "openai",
      timeoutMs,
      attempts,
      fn: () => callOpenAI(sanitizedPrompt.systemPrompt, sanitizedPrompt.userPrompt),
    }));
  }

  if (configuredProvider === "ollama") {
    providerCalls.push(() => tryProviderCall({
      name: "ollama",
      timeoutMs,
      attempts,
      fn: () => callOllama(sanitizedPrompt.systemPrompt, sanitizedPrompt.userPrompt, opts),
    }));
  }

  for (const providerCall of providerCalls) {
    const providerResult = await providerCall();
    if (!providerResult) {
      continue;
    }

    await setCached(key, providerResult.data);
    return {
      ...providerResult.data,
      _meta: {
        provider: providerResult.provider,
        latencyMs: providerResult.latencyMs,
        attempts,
        cacheHit: false,
      },
    };
  }

  const cached = await getCached(key);
  if (cached) {
    console.warn("[AI] using cached response after provider failures");
    return {
      ...cached,
      _meta: {
        provider: "cache",
        latencyMs: 0,
        attempts,
        cacheHit: true,
      },
    };
  }

  throw buildAttemptsError(attempts);
}

// ── Config inspector (used by /api/debug/ai-config) ──────────────────────────

function getAIConfig() {
  const provider = (process.env.AI_PROVIDER || "ollama").trim().toLowerCase();
  return {
    provider,
    groq: {
      api_key_set: !!process.env.GROQ_API_KEY?.trim(),
      model:       process.env.GROQ_MODEL?.trim()    || DEFAULT_GROQ_MODEL,
      base_url:    process.env.GROQ_BASE_URL?.trim() || DEFAULT_GROQ_BASE_URL,
    },
    openai: {
      api_key_set: !!(process.env.OPENAI_API_KEY?.trim() &&
                      process.env.OPENAI_API_KEY !== "your_openai_api_key_here"),
      model:       process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
    },
    ollama: {
      base_url:  process.env.OLLAMA_BASE_URL?.trim() || "(not set)",
      model:     process.env.OLLAMA_MODEL?.trim()    || DEFAULT_OLLAMA_MODEL,
    },
    ai_platform: {
      url_set:     !!process.env.AI_PLATFORM_URL?.trim(),
      api_key_set: !!process.env.AI_PLATFORM_API_KEY?.trim(),
    },
    reliability: {
      timeout_ms: Number(process.env.AI_TIMEOUT_MS || DEFAULT_AI_TIMEOUT_MS),
      cache_ttl_ms: CACHE_TTL_MS,
      circuit_breakers: breaker,
    },
  };
}

module.exports = { callLLM, getAIConfig };
