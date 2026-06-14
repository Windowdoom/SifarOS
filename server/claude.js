// claude.js — thin client for the Claude API (the reasoning model).
//
// The Navigator works WITHOUT an API key: every lifecycle feature has a
// deterministic path (the screener, the rules-driven walkthrough, glossary
// fallbacks). The model, when available, adds natural-language understanding for
// Discovery and plain-language explanation. This file isolates that dependency.

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export function getModel() {
  return process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
}

export function isAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Call the Claude Messages API.
 * @returns {Promise<string>} the concatenated text of the response
 * @throws on missing key, network error, timeout, or non-2xx response
 */
export async function callMessages({ system, messages, maxTokens = 1024, temperature = 0.2, timeoutMs = 25000 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: getModel(),
        max_tokens: maxTokens,
        temperature,
        system,
        messages,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Claude API ${res.status}: ${body.slice(0, 500)}`);
    }
    const data = await res.json();
    return (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  } finally {
    clearTimeout(timer);
  }
}

/** Ask the model for a JSON object. Strips code fences and parses. Throws on bad JSON. */
export async function callJson(opts) {
  const text = await callMessages(opts);
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  // Be forgiving: grab the outermost JSON object if there's extra prose.
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice);
}
