/**
 * @webamigos/ragen-sdk-ts — Official TypeScript SDK for Ragen.ai
 *
 * EU-native, GDPR-compliant RAG platform with an OpenAI-compatible wire format.
 */

export { Ragen } from "./client";
export type { RagenClientOptions } from "./client";

export { Chat, ChatCompletions } from "./resources/chat";
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
  ChatSource,
  ChatStreamEvent,
} from "./resources/chat";

export { Threads } from "./resources/threads";
export type { Thread, ThreadListParams, ThreadListResponse } from "./resources/threads";

export { Files } from "./resources/files";
export type { UploadFileInput } from "./resources/files";
export type {
  FileDeletedResponse,
  FileListParams,
  FileListResponse,
  FileObject,
  FilePurpose,
  FileStatus,
  FileUploadParams,
  WaitUntilProcessedOptions,
} from "./resources/files";

export { Assistants } from "./resources/assistants";
export type {
  Assistant,
  AssistantCreateParams,
  AssistantDeletedResponse,
  AssistantListParams,
  AssistantListResponse,
  AssistantUpdateParams,
} from "./resources/assistants";

export {
  RagenError,
  RagenAuthError,
  RagenPermissionError,
  RagenNotFoundError,
  RagenRateLimitError,
  RagenAPIError,
} from "./errors";

export type {
  ChatCompletionRole,
  ChatCompletionUsage,
  ChatCompletionStreamOptions,
  ReasoningEffort,
  APIErrorBody,
} from "./types";

// Default export so `import Ragen from "@webamigos/ragen-sdk-ts"` also works.
export { Ragen as default } from "./client";
