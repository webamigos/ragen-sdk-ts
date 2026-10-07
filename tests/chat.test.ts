import { describe, expect, it } from "vitest";

import { Ragen, RagenAuthError, RagenRateLimitError } from "../src";
import { makeFetchMock, mockResponse } from "./helpers";

const completion = {
  id: "chatcmpl-1",
  object: "chat.completion",
  created: 1,
  model: "gpt-5.4",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "hi" },
      finish_reason: "stop",
      logprobs: null,
    },
  ],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
};

describe("chat.completions.create", () => {
  it("sends assistant_id and messages and parses the response", async () => {
    const { fetch, calls } = makeFetchMock([mockResponse({ body: completion })]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    const result = await ragen.chat.completions.create({
      assistantId: "22222222-2222-4222-8222-222222222222",
      messages: [{ role: "user", content: "hello" }],
      temperature: 0.5,
      max_tokens: 100,
    });

    expect(result.choices[0].message.content).toBe("hi");
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://api.ragen.ai/v1/chat/completions");
    expect(call.init.method).toBe("POST");
    const body = JSON.parse(call.init.body as string);
    expect(body).toEqual({
      assistant_id: "22222222-2222-4222-8222-222222222222",
      messages: [{ role: "user", content: "hello" }],
      stream: false,
      temperature: 0.5,
      max_tokens: 100,
    });
    const headers = call.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test");
  });

  it("uses the default assistantId from the client", async () => {
    const { fetch, calls } = makeFetchMock([mockResponse({ body: completion })]);
    const ragen = new Ragen({
      apiKey: "sk_test",
      assistantId: "33333333-3333-4333-8333-333333333333",
      fetch,
    });

    await ragen.chat.completions.create({
      messages: [{ role: "user", content: "hi" }],
    });

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.assistant_id).toBe("33333333-3333-4333-8333-333333333333");
  });

  // The whole point of the change: a body an OpenAI-compatible caller can
  // produce, and the only body a knowledge-base key accepts. This used to
  // throw before the request left the process.
  it("omits assistant_id when nobody names one", async () => {
    const { fetch, calls } = makeFetchMock([
      mockResponse({
        body: {
          id: "chatcmpl-1",
          object: "chat.completion",
          created: 0,
          model: "ragen",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "hi" },
              finish_reason: "stop",
            },
          ],
        },
      }),
    ]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    await ragen.chat.completions.create({
      messages: [{ role: "user", content: "hi" }],
    });

    const body = JSON.parse(calls[0]!.init.body as string) as Record<string, unknown>;
    expect("assistant_id" in body).toBe(false);
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("throws RagenAuthError on 401", async () => {
    const { fetch } = makeFetchMock([
      mockResponse({
        status: 401,
        body: {
          error: {
            message: "bad key",
            type: "invalid_request_error",
            code: "invalid_api_key",
            param: null,
          },
        },
      }),
    ]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch, maxRetries: 0 });
    await expect(
      ragen.chat.completions.create({
        assistantId: "22222222-2222-4222-8222-222222222222",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toBeInstanceOf(RagenAuthError);
  });

  it("retries on 429 and eventually throws RagenRateLimitError", async () => {
    const errBody = {
      error: { message: "rate", type: "rate_limit", code: null, param: null },
    };
    const { fetch, calls } = makeFetchMock([
      mockResponse({ status: 429, body: errBody }),
      mockResponse({ status: 429, body: errBody }),
      mockResponse({ status: 429, body: errBody }),
    ]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch, maxRetries: 2 });
    await expect(
      ragen.chat.completions.create({
        assistantId: "22222222-2222-4222-8222-222222222222",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toBeInstanceOf(RagenRateLimitError);
    expect(calls).toHaveLength(3);
  });

  it("retries on 500 then succeeds", async () => {
    const { fetch, calls } = makeFetchMock([
      mockResponse({
        status: 500,
        body: {
          error: { message: "boom", type: "api_error", code: null, param: null },
        },
      }),
      mockResponse({ body: completion }),
    ]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch, maxRetries: 2 });
    const out = await ragen.chat.completions.create({
      assistantId: "22222222-2222-4222-8222-222222222222",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(out.id).toBe("chatcmpl-1");
    expect(calls).toHaveLength(2);
  });
});

describe("chat.completions params newly accepted by the API", () => {
  it("forwards reasoning_effort and max_completion_tokens", async () => {
    const { fetch, calls } = makeFetchMock([
      mockResponse({
        body: {
          id: "chatcmpl-1",
          object: "chat.completion",
          created: 1,
          model: "gpt-oss-120b",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "ok" },
              finish_reason: "stop",
              logprobs: null,
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      }),
    ]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    await ragen.chat.completions.create({
      assistantId: "11111111-1111-4111-8111-111111111111",
      messages: [{ role: "user", content: "Hi" }],
      reasoning_effort: "high",
      max_completion_tokens: 512,
    });

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body.reasoning_effort).toBe("high");
    expect(body.max_completion_tokens).toBe(512);
  });

  it("leaves both out when unset, so the body stays minimal", async () => {
    const { fetch, calls } = makeFetchMock([
      mockResponse({
        body: {
          id: "chatcmpl-1",
          object: "chat.completion",
          created: 1,
          model: "m",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "ok" },
              finish_reason: "stop",
              logprobs: null,
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        },
      }),
    ]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    await ragen.chat.completions.create({
      assistantId: "11111111-1111-4111-8111-111111111111",
      messages: [{ role: "user", content: "Hi" }],
    });

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body).not.toHaveProperty("max_completion_tokens");
  });
});

describe("chat.completions ragen_sources (opt-in)", () => {
  const sources = [{ fileId: "f1", fileName: "returns.pdf", rank: 1 }];

  it("sends ragen_sources: true and returns the list", async () => {
    const { fetch, calls } = makeFetchMock([
      mockResponse({ body: { ...completion, ragen_sources: sources } }),
    ]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    const result = await ragen.chat.completions.create({
      messages: [{ role: "user", content: "hello" }],
      ragen_sources: true,
    });

    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      messages: [{ role: "user", content: "hello" }],
      stream: false,
      ragen_sources: true,
    });
    expect(result.ragen_sources).toEqual(sources);
  });

  it("says nothing about sources unless asked", async () => {
    const { fetch, calls } = makeFetchMock([mockResponse({ body: completion })]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    await ragen.chat.completions.create({
      messages: [{ role: "user", content: "hello" }],
      ragen_sources: false,
    });

    expect("ragen_sources" in JSON.parse(calls[0]!.init.body as string)).toBe(false);
  });
});
