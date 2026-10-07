# Changelog

All notable changes to `@webamigos/ragen-sdk-ts` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] — 2026-10-07

### Added

- **Sources.** Ask the API for the documents an answer was drawn from.
  `chat.send({ sources: true })` returns `sources`; `chat.sendStream({ sources: true })`
  yields one `{ type: "sources" }` event near the end; and
  `chat.completions.create({ ragen_sources: true })` returns `ragen_sources`
  (a trailing `choices: []` chunk when streaming). Each `ChatSource` has `fileId`,
  `fileName`, `rank`, and for a published Ragen Brain page a `brain` object with
  the page's title and the documents behind it that your key may open.

  Off by default and not sent unless set, so nothing changes for existing code.
  `sendToString` and `streamToString` ignore the extra event. The API side needs
  a Ragen version that ships `sources` / `ragen_sources`; an older server rejects
  the field with `400`.

## [0.3.0] — 2026-09-18

### Changed

- **`assistantId` is optional, and the SDK no longer refuses to send a request
  without one.** It used to throw `RagenError` before any HTTP call when
  neither a per-call `assistantId` nor a client default was set, and to send
  `assistant_id` on every request when one was.

  Both are now wrong. The Ragen API gives an API key a scope of its own: a key
  created for one assistant answers for it unasked, and a key scoped to the
  whole knowledge base — the default for a new key — **rejects a request that
  names any assistant** with `403`. So the old behaviour made a knowledge-base
  key unusable from this SDK in both directions: it would not send the request
  without the field, and the field it insisted on was the thing being refused.

  `assistant_id` now goes on the wire only when a caller supplies one. Set it
  when a key legitimately reaches several assistants; otherwise leave it out
  and let the key decide.

  Nothing that works today breaks: a call that passed an `assistantId` still
  sends it. Only code that *relied on the throw* — catching a missing
  `assistantId` locally rather than letting the API answer — changes, and it
  now gets a real response instead of a synthetic error.

## [0.2.2] — 2026-09-06

### Changed

- Maintenance only — no change to the published code. `dist/` is byte-for-byte
  what 0.2.1 shipped; nothing under `src/` was touched. This release exists to
  exercise the publish pipeline on upgraded GitHub Actions
  (`checkout` 4→7, `setup-node` 4→7, `pnpm/action-setup` 4→6,
  `action-gh-release` 2→3), which CI cannot cover because the release workflow
  only runs on a tag.
- Development dependencies: `@types/node` 20→26, plus transitive updates.
  `commitlint` and `lint-staged` were deliberately held back — their current
  majors require Node ≥22, and this package supports Node ≥18.

## [0.2.1] — 2026-09-06

### Changed

- **The license changes from MIT to Apache 2.0.** Apache 2.0 adds an express
  patent grant and requires attribution notices to travel with redistributions
  — see the new `NOTICE` file. Both `LICENSE` and `NOTICE` now ship inside the
  npm tarball, which no previous release ever carried.

  0.2.0 went out declaring MIT by mistake, and npm version metadata is
  immutable — this release is the correction. Treat 0.2.0 as withdrawn.

## [0.2.0] — 2026-09-06

### Changed

- **Breaking**: the package is renamed from `@ragenai/sdk` to
  `@webamigos/ragen-sdk-ts`, matching the `@webamigos` scope the rest of
  the platform uses. Update the dependency and every import:

  ```diff
  - import { Ragen } from "@ragenai/sdk";
  + import { Ragen } from "@webamigos/ragen-sdk-ts";
  ```

  Nothing about the API changes — only the name it is installed and
  imported under. `@ragenai/sdk` stops receiving updates at 0.1.2; it is
  not a dist-tag alias, so a pinned dependency keeps resolving to the old
  package until it is changed.
- The `User-Agent` sent with every request becomes
  `@webamigos/ragen-sdk-ts`. Anything filtering API logs or analytics on
  the old value needs updating.

