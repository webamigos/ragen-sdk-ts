import { describe, expect, it } from "vitest";

import { Ragen } from "../src";
import { makeFetchMock, mockResponse } from "./helpers";

function thread(id: string) {
  return {
    id,
    object: "thread" as const,
    created_at: 1,
    tool_resources: {},
    metadata: {},
    title: "Support chat",
    assistant_id: "11111111-1111-4111-8111-111111111111",
  };
}

describe("threads.list", () => {
  it("hits GET /threads and surfaces the Ragen extension fields", async () => {
    const { fetch, calls } = makeFetchMock([
      mockResponse({ body: { object: "list", data: [thread("thread-1")] } }),
    ]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    const out = await ragen.threads.list();

    expect(calls[0]!.url).toBe("https://api.ragen.ai/v1/threads");
    expect(calls[0]!.init.method).toBe("GET");
    expect(out.data[0]!.title).toBe("Support chat");
    expect(out.data[0]!.assistant_id).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("passes limit, order and after as query params", async () => {
    const { fetch, calls } = makeFetchMock([
      mockResponse({ body: { object: "list", data: [] } }),
    ]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    await ragen.threads.list({ limit: 50, order: "asc", after: "thread-9" });

    const url = new URL(calls[0]!.url);
    expect(url.pathname).toBe("/v1/threads");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("order")).toBe("asc");
    expect(url.searchParams.get("after")).toBe("thread-9");
  });

  it("sends no query string when no params are given", async () => {
    const { fetch, calls } = makeFetchMock([
      mockResponse({ body: { object: "list", data: [] } }),
    ]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    await ragen.threads.list();

    expect(calls[0]!.url).not.toContain("?");
  });
});

describe("threads.iterate", () => {
  it("pages with `after` until a short page arrives", async () => {
    const full = Array.from({ length: 2 }, (_, i) => thread(`thread-${i + 1}`));
    const { fetch, calls } = makeFetchMock([
      mockResponse({ body: { object: "list", data: full } }),
      mockResponse({ body: { object: "list", data: [thread("thread-3")] } }),
    ]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    const ids = [];
    for await (const t of ragen.threads.iterate({ limit: 2 })) {
      ids.push(t.id);
    }

    expect(ids).toEqual(["thread-1", "thread-2", "thread-3"]);
    expect(calls).toHaveLength(2);
    expect(new URL(calls[0]!.url).searchParams.get("after")).toBeNull();
    expect(new URL(calls[1]!.url).searchParams.get("after")).toBe("thread-2");
  });

  it("stops after one request when the first page is short", async () => {
    const { fetch, calls } = makeFetchMock([
      mockResponse({ body: { object: "list", data: [thread("thread-1")] } }),
    ]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    const ids = [];
    for await (const t of ragen.threads.iterate({ limit: 10 })) {
      ids.push(t.id);
    }

    expect(ids).toEqual(["thread-1"]);
    expect(calls).toHaveLength(1);
  });

  it("stops on an empty page rather than looping", async () => {
    const { fetch, calls } = makeFetchMock([
      mockResponse({ body: { object: "list", data: [] } }),
    ]);
    const ragen = new Ragen({ apiKey: "sk_test", fetch });

    const ids = [];
    for await (const t of ragen.threads.iterate({ limit: 5 })) {
      ids.push(t.id);
    }

    expect(ids).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});
