import { execFileSync } from 'child_process';

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';

// Resolve DEEPSEEK_API_KEY from (in order):
//   1. process.env.DEEPSEEK_API_KEY
//   2. `rudi secrets get DEEPSEEK_API_KEY`
// Returns null if not found anywhere (caller decides whether to throw).
export function getDeepseekApiKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;

  try {
    const k = execFileSync('rudi', ['secrets', 'get', 'DEEPSEEK_API_KEY'], { encoding: 'utf8' }).trim();
    if (k && k.startsWith('sk-')) return k;
  } catch (_) {}

  return null;
}

// Throws if the key is missing — for callers that need it to be present.
export function requireDeepseekApiKey() {
  const k = getDeepseekApiKey();
  if (!k) {
    throw new Error(
      'DEEPSEEK_API_KEY not found. Set the env var or `rudi secrets set DEEPSEEK_API_KEY sk-...`.'
    );
  }
  return k;
}

// Call DeepSeek chat completions with a single user message.
// Returns the parsed message content (parsed as JSON when responseFormat is 'json_object').
//
// Throws on network/HTTP error. If parseJson is true (default for json_object)
// and the body isn't valid JSON, returns the raw string.
export async function callDeepseek({
  prompt,
  model = 'deepseek-chat',
  responseFormat = 'json_object',
  temperature = 0.4,
  maxTokens = 600,
  baseUrl = DEFAULT_BASE_URL,
  apiKey = null
}) {
  const key = apiKey || requireDeepseekApiKey();

  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_tokens: maxTokens
  };
  if (responseFormat) {
    body.response_format = { type: responseFormat };
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DeepSeek ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '';

  if (responseFormat === 'json_object') {
    try {
      return JSON.parse(content);
    } catch (_) {
      return content;
    }
  }

  return content;
}
