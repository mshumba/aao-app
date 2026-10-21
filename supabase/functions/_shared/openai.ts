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

/** POST to the API; a non-2xx status becomes an OpenAIError naming the problem. */
async function request(path: string, body: unknown, signal: AbortSignal, timeoutMs: number): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    throw fetchError(error, timeoutMs);
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
  return response;
}

function fetchError(error: unknown, timeoutMs: number): OpenAIError {
  const name = (error as Error)?.name;
  return new OpenAIError(name === "TimeoutError" ? `timeout after ${timeoutMs} ms` : `network: ${name}`);
}

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const signal = AbortSignal.timeout(timeoutMs);
  const response = await request(path, body, signal, timeoutMs);
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw fetchError(error, timeoutMs);
  }
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

/**
 * Runs `run`, and runs it a second time if the first hasn't answered after
 * `hedgeMs`, or at once if the first fails in a way `again` says is worth
 * another try. The first answer wins; it fails only when both tries fail (or
 * the first fails in a way not worth repeating). For cheap calls whose latency
 * has a long tail.
 */
export function hedged<T>(run: () => Promise<T>, hedgeMs: number, again: (error: unknown) => boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    let finished = false;
    let tries = 0;
    let running = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      finished = true;
      clearTimeout(timer);
    };
    const launch = () => {
      if (finished || tries === 2) return;
      tries++;
      running++;
      run().then(
        (value) => {
          if (finished) return;
          finish();
          resolve(value);
        },
        (error) => {
          running--;
          if (finished) return;
          if (tries < 2 && again(error)) {
            clearTimeout(timer);
            launch();
          } else if (running === 0) {
            finish();
            reject(error);
          }
        },
      );
    };
    launch();
    timer = setTimeout(launch, hedgeMs);
  });
}

/** A timeout, a network failure or a server error (not a refusal, a bad request or the quota). */
export const transientOpenAI = (error: unknown) =>
  error instanceof OpenAIError && (error.status === 0 || error.status >= 500);

/**
 * embed(), with a second request when the first is slow: embeddings usually
 * take 0.2-0.6 s, but now and then OpenAI takes several seconds or times out.
 */
export const embedHedged = (inputs: string[], timeoutMs = 4000, hedgeMs = 1000) =>
  hedged(() => embed(inputs, timeoutMs), hedgeMs, transientOpenAI);

/** pgvector text form, rounded (the column is half precision anyway). */
export function vectorLiteral(v: number[]): string {
  return `[${v.map((x) => (Math.abs(x) < 1e-7 ? "0" : x.toPrecision(6))).join(",")}]`;
}

type ChatChunk = {
  choices?: { delta?: { content?: string | null; refusal?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
};

/**
 * One chat completion whose answer must match `schema` (strict JSON schema).
 * Reasoning models (gpt-5 family, o-series) are asked for no/low reasoning so
 * the answer comes back quickly. With `onText`, the answer is streamed and
 * `onText` sees the text so far after each piece, so a caller can act on a
 * field as soon as it is complete (the schema's properties come out in order).
 */
export async function chatJson<T>(opts: {
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs: number;
  onText?: (soFar: string) => void;
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

  let content = "";
  let refusal = "";
  let finish: string | null | undefined;
  const usage: Usage = { input: 0, output: 0 };
  if (opts.onText) {
    body.stream = true;
    body.stream_options = { include_usage: true };
    const signal = AbortSignal.timeout(opts.timeoutMs);
    const response = await request("/chat/completions", body, signal, opts.timeoutMs);
    try {
      for await (const chunk of serverEvents<ChatChunk>(response)) {
        const choice = chunk.choices?.[0];
        if (choice?.delta?.refusal) refusal += choice.delta.refusal;
        if (choice?.finish_reason) finish = choice.finish_reason;
        if (chunk.usage) {
          usage.input = Number(chunk.usage.prompt_tokens ?? 0);
          usage.output = Number(chunk.usage.completion_tokens ?? 0);
        }
        if (choice?.delta?.content) {
          content += choice.delta.content;
          opts.onText(content);
        }
      }
    } catch (error) {
      if (error instanceof OpenAIError) throw error;
      throw fetchError(error, opts.timeoutMs);
    }
  } else {
    const data = await post<ChatResponse>("/chat/completions", body, opts.timeoutMs);
    const choice = data?.choices?.[0];
    content = choice?.message?.content ?? "";
    refusal = choice?.message?.refusal ?? "";
    finish = choice?.finish_reason;
    usage.input = Number(data?.usage?.prompt_tokens ?? 0);
    usage.output = Number(data?.usage?.completion_tokens ?? 0);
  }
  if (refusal) throw new OpenAIError("refused");
  if (finish === "length") throw new OpenAIError("answer cut off");
  try {
    return { data: JSON.parse(content) as T, usage };
  } catch {
    throw new OpenAIError("answer was not JSON");
  }
}

/** The JSON payloads of a server-sent event stream, up to `data: [DONE]`. */
async function* serverEvents<T>(response: Response): AsyncGenerator<T> {
  if (!response.body) throw new OpenAIError("empty stream");
  let buffer = "";
  for await (const text of response.body.pipeThrough(new TextDecoderStream())) {
    buffer += text;
    let end: number;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        yield JSON.parse(data) as T;
      } catch {
        throw new OpenAIError("stream was not JSON");
      }
    }
  }
}
