const OpenAI = require("openai");
const crypto = require("crypto");
const { callAIPlatform } = require("../services/aiPlatform");

const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_OLLAMA_MODEL  = "llama3.1";
const DEFAULT_GROQ_MODEL    = "llama-3.1-8b-instant";
const DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_AI_TIMEOUT_MS = 60_000;

const responseCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

const breaker = {
  ai_platform: { failures: 0, openUntil: 0 },
  groq: { failures: 0, openUntil: 0 },
  openai: { failures: 0, openUntil: 0 },
  ollama: { failures: 0, openUntil: 0 },
};

function cacheKey(systemPrompt, userPrompt) {
  return crypto.createHash("sha256").update(`${systemPrompt}::${userPrompt}`).digest("hex");
}

function getCached(key) {
  const item = responseCache.get(key);
  if (!item) return null;
  if (item.expiresAt < Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return item.value;
}

function setCached(key, value) {
  responseCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function canTryProvider(name) {
  return Date.now() >= (breaker[name]?.openUntil || 0);
}

function markProviderSuccess(name) {
  if (!breaker[name]) return;
  breaker[name].failures = 0;
  breaker[name].openUntil = 0;
}

function markProviderFailure(name) {
  if (!breaker[name]) return;
  breaker[name].failures += 1;
  if (breaker[name].failures >= 3) {
    breaker[name].openUntil = Date.now() + 60_000;
  }
}

async function withTimeout(fn, timeoutMs, providerName) {
  const timeoutError = new Promise((_, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`${providerName} timed out after ${timeoutMs} ms.`);
      err.code = "TIMEOUT_ERROR";
      reject(err);
    }, timeoutMs);
    timeoutError._timer = timer;
  });

  try {
    return await Promise.race([fn(), timeoutError]);
  } finally {
    clearTimeout(timeoutError._timer);
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
  const key = cacheKey(systemPrompt, userPrompt);

  const tryProvider = async (name, fn) => {
    if (!canTryProvider(name)) {
      attempts.push({ provider: name, status: "circuit_open" });
      return null;
    }

    const start = Date.now();
    try {
      const data = await withTimeout(fn, timeoutMs, name);
      const latencyMs = Date.now() - start;
      markProviderSuccess(name);
      attempts.push({ provider: name, status: "ok", latencyMs });
      console.log(`[AI] provider=${name} status=success latency=${latencyMs}ms`);
      return { data, provider: name, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - start;
      markProviderFailure(name);
      attempts.push({
        provider: name,
        status: "failed",
        code: err.code || "UNKNOWN",
        reason: err.message,
        latencyMs,
      });
      console.error(`[AI] provider=${name} status=failed code=${err.code} latency=${latencyMs}ms msg=${err.message}`);
      return null;
    }
  };

  if (hasPlatformConfig) {
    const platformResult = await tryProvider("ai_platform", () =>
      callAIPlatformProvider(systemPrompt, userPrompt, opts)
    );
    if (platformResult) {
      setCached(key, platformResult.data);
      return {
        ...platformResult.data,
        _meta: {
          provider: platformResult.provider,
          latencyMs: platformResult.latencyMs,
          attempts,
          cacheHit: false,
        },
      };
    }
  }

  if (hasGroqConfig) {
    const groqResult = await tryProvider("groq", () => callGroq(systemPrompt, userPrompt));
    if (groqResult) {
      setCached(key, groqResult.data);
      return {
        ...groqResult.data,
        _meta: {
          provider: groqResult.provider,
          latencyMs: groqResult.latencyMs,
          attempts,
          cacheHit: false,
        },
      };
    }
  }

  if (configuredProvider === "openai") {
    const openaiResult = await tryProvider("openai", () => callOpenAI(systemPrompt, userPrompt));
    if (openaiResult) {
      setCached(key, openaiResult.data);
      return {
        ...openaiResult.data,
        _meta: {
          provider: openaiResult.provider,
          latencyMs: openaiResult.latencyMs,
          attempts,
          cacheHit: false,
        },
      };
    }
  }

  if (configuredProvider === "ollama") {
    const ollamaResult = await tryProvider("ollama", () => callOllama(systemPrompt, userPrompt, opts));
    if (ollamaResult) {
      setCached(key, ollamaResult.data);
      return {
        ...ollamaResult.data,
        _meta: {
          provider: ollamaResult.provider,
          latencyMs: ollamaResult.latencyMs,
          attempts,
          cacheHit: false,
        },
      };
    }
  }

  const cached = getCached(key);
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

  const hasTimeout = attempts.some((a) => a.code === "TIMEOUT_ERROR");
  const err = new Error(
    hasTimeout
      ? "AI service took too long. Try again."
      : "AI service is currently unavailable. Please retry shortly."
  );
  err.code = hasTimeout ? "TIMEOUT_ERROR" : "UPSTREAM_ERROR";
  err.details = attempts;
  throw err;
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
