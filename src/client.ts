import { RagenError } from "./errors";
import { Assistants } from "./resources/assistants";
import { Chat } from "./resources/chat";
import { Files } from "./resources/files";
import { Threads } from "./resources/threads";
import type { FetchClientConfig } from "./utils";

const DEFAULT_BASE_URL = "https://api.ragen.ai/v1";
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface RagenClientOptions {
  /** API key. Required. Read from `RAGEN_API_KEY` if omitted (Node only). */
  apiKey?: string;
  /**
   * Default `assistant_id` for calls that do not carry one.
   *
   * Usually unnecessary: an API key created for a single assistant already
   * answers for it, and a key scoped to the knowledge base refuses any
   * assistant at all. Set this only when one key legitimately reaches several
   * assistants and you want a default among them.
   */
  assistantId?: string;
  /** Override the API base URL (e.g. for self-hosted deployments). */
  baseURL?: string;
  /** Maximum number of retry attempts on 429/5xx and transient errors. Default 2. */
  maxRetries?: number;
  /** Per-request timeout in milliseconds. Default 30_000. */
  timeout?: number;
  /** Custom `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/**
 * Main Ragen.ai SDK client.
 *
 * @example
 * ```ts
 * import { Ragen } from "@webamigos/ragen-sdk-ts";
 *
 * const ragen = new Ragen({ apiKey: process.env.RAGEN_API_KEY });
 *
 * const completion = await ragen.chat.completions.create({
 *   assistantId: "11111111-1111-4111-8111-111111111111",
 *   messages: [{ role: "user", content: "What is our refund policy?" }],
 * });
 * ```
 */
export class Ragen {
  readonly chat: Chat;
  readonly files: Files;
  readonly assistants: Assistants;
  readonly threads: Threads;

  constructor(options: RagenClientOptions = {}) {
    const apiKey =
      options.apiKey ??
      (typeof process !== "undefined" ? process.env?.RAGEN_API_KEY : undefined);
    if (!apiKey) {
      throw new RagenError(
        "Missing API key. Pass `apiKey` to `new Ragen({ ... })` or set RAGEN_API_KEY.",
        { status: 0, type: "invalid_request_error", param: "apiKey" },
      );
    }

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new RagenError(
        "No `fetch` implementation found. Use Node 18+ or pass `options.fetch`.",
        { status: 0, type: "invalid_request_error" },
      );
    }

    const http: FetchClientConfig = {
      apiKey,
      baseURL: options.baseURL ?? DEFAULT_BASE_URL,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
      fetch: fetchImpl.bind(globalThis),
    };

    this.chat = new Chat({ http, defaultAssistantId: options.assistantId });
    this.files = new Files({ http });
    this.assistants = new Assistants({ http });
    this.threads = new Threads({ http });
  }
}
