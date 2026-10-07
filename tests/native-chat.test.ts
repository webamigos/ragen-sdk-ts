import { describe, expect, it } from "vitest";

import { Ragen } from "../src";
import { makeFetchMock, mockResponse, sseStream } from "./helpers";

const assistantId = "11111111-1111-4111-8111-111111111111";

describe("chat.send (native POST /v1/chat)", () => {
  it("posts to /chat and returns the text payload", async () => {
    const { fetch, calls } = makeFetchMock([
      mockResponse({ body: { text: "30 days, full refund." } }),
    ]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    const out = await ragen.chat.send({
      assistantId,
      content: "What is our refund policy?",
    });

    expect(out.text).toBe("30 days, full refund.");
    expect(calls[0]!.url).toBe("https://api.ragen.ai/v1/chat");
    expect(calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      assistant_id: assistantId,
      content: "What is our refund policy?",
      stream: false,
    });
  });

  it("sends context and reasoning_effort when given", async () => {
    const { fetch, calls } = makeFetchMock([mockResponse({ body: { text: "ok" } })]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    await ragen.chat.send({
      assistantId,
      content: "Why?",
      context: "This is the FAQ page.",
      reasoning_effort: "high",
    });

    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      assistant_id: assistantId,
      content: "Why?",
      stream: false,
      context: "This is the FAQ page.",
      reasoning_effort: "high",
    });
  });

  // The endpoint whitelists its body with `forbidNonWhitelisted`, so an
  // undefined field serialized as null/absent matters: anything extra is
  // a 400 from the server.
  it("omits optional fields entirely rather than sending undefined", async () => {
    const { fetch, calls } = makeFetchMock([mockResponse({ body: { text: "ok" } })]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    await ragen.chat.send({ assistantId, content: "Hi" });

    const body = JSON.parse(calls[0]!.init.body as string);
    expect(Object.keys(body).sort()).toEqual(["assistant_id", "content", "stream"]);
  });

  it("falls back to the client-level assistantId", async () => {
    const { fetch, calls } = makeFetchMock([mockResponse({ body: { text: "ok" } })]);
    const ragen = new Ragen({ apiKey: "sk_test", assistantId, fetch });

    await ragen.chat.send({ content: "Hi" });

    expect(JSON.parse(calls[0]!.init.body as string).assistant_id).toBe(assistantId);
  });

  // This used to throw before sending anything. It cannot any more: the API
  // key carries a scope, and a key bound to the knowledge base *requires* the
  // field to be absent — refusing to send the request made that key unusable
  // from the SDK entirely.
  it("sends the request with no assistant_id when nobody names one", async () => {
    const { fetch, calls } = makeFetchMock([mockResponse({ body: { text: "Hi" } })]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    await ragen.chat.send({ content: "Hi" });

    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0]!.init.body as string) as Record<string, unknown>;
    expect("assistant_id" in body).toBe(false);
    expect(body).toEqual({ content: "Hi", stream: false });
  });
});

describe("chat.sendStream", () => {
  it("tags text and reasoning events and stops at [DONE]", async () => {
    const { fetch, calls } = makeFetchMock([
      mockResponse({
        raw: sseStream([
          'data: {"reasoning":"Checking the policy"}',
          'data: {"text":"30 "}',
          'data: {"text":"days."}',
          "data: [DONE]",
        ]),
      }),
    ]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    const events = [];
    for await (const event of ragen.chat.sendStream({
      assistantId,
      content: "Why?",
      reasoning_effort: "medium",
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "reasoning", reasoning: "Checking the policy" },
      { type: "text", text: "30 " },
      { type: "text", text: "days." },
    ]);
    expect(JSON.parse(calls[0]!.init.body as string).stream).toBe(true);
  });

  it("skips payloads that carry neither text nor reasoning", async () => {
    const { fetch } = makeFetchMock([
      mockResponse({
        raw: sseStream([
          'data: {"unrelated":true}',
          'data: {"text":"kept"}',
          "data: [DONE]",
        ]),
      }),
    ]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    const events = [];
    for await (const event of ragen.chat.sendStream({ assistantId, content: "Hi" })) {
      events.push(event);
    }

    expect(events).toEqual([{ type: "text", text: "kept" }]);
  });

  // The whole point of the discriminant: concatenating every event would
  // splice the model's thinking into the answer.
  it("sendToString keeps answer text and drops reasoning", async () => {
    const { fetch } = makeFetchMock([
      mockResponse({
        raw: sseStream([
          'data: {"reasoning":"THINKING"}',
          'data: {"text":"Answer "}',
          'data: {"reasoning":"MORE THINKING"}',
          'data: {"text":"only."}',
          "data: [DONE]",
        ]),
      }),
    ]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    const out = await ragen.chat.sendToString({ assistantId, content: "Hi" });

    expect(out).toBe("Answer only.");
    expect(out).not.toContain("THINKING");
  });
});

describe("sources (opt-in)", () => {
  const sources = [
    { fileId: "f1", fileName: "returns.pdf", rank: 1 },
    {
      fileId: "f2",
      fileName: "Returns",
      rank: 2,
      brain: { pageTitle: "Returns", sources: [{ fileName: "returns.pdf", span: "§2" }] },
    },
  ];

  it("sends sources: true and returns the list from send()", async () => {
    const { fetch, calls } = makeFetchMock([
      mockResponse({ body: { text: "ok", sources } }),
    ]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    const out = await ragen.chat.send({ assistantId, content: "Hi", sources: true });

    expect(JSON.parse(calls[0]!.init.body as string).sources).toBe(true);
    expect(out.sources).toEqual(sources);
  });

  it("sends nothing about sources unless asked", async () => {
    const { fetch, calls } = makeFetchMock([
      mockResponse({ body: { text: "ok" } }),
      mockResponse({ body: { text: "ok" } }),
    ]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    await ragen.chat.send({ assistantId, content: "Hi" });
    await ragen.chat.send({ assistantId, content: "Hi", sources: false });

    for (const call of calls) {
      expect("sources" in JSON.parse(call.init.body as string)).toBe(false);
    }
  });

  it("yields a sources event from sendStream() and keeps it out of sendToString()", async () => {
    const stream = () =>
      sseStream([
        'data: {"text":"30 days."}',
        `data: ${JSON.stringify({ sources })}`,
        "data: [DONE]",
      ]);
    const { fetch } = makeFetchMock([
      mockResponse({ raw: stream() }),
      mockResponse({ raw: stream() }),
    ]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    const events = [];
    for await (const event of ragen.chat.sendStream({
      assistantId,
      content: "Hi",
      sources: true,
    })) {
      events.push(event);
    }
    expect(events).toEqual([
      { type: "text", text: "30 days." },
      { type: "sources", sources },
    ]);

    expect(
      await ragen.chat.sendToString({ assistantId, content: "Hi", sources: true }),
    ).toBe("30 days.");
  });
});
