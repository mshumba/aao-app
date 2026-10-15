// OpenAI calls with hard timeouts. The key comes from the Supabase secret
// OPENAI_API_KEY (Edge Functions → Secrets); it is never logged or returned.

const BASE = "https://api.openai.com/v1";

/** Must match how the passages were embedded (see migration need_search). */
export const EMBEDDING_MODEL = "text-embedding-3-large";
export const EMBEDDING_DIMENSIONS = 768;

export class OpenAIError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

export type Usage = { input: number; output: number };

function apiKey(): string {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new OpenAIError("OPENAI_API_KEY is not set");
  return key;
}

type EmbeddingResponse = {
  data?: { index: number; embedding: number[] }[];
  usage?: { total_tokens?: number };
};

type ChatResponse = {
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = (error as Error)?.name;
    throw new OpenAIError(name === "TimeoutError" ? `timeout after ${timeoutMs} ms` : `network: ${name}`);
  }
  if (!response.ok) {
    // The error body names the problem (model, quota); it never echoes the key.
    let detail = "";
    try {
      const data = (await response.json()) as { error?: { code?: string; type?: string } };
      detail = String(data?.error?.code ?? data?.error?.type ?? "").slice(0, 80);
    } catch {
      // not JSON
    }
    throw new OpenAIError(`http ${response.status} ${detail}`.trim(), response.status);
  }
  return (await response.json()) as T;
}

/** Unit vectors for each input, in order. */
export async function embed(
  inputs: string[],
  timeoutMs = 4000,
): Promise<{ vectors: number[][]; tokens: number }> {
  const data = await post<EmbeddingResponse>(
    "/embeddings",
    { model: EMBEDDING_MODEL, input: inputs, dimensions: EMBEDDING_DIMENSIONS },
    timeoutMs,
  );
  const rows = data?.data ?? [];
  if (rows.length !== inputs.length) throw new OpenAIError("embedding count mismatch");
  const vectors = rows.sort((a, b) => a.index - b.index).map((r) => r.embedding);
  return { vectors, tokens: Number(data?.usage?.total_tokens ?? 0) };
}

/** pgvector text form, rounded (the column is half precision anyway). */
export function vectorLiteral(v: number[]): string {
  return `[${v.map((x) => (Math.abs(x) < 1e-7 ? "0" : x.toPrecision(6))).join(",")}]`;
}

/**
 * One chat completion whose answer must match `schema` (strict JSON schema).
 * Reasoning models (gpt-5 family, o-series) are asked for no/low reasoning so
 * the answer comes back quickly.
 */
export async function chatJson<T>(opts: {
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs: number;
}): Promise<{ data: T; usage: Usage }> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: opts.schemaName, strict: true, schema: opts.schema },
    },
    max_completion_tokens: opts.maxTokens,
  };
  if (/^gpt-5\.[1-9]/.test(opts.model)) body.reasoning_effort = "none";
  else if (/^(gpt-5|o\d)/.test(opts.model)) body.reasoning_effort = "minimal";
  const data = await post<ChatResponse>("/chat/completions", body, opts.timeoutMs);
  const choice = data?.choices?.[0];
  const usage: Usage = {
    input: Number(data?.usage?.prompt_tokens ?? 0),
    output: Number(data?.usage?.completion_tokens ?? 0),
  };
  if (choice?.message?.refusal) throw new OpenAIError("refused");
  if (choice?.finish_reason === "length") throw new OpenAIError("answer cut off");
  try {
    return { data: JSON.parse(choice?.message?.content ?? "") as T, usage };
  } catch {
    throw new OpenAIError("answer was not JSON");
  }
}
