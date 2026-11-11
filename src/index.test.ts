import {
  FlyMyAI,
  FlyMyAIAPIError,
  FlyMyAIStreamError,
  FlyMyAIStreamInterrupted,
} from "./index";

const encoder = new TextEncoder();
const CHUNK_1 = 'data: {"status": 200, "output_data": {"output": ["Hel"]}}\n\n';
const CHUNK_2 = 'data: {"status": 200, "output_data": {"output": ["lo"]}}\n\n';
const ERROR_EVENT = 'data: {"status": 500, "details": "provider failed"}\n\n';
const PREDICT_OK = 'data: {"status": 200, "output_data": {"output": ["done"]}}\n\n';

/** A response whose body yields the chunks, then breaks like a dropped connection. */
function sse(chunks: (string | Uint8Array)[], cut = false, status = 200, headers: Record<string, string> = {}) {
  let next = 0;
  // One chunk per read, then the break: an error raised at once would drop the queue.
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (next < chunks.length) {
        const chunk = chunks[next++];
        controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
        return;
      }
      if (cut) controller.error(new TypeError("terminated: other side closed"));
      else controller.close();
    },
  });
  return new Response(body, {
    status,
    headers: { "content-type": "text/event-stream", ...headers },
  });
}

function json(status: number, payload: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** fetch answers with the planned responses in order and keeps every request. */
function plan(...steps: (() => Response)[]) {
  const calls: { url: string; init: RequestInit; at: number }[] = [];
  const fetchMock = jest.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init, at: Date.now() });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    return step();
  });
  (globalThis as any).fetch = fetchMock;
  return calls;
}

const client = () => new FlyMyAI({ apiKey: "fly-test", baseUrl: "https://api.test/api/v1" });

async function drain(gen: AsyncGenerator<any>) {
  const out: string[] = [];
  for await (const item of gen) out.push(item.output_data.output[0]);
  return out;
}

describe("retries like the official OpenAI and Anthropic SDKs", () => {
  test("a stream cut before its first event is sent again", async () => {
    const calls = plan(() => sse([], true), () => sse([CHUNK_1, CHUNK_2]));
    expect(await drain(client().stream({ prompt: "hi" }, "owner/project"))).toEqual(["Hel", "lo"]);
    expect(calls).toHaveLength(2);
  });

  test("a stream cut after its first event is never sent again", async () => {
    const calls = plan(() => sse([CHUNK_1], true), () => sse([CHUNK_1, CHUNK_2]));
    const received: string[] = [];
    let caught: unknown;
    try {
      for await (const item of client().stream<any>({ prompt: "hi" }, "owner/project")) {
        received.push(item.output_data.output[0]);
      }
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(FlyMyAIStreamInterrupted);
    expect((caught as FlyMyAIStreamInterrupted).eventsReceived).toBe(1);
    expect(received).toEqual(["Hel"]);
    expect(calls).toHaveLength(1);
  });

  test("503 with x-should-retry: true is sent again", async () => {
    const calls = plan(
      () => json(503, { detail: "busy" }, { "x-should-retry": "true" }),
      () => sse([CHUNK_1, CHUNK_2])
    );
    expect(await drain(client().stream({ prompt: "hi" }, "owner/project"))).toEqual(["Hel", "lo"]);
    expect(calls).toHaveLength(2);
  });

  test("500 with x-should-retry: false is not", async () => {
    const calls = plan(
      () => json(500, { detail: "no" }, { "x-should-retry": "false" }),
      () => sse([CHUNK_1, CHUNK_2])
    );
    await expect(drain(client().stream({ prompt: "hi" }, "owner/project"))).rejects.toMatchObject({
      status: 500,
      name: "FlyMyAIAPIError",
    });
    expect(calls).toHaveLength(1);
  });

  test("retry-after is honoured", async () => {
    const calls = plan(
      () => json(429, { detail: "slow down" }, { "retry-after-ms": "300" }),
      () => sse([CHUNK_1, CHUNK_2])
    );
    expect(await drain(client().stream({ prompt: "hi" }, "owner/project"))).toEqual(["Hel", "lo"]);
    expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(290);
  });

  test("an error event inside a stream raises a typed error", async () => {
    const calls = plan(() => sse([CHUNK_1, ERROR_EVENT]));
    await expect(drain(client().stream({ prompt: "hi" }, "owner/project"))).rejects.toBeInstanceOf(
      FlyMyAIStreamError
    );
    expect(calls).toHaveLength(1);
  });

  test("an error event in the gateway shape (status_code, detail) ends a stream with a typed error", async () => {
    const event = "data: {\"detail\": \"provider failed\", \"status_code\": 502}\n\n";
    const calls = plan(() => sse([CHUNK_1, event]));
    await expect(drain(client().stream({ prompt: "hi" }, "u/p"))).rejects.toBeInstanceOf(FlyMyAIStreamError);
    expect(calls.length).toBe(1);
  });

  test("predict still returns the last event, a gateway error event included (0.2.x contract)", async () => {
    plan(() => sse(["data: {\"detail\": \"Predict is not available for this model\", \"status_code\": 421}\n\n"]));
    const result: any = await client().predict({ prompt: "hi" }, "u/p");
    expect(result.status_code).toBe(421);
  });

  test("a 400 is not sent again", async () => {
    const calls = plan(() => json(400, { detail: "bad input" }));
    await expect(client().predict({ prompt: "hi" }, "owner/project")).rejects.toBeInstanceOf(
      FlyMyAIAPIError
    );
    expect(calls).toHaveLength(1);
  });

  test("a stream ends (no hang) and keeps UTF-8 split across chunks", async () => {
    const text = 'data: {"status": 200, "output_data": {"output": ["Привет"]}}\n\n';
    const bytes = encoder.encode(text);
    const cutAt = bytes.indexOf(0xd0) + 1; // inside a two-byte letter
    plan(() => sse([bytes.slice(0, cutAt), bytes.slice(cutAt)]));
    expect(await drain(client().stream({ prompt: "hi" }, "owner/project"))).toEqual(["Привет"]);
  });

  test("predict: a cut before its event is sent again", async () => {
    const calls = plan(() => sse([], true), () => sse([PREDICT_OK]));
    const result: any = await client().predict({ prompt: "hi" }, "owner/project");
    expect(result.output_data.output).toEqual(["done"]);
    expect(calls).toHaveLength(2);
  });

  test("async submit keeps one Idempotency-Key across attempts", async () => {
    const calls = plan(
      () => json(503, { detail: "busy" }),
      () => json(202, { prediction_id: "pred-async-1" })
    );
    const id = await client().asyncPredict({ prompt: "hi" }, "owner/project");
    expect(id).toBe("pred-async-1");
    const keys = calls.map((c) => new Headers(c.init.headers).get("Idempotency-Key"));
    expect(keys[0]).toBeTruthy();
    expect(keys).toEqual([keys[0], keys[0]]);
  });

  test("async submit: a reused key is not sent again", async () => {
    const calls = plan(() => json(409, { code: "idempotency_key_reused", detail: "used" }));
    await expect(client().asyncPredict({ prompt: "hi" }, "owner/project")).rejects.toMatchObject({
      status: 409,
    });
    expect(calls).toHaveLength(1);
  });
});
