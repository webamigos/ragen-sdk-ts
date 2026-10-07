/**
 * Shared types used across the SDK. Mirrors Ragen.ai's OpenAI-compatible
 * wire format, with Ragen-specific fields (e.g. `assistant_id`) lifted into
 * first-class citizens.
 */

export type ChatCompletionRole = "system" | "user" | "assistant";

export interface ChatCompletionMessageParam {
  role: ChatCompletionRole;
  content: string;
  /**
   * OpenAI's optional author name. Needs an API that whitelists it —
   * deployments older than the chat-completion param fix reject the
   * whole request with a 400 rather than ignoring the field.
   */
  name?: string;
}

export interface ChatCompletionMessage {
  role: "assistant";
  content: string;
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatCompletionMessage;
  finish_reason: "stop" | "length" | "content_filter" | "tool_calls" | null;
  logprobs: unknown | null;
}

/**
 * A document an answer was drawn from, as the API returns it when asked
 * (`sources` on `chat.send*`, `ragen_sources` on `chat.completions.*`).
 */
export interface ChatSource {
  fileId: string;
  /** `null` for documents ingested before file names were stored. */
  fileName: string | null;
  /** `1` is the most relevant. */
  rank: number;
  /**
   * Present when the file is a published Ragen Brain page: its title and the
   * documents it was built from that the API key may open. A key that can
   * read the page but not all of its documents gets a shorter list, never the
   * names of documents it cannot open.
   */
  brain?: {
    pageTitle: string;
    sources: { fileName: string; span: string }[];
  };
}

export interface ChatCompletion {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: ChatCompletionUsage;
  /** Only when the request set `ragen_sources: true`. */
  ragen_sources?: ChatSource[];
}

export interface ChatCompletionChunkDelta {
  role?: ChatCompletionRole;
  content?: string;
}

export interface ChatCompletionChunkChoice {
  index: number;
  delta: ChatCompletionChunkDelta;
  finish_reason: "stop" | "length" | "content_filter" | "tool_calls" | null;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
  usage?: ChatCompletionUsage;
  /**
   * Only when the request set `ragen_sources: true`: one trailing chunk with
   * `choices: []`, after the usage chunk and before the stream ends.
   */
  ragen_sources?: ChatSource[];
}

export interface ChatCompletionStreamOptions {
  include_usage?: boolean;
}

export type ReasoningEffort = "low" | "medium" | "high";

