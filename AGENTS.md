# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, etc.) working in this repo.

## What this is

`@webamigos/ragen-sdk-ts` — official TypeScript SDK for [Ragen.ai](https://ragen.ai), an EU-native, GDPR-compliant RAG platform with an OpenAI-compatible wire format.

Zero runtime dependencies. Runs on Node ≥18, browsers, and edge runtimes.

## The one thing to understand first

Ragen's API is OpenAI-compatible, so **the official OpenAI SDK already works against it** with a base URL override. That makes "add a wrapper for endpoint X" the wrong default instinct — a wrapper for something the OpenAI SDK already speaks is duplicated surface we then have to keep in sync.

This SDK's job is the part that falls **outside** the OpenAI spec. Read [`docs/api-surface.md`](docs/api-surface.md) before adding or removing any resource. It records what we cover, what we deliberately don't, and why.

## Task Router

Before starting a nontrivial task, match it against this table and read the linked doc(s) first — and skim [`docs/lessons.md`](docs/lessons.md) for the relevant area so you don't re-discover a known gotcha. Skip this for single-line or obvious fixes.

| Task                                                    | Where to look                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deciding what belongs here**                          |                                                                                                                                                                                 |
| Adding a resource, method, or endpoint wrapper          | [`docs/api-surface.md`](docs/api-surface.md) first — then [`.claude/skills/ragen-sdk-add-resource/SKILL.md`](.claude/skills/ragen-sdk-add-resource/SKILL.md)                    |
| "Does the SDK still match the API?"                     | [`.claude/skills/ragen-sdk-api-drift/SKILL.md`](.claude/skills/ragen-sdk-api-drift/SKILL.md)                                                                                    |
| Whether to wrap something or leave it to the OpenAI SDK | [`docs/api-surface.md`](docs/api-surface.md), "What this SDK deliberately does not cover"                                                                                       |
| **Wire format**                                         |                                                                                                                                                                                 |
| Request params, what the server accepts                 | The DTO in `apps/api/src/<resource>/dto/` — see "Where the API lives" below. Never the docs alone                                                                               |
| Error shapes, which errors carry a message              | [`docs/lessons/an-endpoint-without-the-openai-filter-answers-in-four-shapes.md`](docs/lessons/an-endpoint-without-the-openai-filter-answers-in-four-shapes.md), `src/errors.ts` |
| Streaming, SSE parsing                                  | `src/streaming.ts` — one parser, generic over payload; two different payload shapes use it                                                                                      |
| Pagination on a list endpoint                           | [`docs/lessons/a-list-method-without-pagination-params-looks-complete.md`](docs/lessons/a-list-method-without-pagination-params-looks-complete.md)                              |
| **Release**                                             |                                                                                                                                                                                 |
| Publishing, version bumps, what breaks consumers        | [`.claude/skills/ragen-sdk-release/SKILL.md`](.claude/skills/ragen-sdk-release/SKILL.md)                                                                                        |
| Changing anything exported from `src/index.ts`          | "Public API stability" below — that file is the contract                                                                                                                        |

## Stack

- **Language**: TypeScript (strict, ES2022, `moduleResolution: bundler`)
- **Runtime targets**: Node ≥18, browsers, edge runtimes (uses global `fetch`)
- **Build**: `tsup` → dual ESM + CJS + `.d.ts` in `dist/`
- **Tests**: `vitest`
- **Lint/format**: `eslint` + `prettier`
- **Package manager**: `pnpm` (lockfile committed; CI uses `--frozen-lockfile`)

## Layout

```
src/
  client.ts          # Ragen class — entry point, wires resources
  resources/         # one file per API resource
    chat.ts          # OpenAI-compatible completions + Ragen's native /v1/chat
    files.ts
    assistants.ts
    threads.ts
  streaming.ts       # generic SSE parser
  types.ts           # shared wire types
  errors.ts          # RagenError + subclasses, error-body normalization
  utils.ts           # fetch wrapper, retries, timeouts
  index.ts           # public exports — keep curated
tests/               # vitest, one file per resource + errors
examples/            # runnable scripts (npx tsx examples/<name>.ts)
docs/
  api-surface.md     # what we cover and what we leave to the OpenAI SDK
  lessons.md         # catalog of non-obvious gotchas
  lessons/           # one file per lesson
.claude/skills/      # task-specific playbooks
```

## Commands

```bash
pnpm install              # install (runs husky prepare automatically)
pnpm verify               # THE gate: type-check + lint + test + build
pnpm test                 # vitest run
pnpm test:watch           # vitest watch
pnpm type-check           # tsc --noEmit
pnpm lint                 # eslint src
pnpm format               # prettier --write
pnpm build                # tsup → dist/
pnpm commit               # commitizen prompt
```

`pnpm verify` runs exactly what CI runs, in the same order. Run it before declaring work done — `pnpm test` alone passes while the build is broken, because the tests import from `src/`, not `dist/`.

## Where the API lives

The server is **not** in this repo. It's the `apps/api` workspace of the [`WebAmigos/ragen`](https://github.com/WebAmigos/ragen) monorepo, with published docs in `apps/docs/docs/api-reference/`.

When a wire-format question comes up, the source of truth is, in order:

1. **The DTO** — `apps/api/src/<resource>/dto/*.dto.ts`. This is what the server actually validates.
2. **The controller** — `apps/api/src/<resource>/*.controller.ts`. Routes, and which exception filter it runs under.
3. **The mapper** — `apps/api/src/<resource>/*.mapper.ts`. The exact response shape.
4. The docs page. Useful for intent, but it has drifted from the code before.

If you cannot read that repo, ask the user rather than guessing. A guessed param name is a 400 at runtime, not a type error — see the whitelist lesson.

### The whitelist constraint

`apps/api` runs a global `ValidationPipe` with `forbidNonWhitelisted: true`. **Any field the SDK sends that the DTO doesn't declare rejects the entire request with a 400** — it is not ignored.

This inverts the usual "extra fields are harmless" assumption. Every field this SDK can put on the wire must exist in the matching DTO. See [`docs/lessons/forbidnonwhitelisted-makes-an-undeclared-param-a-400.md`](docs/lessons/forbidnonwhitelisted-makes-an-undeclared-param-a-400.md).

## Conventions

- **Public API stability**: anything exported from `src/index.ts` is the public surface. Don't rename or remove without a major bump. Adding is fine. A changed _signature_ that still compiles is the dangerous case — `list(options)` → `list(params, options)` keeps compiling and silently drops the argument.
- **OpenAI parity where it applies**: for the OpenAI-compatible resources, match OpenAI's request/response shape exactly — snake_case on the wire, camelCase only for SDK-specific options like `assistantId`.
- **Errors**: throw `RagenError` subclasses, never bare `Error`. Status, type, `code` and `param` belong on the error. Not every endpoint returns the OpenAI error envelope — normalize in `src/errors.ts`, not per resource.
- **Streaming**: `src/streaming.ts` holds the only SSE parser. It's generic over the payload because `/v1/chat/completions` and `/v1/chat` stream different shapes. Extend it; don't write a second one.
- **No Node-only APIs in `src/`**: the SDK runs in browsers and edge runtimes. Guard `process.env` reads with `typeof process !== "undefined"` (see `client.ts`). Use `globalThis.fetch`. The one exception is `files.upload()`'s path-string branch, which imports `node:fs` — keep such imports confined to a branch that browser callers never take.
- **No business logic in resources**: resources are thin HTTP wrappers. Retries, timeouts, and auth live in `utils.ts`.
- **Always brace control statements.** `curly: ["error", "all"]` enforces it. `if (x !== undefined) body.x = x;` becomes a block — a single-line body reads fine until someone adds a second statement under it and the indentation lies about what the branch covers. `eslint --fix` rewrites these for you.
- **Examples must run as-is**: anything in `examples/` should work with `RAGEN_API_KEY=... npx tsx examples/<name>.ts`.

## Comments

Default to no comments. Only write one when the _why_ is non-obvious — a workaround, an invariant, a constraint that isn't visible from the code. Don't restate what the code does. Don't add file-header banners.

The comments worth writing here are usually about the server: why a field is omitted rather than sent as `undefined`, why an error shape needs four branches, why a param is honored rather than tolerated.

## Testing Requirements

All new code ships with tests. Vitest, in `tests/`, one file per resource.

| Change                 | Tests required                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| New resource or method | Request shape (URL, method, body/query) **and** response parsing                                                          |
| New request param      | That it's forwarded when set, **and** omitted from the body when unset                                                    |
| Error handling         | Assert on the error **message**, not only the subclass — status alone picks the right class even when the message is lost |
| Streaming              | Event sequence, and termination on `[DONE]`                                                                               |
| Pagination             | That params reach the query string, and that an iterator terminates                                                       |

Tests use `makeFetchMock` from `tests/helpers.ts`, which records calls and replays queued responses. Assert on `calls[n].init.body` — the exact bytes on the wire are the contract with `apps/api`.

Because the whitelist constraint makes an extra field fatal, "omits optional fields entirely rather than sending undefined" is a real test, not a pedantic one.

## Commits

Conventional Commits, enforced by commitlint on `commit-msg`. `lint-staged` runs eslint + prettier on staged files via `pre-commit`.

```
<type>(<scope>): <subject>
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `build`, `ci`, `perf`, `style`, `revert`.

## Versioning & releases

SemVer. See [`.claude/skills/ragen-sdk-release/SKILL.md`](.claude/skills/ragen-sdk-release/SKILL.md) for the full checklist — it covers the tag/version match CI enforces and what counts as breaking for consumers.

## Things to NOT do

- **Don't wrap an endpoint just because it exists.** If the OpenAI SDK already speaks it, wrapping it adds surface to maintain and a second thing to keep in sync. [`docs/api-surface.md`](docs/api-surface.md) is the decision record.
- **Don't add a `models` resource.** The Ragen API has no `/v1/models` endpoint. (The changelog once claimed this resource shipped; it never existed.)
- **Don't add a default `model`** to chat requests — the server owns model selection per assistant.
- **Don't switch to `axios`** or another HTTP client. Platform `fetch` is what keeps the SDK runtime-agnostic and zero-dependency.
- **Don't add runtime `dependencies`** casually. Zero is a feature; a new one needs a clear justification.
- **Don't commit to `dist/`** — built in CI, gitignored locally.
- **Don't use `asst_`-prefixed UUID samples.** Ragen assistant IDs are bare UUIDs (the API no longer returns the legacy `asst-<uuid>` form, but still accepts it on input); use `11111111-1111-4111-8111-111111111111` in docs and examples.
- **Don't assume an error body has `error.message`.** Only the endpoints running `OpenAiExceptionFilter` do.

## Post-Task Workflow

After modifying or creating files:

1. **Write tests** — see Testing Requirements above.
2. **Run the gate** — `pnpm verify`. Not `pnpm test` alone.
3. **Update the docs that are contracts** — `CHANGELOG.md` for anything user-visible, `README.md` for anything a user would call, `docs/api-surface.md` if coverage changed.
4. **Log a lesson if you hit one** — a nontrivial correction or a non-obvious gotcha goes in [`docs/lessons.md`](docs/lessons.md); that file explains its own format.
