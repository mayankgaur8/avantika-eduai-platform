const OpenAI = require("openai");

const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_OLLAMA_MODEL  = "llama3.1";
const DEFAULT_GROQ_MODEL    = "llama-3.1-8b-instant";
const DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1";

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
  const provider = (process.env.AI_PROVIDER || "ollama").trim().toLowerCase();

  if (provider === "ollama")  return callOllama(systemPrompt, userPrompt, opts);
  if (provider === "openai")  return callOpenAI(systemPrompt, userPrompt);
  if (provider === "groq")    return callGroq(systemPrompt, userPrompt);

  const err = new Error(
    `AI_PROVIDER="${provider}" is not supported. Must be one of: groq, openai, ollama.`
  );
  err.code = "CONFIG_ERROR";
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
  };
}

module.exports = { callLLM, getAIConfig };
