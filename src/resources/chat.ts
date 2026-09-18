import { parseSSEStream } from "../streaming";
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsBase,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionStreamParams,
  ChatSendParams,
  ChatSendResponse,
  ChatStreamEvent,
} from "../types";
import { performRequest, readJson, type FetchClientConfig } from "../utils";

export type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionStreamParams,
  ChatSendParams,
  ChatSendResponse,
  ChatStreamEvent,
} from "../types";

interface ChatResourceConfig {
  http: FetchClientConfig;
  defaultAssistantId?: string;
}

function buildBody(
  params: ChatCompletionCreateParamsBase,
  defaultAssistantId: string | undefined,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  const assistantId = params.assistantId ?? defaultAssistantId;
  const body: Record<string, unknown> = {
    // Only when the caller has one. The API key carries a scope of its own:
    // a key bound to an assistant answers for it unasked, and a key scoped to
    // the knowledge base refuses a request that names any assistant at all.
    // Sending the field unconditionally — and refusing to send the request
    // without it, as this used to — makes every knowledge-base key a 403.
    ...(assistantId ? { assistant_id: assistantId } : {}),
    messages: params.messages,
    ...extras,
  };
  if (params.model !== undefined) {
    body.model = params.model;
  }
  if (params.temperature !== undefined) {
    body.temperature = params.temperature;
  }
  if (params.max_tokens !== undefined) {
    body.max_tokens = params.max_tokens;
  }
  if (params.max_completion_tokens !== undefined) {
    body.max_completion_tokens = params.max_completion_tokens;
  }
  if (params.reasoning_effort !== undefined) {
    body.reasoning_effort = params.reasoning_effort;
  }
  return body;
}

/**
 * Normalize one `/v1/chat` SSE payload. The endpoint emits bare
 * `{ text }` and `{ reasoning }` objects; we tag them so callers can
 * tell the answer from the model's thinking without probing keys.
 */
function toStreamEvent(raw: {
  text?: unknown;
  reasoning?: unknown;
}): ChatStreamEvent | null {
  if (typeof raw.text === "string") {
    return { type: "text", text: raw.text };
  }
  if (typeof raw.reasoning === "string") {
    return { type: "reasoning", reasoning: raw.reasoning };
  }
  return null;
}

/** `chat.completions` resource — OpenAI-compatible chat completions over Ragen's RAG. */
export class ChatCompletions {
  constructor(private readonly config: ChatResourceConfig) {}

  /**
   * Create a chat completion.
   *
   * Overload: `stream: true` returns an `AsyncIterable<ChatCompletionChunk>`,
   * otherwise returns a `ChatCompletion`.
   */
  create(
    params: ChatCompletionCreateParamsNonStreaming,
    options?: { signal?: AbortSignal },
  ): Promise<ChatCompletion>;
  create(
    params: ChatCompletionCreateParamsStreaming,
    options?: { signal?: AbortSignal },
  ): Promise<AsyncIterable<ChatCompletionChunk>>;
  async create(
    params: ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming,
    options?: { signal?: AbortSignal },
  ): Promise<ChatCompletion | AsyncIterable<ChatCompletionChunk>> {
    if (params.stream === true) {
      return this.streamInternal(params, options);
    }
    const body = buildBody(params, this.config.defaultAssistantId, { stream: false });
    const response = await performRequest(this.config.http, {
      method: "POST",
      path: "/chat/completions",
      body,
      signal: options?.signal,
    });
    return readJson<ChatCompletion>(response);
  }

  /**
   * Open a streaming chat completion. Always returns an
   * `AsyncIterable<ChatCompletionChunk>`.
   */
  stream(
    params: ChatCompletionStreamParams,
    options?: { signal?: AbortSignal },
  ): AsyncIterable<ChatCompletionChunk> {
    const streamParams: ChatCompletionCreateParamsStreaming = {
      ...params,
      stream: true,
    };
    const open = (): Promise<AsyncIterable<ChatCompletionChunk>> =>
      this.streamInternal(streamParams, options);

    async function* generate(): AsyncGenerator<ChatCompletionChunk, void, void> {
      const iterable = await open();
      for await (const chunk of iterable) {
        yield chunk;
      }
    }

    return { [Symbol.asyncIterator]: () => generate() };
  }