### Added

- `chat.send()`, `chat.sendStream()` and `chat.sendToString()` for
  Ragen's native `POST /v1/chat`. This endpoint accepts `context` (extra
  page/document text for embedded chatbots) and separates the model's
  reasoning deltas from the answer — neither has an equivalent on
  `/v1/chat/completions`, so both were previously unreachable from the
  SDK. `sendStream()` yields discriminated `{ type: "text" | "reasoning" }`
  events.
- `threads.list()` and `threads.iterate()`. Listing threads is not part
  of the OpenAI spec, so no OpenAI SDK exposes it. The rest of thread and
  message CRUD is OpenAI-compatible and deliberately left to the OpenAI
  SDK rather than duplicated here.
- `reasoning_effort` and `max_completion_tokens` on
  `chat.completions.create()` / `.stream()`. Requires an API that accepts
  them — see the matching `fix(api)` change.
- Pagination on `assistants.list()`: `limit`, `order`, `after`, `before`.
  Without them the call silently returned only the first 20 assistants.
- `Thread`, `ThreadListParams`, `ThreadListResponse`, `ChatSendParams`,
  `ChatSendResponse`, `ChatStreamEvent`, `ReasoningEffort`,
  `FilePurpose` and `AssistantListParams` type exports.

### Changed

- **Breaking**: `assistants.list()` now takes `(params?, options?)`
  instead of `(options?)`, matching `files.list()`. A call written as
  `assistants.list({ signal })` now reads `signal` as a list param and
  drops it — move it to the second argument.
- `Assistant` now types every field the API actually returns
  (`description`, `model`, `tools`, `tool_resources`, `metadata`,
  `temperature`, `top_p`, `response_format`); previously only five of
  thirteen were declared.
- `AssistantCreateParams` / `AssistantUpdateParams` accept the fields the
  API tolerates: `description`, `model`, `temperature`, `metadata`,
  `top_p`.
- `FileListParams.purpose` narrowed from `string` to
  `"knowledge_base" | "assistants"` — the API 400s on anything else, so
  a typo is now a compile error instead of a runtime failure.
- `parseSSEStream()` is generic over its payload, since `/v1/chat` and
  `/v1/chat/completions` stream different shapes.

### Fixed

- Error messages from `chat.send*()` are no longer swallowed. `/v1/chat`
  runs without the OpenAI exception filter and answers in three shapes —
  `{ error: "<string>", code }`, `{ message }` (an array from the
  validation pipe) and bare text on its 500 path. The client only read
  the OpenAI envelope, so every one of them surfaced as "Ragen API
  request failed with status 404" instead of the real reason. The
  OpenAI-compatible routes are unaffected and still take precedence.
- Removed a changelog entry for `models.list()` / `models.retrieve()`.
  No such resource ships in this SDK, and the API has no `/v1/models`
  endpoint.

## [0.1.0] — 2026-04-28

### Added

- Initial release of the `@ragenai/sdk` TypeScript client.
- `chat.completions.create()` (non-streaming and streaming) with full
  type-safe support for OpenAI-compatible parameters plus Ragen's
  `assistantId`.
- `chat.completions.stream()` and `chat.completions.streamToString()`
  convenience helpers backed by an SSE async iterator.
- `files` resource: `upload`, `list`, `retrieve`, `delete`,
  `waitUntilProcessed`, and `uploadAndWait`.
- `assistants` CRUD (`create`, `list`, `retrieve`, `update`, `delete`).
- Typed error hierarchy: `RagenError`, `RagenAuthError`,
  `RagenPermissionError`, `RagenNotFoundError`, `RagenRateLimitError`,
  `RagenAPIError`.
- Auto-retry on 429 and 5xx with exponential backoff + jitter.
- Per-request `AbortSignal` support and configurable timeout.
- Dual ESM + CJS build via `tsup`, with `.d.ts` types.
