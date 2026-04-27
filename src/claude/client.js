const OpenAI = require("openai");

const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_OLLAMA_MODEL = "llama3.1";

function extractJson(rawText) {
  // Extract JSON block if model wraps it in markdown code fences
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonString = jsonMatch ? jsonMatch[1].trim() : rawText.trim();
  return JSON.parse(jsonString);
}

async function callOpenAI(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || apiKey === "your_openai_api_key_here") {
    const err = new Error("OPENAI_API_KEY is missing or still using placeholder value.");
    err.code = "CONFIG_ERROR";
    throw err;
  }

  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
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

// opts.model      — overrides OLLAMA_MODEL env (e.g. "phi3:mini")
// opts.rawBypass  — if true, skip JSON parsing and return { _raw: "<text>" }
async function callOllama(systemPrompt, userPrompt, { model: modelOverride, rawBypass = false } = {}) {
  const baseUrl = process.env.OLLAMA_BASE_URL?.trim();
  if (!baseUrl) {
    const err = new Error("OLLAMA_BASE_URL is not configured in environment.");
    err.code = "CONFIG_ERROR";
    throw err;
  }
  const model = modelOverride || process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
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
    const err = new Error(`Ollama request failed (${response.status}): ${body || "No body"}`);
    err.code = "UPSTREAM_ERROR";
    throw err;
  }

  console.log(`[Ollama] reading payload …`);
  const payload = await response.json();
  console.log(`[Ollama] payload ready after ${Date.now() - t0} ms  eval_duration=${payload.eval_duration ?? "n/a"}`);

  if (!payload?.response || typeof payload.response !== "string") {
    const err = new Error("Ollama response missing expected `response` text.");
    err.code = "UPSTREAM_ERROR";
    throw err;
  }

  // ── rawBypass: skip JSON parsing, return text directly for debugging ───────
  if (rawBypass) {
    console.log(`[Ollama] rawBypass=true — returning raw text, skipping JSON parse`);
    return { _raw: payload.response };
  }

  // ── Normal path: parse JSON ───────────────────────────────────────────────
  console.log(`[Ollama] parsing JSON response …`);
  try {
    const parsed = extractJson(payload.response);
    console.log(`[Ollama] parse OK — total ${Date.now() - t0} ms`);
    return parsed;
  } catch (parseErr) {
    console.error(`[Ollama] PARSE FAILED after ${Date.now() - t0} ms — ${parseErr.message}`);
    console.error(`[Ollama] raw response (first 500 chars): ${payload.response.slice(0, 500)}`);
    // Fail fast: throw immediately instead of hanging until an outer timeout fires.
    const err = new Error(`Ollama JSON parse failed: ${parseErr.message}`);
    err.code = "PARSE_ERROR";
    err.rawResponse = payload.response;
    throw err;
  }
}

// opts forwarded from route: { model, rawBypass }
async function callLLM(systemPrompt, userPrompt, opts = {}) {
  const provider = (process.env.AI_PROVIDER || "ollama").trim().toLowerCase();

  if (provider === "ollama") {
    return callOllama(systemPrompt, userPrompt, opts);
  }

  if (provider !== "openai") {
    const err = new Error("AI_PROVIDER must be either `openai` or `ollama`.");
    err.code = "CONFIG_ERROR";
    throw err;
  }

  return callOpenAI(systemPrompt, userPrompt);
}

module.exports = { callLLM };