  /**
   * Convenience: consume a streaming completion and return the concatenated
   * assistant content as a single string.
   */
  async streamToString(
    params: ChatCompletionStreamParams,
    options?: { signal?: AbortSignal },
  ): Promise<string> {
    const iter = this.stream(params, options);
    let out = "";
    for await (const chunk of iter) {
      const piece = chunk.choices[0]?.delta?.content;
      if (piece) {
        out += piece;
      }
    }
    return out;
  }

  private async streamInternal(
    params: ChatCompletionCreateParamsStreaming,
    options?: { signal?: AbortSignal },
  ): Promise<AsyncIterable<ChatCompletionChunk>> {
    const extras: Record<string, unknown> = { stream: true };
    if (params.stream_options) {
      extras.stream_options = params.stream_options;
    }
    const body = buildBody(params, this.config.defaultAssistantId, extras);
    const response = await performRequest(this.config.http, {
      method: "POST",
      path: "/chat/completions",
      body,
      raw: true,
      signal: options?.signal,
    });
    return parseSSEStream(response);
  }
}

/**
 * `chat` resource. Two endpoints live here:
 *
 *  - `chat.completions.*` — OpenAI-compatible `/v1/chat/completions`.
 *    Use this for anything new.
 *  - `chat.send*` — Ragen's own `/v1/chat`. Kept because `context` and
 *    separated reasoning deltas have no OpenAI-compatible equivalent.
 */
export class Chat {
  readonly completions: ChatCompletions;

  constructor(private readonly config: ChatResourceConfig) {
    this.completions = new ChatCompletions(config);
  }

  private buildChatBody(
    params: ChatSendParams,
    stream: boolean,
  ): Record<string, unknown> {
    const assistantId = params.assistantId ?? this.config.defaultAssistantId;
    const body: Record<string, unknown> = {
      // Optional — see `buildBody`.
      ...(assistantId ? { assistant_id: assistantId } : {}),
      content: params.content,
      stream,
    };
    if (params.context !== undefined) {
      body.context = params.context;
    }
    if (params.reasoning_effort !== undefined) {
      body.reasoning_effort = params.reasoning_effort;
    }
    return body;
  }

  /**
   * Send one message to `POST /v1/chat` and get the whole answer back.
   *
   * @example
   * ```ts
   * const { text } = await ragen.chat.send({
   *   content: "What is our refund policy?",
   *   context: document.body.innerText,
   * });
   * ```
   */
  async send(
    params: ChatSendParams,
    options?: { signal?: AbortSignal },
  ): Promise<ChatSendResponse> {
    const response = await performRequest(this.config.http, {
      method: "POST",
      path: "/chat",
      body: this.buildChatBody(params, false),
      signal: options?.signal,
    });
    return readJson<ChatSendResponse>(response);
  }

  /**
   * Stream a `POST /v1/chat` response as tagged events.
   *
   * Reasoning deltas arrive interleaved with answer text on the same
   * stream, so switch on `event.type` rather than concatenating
   * everything — otherwise the model's thinking lands in your answer.
   *
   * @example
   * ```ts
   * for await (const event of ragen.chat.sendStream({ content: "Why?" })) {
   *   if (event.type === "text") process.stdout.write(event.text);
   * }
   * ```
   */
  sendStream(
    params: ChatSendParams,
    options?: { signal?: AbortSignal },
  ): AsyncIterable<ChatStreamEvent> {
    const open = async (): Promise<
      AsyncIterable<{ text?: unknown; reasoning?: unknown }>
    > => {
      const response = await performRequest(this.config.http, {
        method: "POST",
        path: "/chat",
        body: this.buildChatBody(params, true),
        raw: true,
        signal: options?.signal,
      });
      return parseSSEStream<{ text?: unknown; reasoning?: unknown }>(response);
    };

    async function* generate(): AsyncGenerator<ChatStreamEvent, void, void> {
      for await (const raw of await open()) {
        const event = toStreamEvent(raw);
        if (event) {
          yield event;
        }
      }
    }

    return { [Symbol.asyncIterator]: () => generate() };
  }

  /**
   * Convenience: stream a `/v1/chat` reply and return only the answer
   * text, concatenated. Reasoning events are dropped.
   */
  async sendToString(
    params: ChatSendParams,
    options?: { signal?: AbortSignal },
  ): Promise<string> {
    let out = "";
    for await (const event of this.sendStream(params, options)) {
      if (event.type === "text") {
        out += event.text;
      }
    }
    return out;
  }
}