export interface ChatCompletionCreateParamsBase {
  /**
   * Optional. The API key carries a scope of its own: a key created for one
   * assistant answers for it whether or not you send this, and a key scoped
   * to the knowledge base rejects a request that names any assistant with
   * `403`. Set it only when the key is not already bound to the assistant you
   * want — and only to one the key may reach.
   */
  assistantId?: string;
  messages: ChatCompletionMessageParam[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  /** OpenAI's newer name for `max_tokens`. `max_tokens` wins if both are set. */
  max_completion_tokens?: number;
  /**
   * Forwarded to the model. Only reasoning-capable models act on it;
   * those default to `"medium"` server-side when this is omitted.
   */
  reasoning_effort?: ReasoningEffort;
  /**
   * Ask for the documents the answer was drawn from. The response then
   * carries `ragen_sources` (a trailing `choices: []` chunk when streaming).
   * Off by default; a Ragen extension, so it is namespaced.
   */
  ragen_sources?: boolean;
}

export interface ChatCompletionCreateParamsNonStreaming extends ChatCompletionCreateParamsBase {
  stream?: false;
}

export interface ChatCompletionCreateParamsStreaming extends ChatCompletionCreateParamsBase {
  stream: true;
  stream_options?: ChatCompletionStreamOptions;
}

export type ChatCompletionCreateParams =
  ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming;

export interface ChatCompletionStreamParams extends ChatCompletionCreateParamsBase {
  stream_options?: ChatCompletionStreamOptions;
}

// --- Files -----------------------------------------------------------------

export type FileStatus = "uploaded" | "processed" | "error";

export interface FileObject {
  id: string;
  object: "file";
  bytes: number;
  created_at: number;
  filename: string;
  purpose: string;
  status: FileStatus;
  status_details: string | null;
}

export type FilePurpose = "knowledge_base" | "assistants";

export interface FileListParams {
  limit?: number;
  after?: string;
  /** The API validates this against a fixed set and 400s on anything else. */
  purpose?: FilePurpose;
}

export interface FileListResponse {
  object: "list";
  data: FileObject[];
}

export interface FileUploadParams {
  filename?: string;
  purpose?: FilePurpose;
}

export interface FileDeletedResponse {
  id: string;
  object: "file";
  deleted: true;
}

export interface WaitUntilProcessedOptions {
  /** Maximum total wait, ms. Default 300_000 (5 minutes). */
  timeout?: number;
  /** Initial poll interval, ms. Default 1_000. */
  pollInterval?: number;
  /** Maximum poll interval, ms. Default 10_000. */
  maxPollInterval?: number;
}

// --- Assistants ------------------------------------------------------------

export interface Assistant {
  id: string;
  object: "assistant";
  created_at: number;
  name: string;
  description: string | null;
  model: string;
  instructions: string | null;
  tools: Array<{ type: "file_search" }>;
  tool_resources: Record<string, never>;
  metadata: Record<string, never>;
  temperature: number;
  top_p: number;
  response_format: "auto";
}

/**
 * Fields the API accepts but does not persist yet — it echoes constants
 * back on read. Declared so an OpenAI-shaped payload validates.
 */
interface AssistantWriteExtras {
  description?: string;
  model?: string;
  temperature?: number;
  metadata?: Record<string, unknown>;
  top_p?: number;
}

export interface AssistantCreateParams extends AssistantWriteExtras {
  name: string;
  instructions?: string;
}

export interface AssistantUpdateParams extends AssistantWriteExtras {
  name?: string;
  instructions?: string;
}

export interface AssistantListParams {
  /** 1–100. The API defaults to 20, so omitting this caps the page at 20. */
  limit?: number;
  order?: "asc" | "desc";
  after?: string;
  before?: string;
}

export interface AssistantListResponse {
  object: "list";
  data: Assistant[];
}

export interface AssistantDeletedResponse {
  id: string;
  object: "assistant.deleted";
  deleted: true;
}

// --- Error envelope --------------------------------------------------------

export interface APIErrorBody {
  error: {
    message: string;
    type: string;
    code: string | null;
    param: string | null;
  };
}

// --- Native chat (`POST /v1/chat`) -----------------------------------------

/**
 * Ragen's own chat endpoint, which predates the OpenAI-compatible one.
 * It stays in the SDK because two of its inputs have no equivalent on
 * `/v1/chat/completions`: `context` and, in the stream, reasoning
 * deltas separated from the answer.
 */
export interface ChatSendParams {
  /**
   * Optional. The API key carries a scope of its own: a key created for one
   * assistant answers for it whether or not you send this, and a key scoped
   * to the knowledge base rejects a request that names any assistant with
   * `403`. Set it only when the key is not already bound to the assistant you
   * want — and only to one the key may reach.
   */
  assistantId?: string;
  /** The user's message. 1–10,000 characters. */
  content: string;
  /**
   * Extra page or document context, up to 20,000 characters. Appended
   * to the question server-side — meant for embedded chatbots passing
   * the page they're on. No equivalent on `/v1/chat/completions`.
   */
  context?: string;
  reasoning_effort?: ReasoningEffort;
  /**
   * Ask for the documents the answer was drawn from. `send` then returns
   * `sources`; `sendStream` yields one `sources` event before it ends.
   */
  sources?: boolean;
}

export interface ChatSendResponse {
  text: string;
  /** Only when the request set `sources: true`. */
  sources?: ChatSource[];
}

/**
 * One event from `sendStream()`. The endpoint interleaves answer text
 * with the model's intermediate reasoning on a single stream; the
 * discriminant keeps callers from concatenating the two into one blob.
 */
export type ChatStreamEvent =
  | { type: "text"; text: string }
  | { type: "reasoning"; reasoning: string }
  /** One event near the end, only when the request set `sources: true`. */
  | { type: "sources"; sources: ChatSource[] };

// --- Threads ---------------------------------------------------------------

/**
 * A thread as `GET /v1/threads` returns it: the OpenAI `thread` shape
 * plus Ragen's `title` and `assistant_id`.
 */
export interface Thread {
  id: string;
  object: "thread";
  created_at: number;
  tool_resources: Record<string, never>;
  metadata: Record<string, never>;
  /** Ragen extension — the title shown in the dashboard sidebar. */
  title: string | null;
  /** Ragen extension — `asst-<projectId>` the thread is bound to. */
  assistant_id: string | null;
}

export interface ThreadListParams {
  /** 1–100. The API defaults to 20, so omitting this caps the page at 20. */
  limit?: number;
  order?: "asc" | "desc";
  after?: string;
}

export interface ThreadListResponse {
  object: "list";
  data: Thread[];
}
