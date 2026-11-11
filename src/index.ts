import "tslib";
import { createParser, ParsedEvent, ReconnectInterval } from "eventsource-parser";

interface FlyMyAIConfig {
  apiKey: string;
  /** Extra attempts for a request that failed before its answer started (default 2). */
  maxRetries?: number;
  /** Milliseconds to wait for the response headers of one attempt (default 600000). */
  timeout?: number;
  /** API root (default https://api.flymy.ai/api/v1). */
  baseUrl?: string;
}

interface FlyMyAIResponse {
  status: number;
  json: () => Promise<any>;
}

export interface PredictionResult {
  output_data?: {
    output: string[];
  };
  [key: string]: any;
}

export interface AsyncPredictionResult {
  inference_responses?: Array<{
    infer_details: {
      status: number;
      inference_time?: number;
    };
    response: {
      detail?: string;
      [key: string]: any;
    };
    [key: string]: any;
  }>;
  [key: string]: any;
}

interface AsyncPredictionOptions {
  interval?: number;
  signal?: AbortSignal;
  /** Reused on every attempt so a repeated submit replays the first job. */
  idempotencyKey?: string;
}

class OpenAPISchemaResponse {
  exc_history?: any[];
  openapi_schema: Record<string, any>;
  status: number;
  private _response: FlyMyAIResponse;

  constructor(response: FlyMyAIResponse, data: any) {
    this._response = response;
    this.exc_history = data.exc_history;
    this.openapi_schema = data.openapi_schema;
    this.status = data.status;
  }

  get response() {
    return this._response;
  }

  static async fromResponse(
    response: FlyMyAIResponse
  ): Promise<OpenAPISchemaResponse> {
    const status_code = response.status;
    const response_json = await response.json();
    response_json["status"] = response_json["status"] || status_code;
    return new OpenAPISchemaResponse(response, response_json);
  }
}

class FlyMyAIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlyMyAIError";
  }
}

/** An HTTP error status that was not (or no longer) worth another attempt. */
class FlyMyAIAPIError extends FlyMyAIError {
  status: number;
  body: string;
  headers: Headers;

  constructor(message: string, status: number, body: string, headers: Headers) {
    super(message);
    this.name = "FlyMyAIAPIError";
    this.status = status;
    this.body = body;
    this.headers = headers;
  }
}

/**
 * The server reported an error inside a stream that had already started (an SSE event
 * with an error status after HTTP 200). Not sent again: the request reached the model.
 */
class FlyMyAIStreamError extends FlyMyAIError {
  eventsReceived: number;
  data: any;

  constructor(message: string, eventsReceived: number, data: any) {
    super(message);
    this.name = "FlyMyAIStreamError";
    this.eventsReceived = eventsReceived;
    this.data = data;
  }
}

/**
 * The connection broke after the stream had delivered at least one event. The SDK
 * never sends such a stream again by itself (the model may still be running, and a
 * second run would repeat the output and its cost), as the official OpenAI and
 * Anthropic SDKs do not; retry yourself if a second run is acceptable.
 */
class FlyMyAIStreamInterrupted extends FlyMyAIError {
  eventsReceived: number;
  cause?: unknown;

  constructor(message: string, eventsReceived: number, cause?: unknown) {
    super(message);
    this.name = "FlyMyAIStreamInterrupted";
    this.eventsReceived = eventsReceived;
    this.cause = cause;
  }
}

/** An SSE event whose data is not JSON: a malformed answer, not a broken connection. */
class FlyMyAISSEParseError extends FlyMyAIError {
  constructor(message: string) {
    super(message);
    this.name = "FlyMyAISSEParseError";
  }
}

// The retry policy of the official OpenAI and Anthropic SDKs: another attempt only
// before the answer started; the server decides with `x-should-retry` (or a JSON body
// with "retry_safe": false); otherwise 408, 409, 429 and every status from 500 retry;
// the wait honours `retry-after-ms` / `retry-after` up to two minutes, else
// exponential backoff from 0.5 s to 8 s less up to 25%.
const INITIAL_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8000;
const MAX_RETRY_AFTER_MS = 120000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 600000;
const FINAL_CONFLICT_CODES = ["idempotency_key_reused", "tool_outcome_unknown"];

function shouldRetryStatus(status: number, headers: Headers, body: string): boolean {
  const header = (headers.get("x-should-retry") || "").trim().toLowerCase();
  if (header === "true") return true;
  if (header === "false") return false;
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      if (parsed.retry_safe === false) return false;
      if (FINAL_CONFLICT_CODES.includes(parsed.code)) return false;
    }
  } catch (_) {
    // not JSON
  }
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function retryAfterMs(headers?: Headers): number | null {
  if (!headers) return null;
  const ms = Number.parseFloat(headers.get("retry-after-ms") || "");
  if (Number.isFinite(ms)) return ms;
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number.parseFloat(raw);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? date - Date.now() : null;
}

function retryDelayMs(retriesDone: number, headers?: Headers): number {
  const serverWait = retryAfterMs(headers);
  if (serverWait !== null && serverWait > 0 && serverWait <= MAX_RETRY_AFTER_MS) {
    return serverWait;
  }
  const backoff = Math.min(
    INITIAL_RETRY_DELAY_MS * Math.pow(2, Math.max(retriesDone, 0)),
    MAX_RETRY_DELAY_MS
  );
  return backoff * (1 - 0.25 * Math.random());
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function newIdempotencyKey(): string {
  const cryptoObj: any = (globalThis as any).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return `flymyai-js-${cryptoObj.randomUUID()}`;
  }
  const hex = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `flymyai-js-${hex}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A data event that reports an error (status >= 400, or details on a 200). */
function isErrorEvent(data: any): boolean {
  if (!data || typeof data !== "object") return false;
  // "status" and "details" in the pods' events, "status_code" and "detail" in the
  // gateway's error events (predict on a streaming model answers 200 with one).
  const status =
    typeof data.status === "number"
      ? data.status
      : typeof data.status_code === "number"
        ? data.status_code
        : 200;
  return status >= 400 || data.details != null;
}

class FlyMyAI {
  private apiKey: string;
  private baseUrl = "https://api.flymy.ai/api/v1";
  private maxRetries: number;
  private timeout: number;

  constructor(config: FlyMyAIConfig) {
    if (!config.apiKey) {
      throw new FlyMyAIError(
        "API key not found. Please provide a valid API key."
      );
    }
    this.apiKey = config.apiKey;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;
    if (config.baseUrl) this.baseUrl = config.baseUrl.replace(/\/$/, "");
  }

  /**
   * One request with the retry policy. Returns the response once its headers arrived
   * with an accepted status; the body is the caller's. An attempt that times out is
   * aborted before the next one starts, so two attempts never run at once.
   */
  async _send(
    url: string,
    init: RequestInit,
    options: {
      signal?: AbortSignal;
      accept?: (status: number) => boolean;
      maxRetries?: number;
    } = {}
  ): Promise<Response> {
    const maxRetries = options.maxRetries ?? this.maxRetries;
    const accept = options.accept ?? ((status: number) => status >= 200 && status < 300);
    for (let attempt = 0; ; attempt++) {
      if (options.signal?.aborted) throw new FlyMyAIError("Request aborted");
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      options.signal?.addEventListener("abort", onAbort);
      const timer = setTimeout(() => controller.abort(), this.timeout);
      let response: Response;
      try {
        response = await fetch(url, { ...init, signal: controller.signal });
      } catch (error) {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        if (options.signal?.aborted) throw new FlyMyAIError("Request aborted");
        if (attempt < maxRetries) {
          await sleep(retryDelayMs(attempt));
          continue;
        }
        throw new FlyMyAIError(
          `Request failed after ${attempt + 1} attempt(s): ${errorMessage(error)}`
        );
      }
      clearTimeout(timer);
      if (accept(response.status)) {
        return response;
      }
      options.signal?.removeEventListener("abort", onAbort);
      const body = await response.text().catch(() => "");
      if (attempt < maxRetries && shouldRetryStatus(response.status, response.headers, body)) {
        await sleep(retryDelayMs(attempt, response.headers));
        continue;
      }
      throw new FlyMyAIAPIError(
        `Request failed: ${response.status} ${response.statusText}. Body: ${body}`,
        response.status,
        body,
        response.headers
      );
    }
  }

  private _headers(accept: string, extra: Record<string, string> = {}): Headers {
    return new Headers({ "x-api-key": this.apiKey, accept, ...extra });
  }

  private _formData(payload: any): FormData {
    const formData = new FormData();
    for (const key in payload) {
      formData.append(key, payload[key]);
    }
    return formData;
  }

  /**
   * Создает асинхронный запрос предсказания
   * @param payload Данные для предсказания
   * @param model Модель в формате "user/modelName"
   * @param options { idempotencyKey } один ключ на все попытки (по умолчанию новый)
   * @returns prediction_id идентификатор запроса
   */
  async asyncPredict(
    payload: any,
    model: string,
    options: { idempotencyKey?: string } = {}
  ): Promise<string> {
    this._validateModelFormat(model);
    const [user, modelName] = model.split("/");
    const preparedPayload = await this._preparePayload(payload);
    // One key for every attempt: a submit sent again after a lost answer replays
    // the first job instead of starting a second paid one.
    const headers = this._headers("application/json", {
      "Idempotency-Key": options.idempotencyKey || newIdempotencyKey(),
    });
    const response = await this._send(
      `${this.baseUrl}/${user}/${modelName}/predict/async/`,
      { method: "POST", headers, body: this._formData(preparedPayload) },
      { accept: (status) => status === 202 || status === 200 }
    );

    const responseData = await response.json();
    if (!responseData.prediction_id) {
      throw new FlyMyAIError("Missing prediction_id in response");
    }

    return responseData.prediction_id;
  }

  /**
   * Проверяет статус асинхронного запроса
   * @param model Модель в формате "user/modelName"
   * @param prediction_id Идентификатор запроса
   * @param signal Сигнал для отмены запроса
   * @returns Результат или статус pending
   */
  async checkAsyncResult(
    model: string,
    prediction_id: string,
    signal?: AbortSignal
  ): Promise<any> {
    this._validateModelFormat(model);
    const [user, modelName] = model.split("/");

    const url = new URL(
      `${this.baseUrl}/${user}/${modelName}/predict/async/result/`
    );
    url.searchParams.append("request_id", prediction_id);

    const response = await this._send(
      url.toString(),
      { method: "GET", headers: this._headers("application/json") },
      { signal, accept: (status) => status === 425 || (status >= 200 && status < 300) }
    );

    if (response.status === 425) {
      return { status: "pending" };
    }

    return await response.json();
  }

  /**
   * Полный цикл асинхронного предсказания
   * @param payload Данные для предсказания
   * @param model Модель в формате "user/modelName"
   * @param options Настройки { interval: интервал опроса, signal: сигнал отмены, idempotencyKey }
   * @returns Результат предсказания
   */
  async predictAsync<T = any>(
    payload: any,
    model: string,
    options: AsyncPredictionOptions = {}
  ): Promise<T> {
    const { interval = 5000, signal } = options;
    const predictionId = await this.asyncPredict(payload, model, {
      idempotencyKey: options.idempotencyKey,
    });

    while (true) {
      if (signal?.aborted) throw new FlyMyAIError("Request aborted");

      const result = await this.checkAsyncResult(model, predictionId, signal);

      if (result.status === "pending") {
        await sleep(interval);
        continue;
      }

      const inference = result.inference_responses?.[0];
      if (inference?.infer_details?.status === 200) {
        return result as T;
      }

      const errorMessage =
        inference?.response?.detail ||
        inference?.error ||
        "Unknown inference error";
      throw new FlyMyAIError(errorMessage);
    }
  }

  private async _convertImageToBase64(image: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => {
        reject(
          new FlyMyAIError(
            "Failed to convert image to base64. Please check the image file."
          )
        );
      };
      reader.readAsDataURL(image);
    });
  }

  private async _preparePayload(payload: any) {
    if (
      typeof File !== "undefined" &&
      payload.image &&
      payload.image instanceof File
    ) {
      payload.image = await this._convertImageToBase64(payload.image);
    }
    return payload;
  }

  async _createConnection(
    payload: any,
    model: string,
    stream: boolean = false
  ): Promise<Response> {
    this._validateModelFormat(model);
    const [user, modelName] = model.split("/");
    const preparedPayload = await this._preparePayload(payload);
    return this._send(
      `${this.baseUrl}/${user}/${modelName}/predict${stream ? "/stream/" : ""}`,
      {
        method: "POST",
        headers: this._headers(stream ? "text/event-stream" : "application/json"),
        body: this._formData(preparedPayload),
      }
    );
  }

  private _validateModelFormat(model: string) {
    if (!model.includes("/")) {
      throw new FlyMyAIError('Model must be in the format "user/modelName".');
    }
  }

  /** Kept for callers of 0.2.x: `retries` is the number of attempts, as before. */
  async _createConnectionWithRetries(
    payload: any,
    model: string,
    stream = false,
    retries: number = 3
  ): Promise<Response> {
    this._validateModelFormat(model);
    const [user, modelName] = model.split("/");
    const preparedPayload = await this._preparePayload(payload);
    return this._send(
      `${this.baseUrl}/${user}/${modelName}/predict${stream ? "/stream/" : ""}`,
      {
        method: "POST",
        headers: this._headers(stream ? "text/event-stream" : "application/json"),
        body: this._formData(preparedPayload),
      },
      { maxRetries: Math.max(retries - 1, 0) }
    );
  }

  /** The SSE data events of one response, parsed as they arrive (UTF-8 safe). */
  private async *_events(response: Response): AsyncGenerator<any> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new FlyMyAIError("Failed to read response stream");
    }
    const decoder = new TextDecoder("utf-8");
    const queue: string[] = [];
    const parser = createParser((event: ParsedEvent | ReconnectInterval) => {
      if (event.type === "event") queue.push(event.data);
    });
    let finished = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          parser.feed(decoder.decode());
        } else {
          parser.feed(decoder.decode(value, { stream: true }));
        }
        while (queue.length) {
          const data = queue.shift() as string;
          let parsed: any;
          try {
            parsed = JSON.parse(data);
          } catch (_) {
            throw new FlyMyAISSEParseError(`Failed to parse SSE data: ${data}`);
          }
          yield parsed;
        }
        if (done) {
          finished = true;
          return;
        }
      }
    } finally {
      if (!finished) {
        // The caller stopped early or the read failed: let the connection go.
        await reader.cancel().catch(() => undefined);
      }
      reader.releaseLock();
    }
  }

  async predict<T = PredictionResult>(payload: any, model: string): Promise<T> {
    // A response cut before its event is sent again (nothing reached the caller);
    // once the event is here, it is the answer, as before.
    for (let attempt = 0; ; attempt++) {
      const response = await this._createConnection(payload, model);
      const events: any[] = [];
      let readError: unknown = null;
      try {
        for await (const event of this._events(response)) {
          events.push(event);
        }
      } catch (error) {
        if (error instanceof FlyMyAISSEParseError) throw error;
        readError = error;
      }
      if (events.length) {
        // The last event, as before (an error event too: its status says so).
        return events[events.length - 1] as T;
      }
      if (attempt < this.maxRetries) {
        await sleep(retryDelayMs(attempt));
        continue;
      }
      if (readError) {
        throw new FlyMyAIError(`Prediction failed: ${errorMessage(readError)}`);
      }
      throw new FlyMyAIError("No valid data events found in response");
    }
  }

  async _createStream(response: Response): Promise<ReadableStream> {
    // Kept for callers of 0.2.x: the data of every event, encoded, then the end.
    const encoder = new TextEncoder();
    const events = this._events(response);
    return new ReadableStream({
      async pull(controller) {
        const { done, value } = await events.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(encoder.encode(JSON.stringify(value)));
        }
      },
    });
  }

  /**
   * The stream's data events. Sent again only before its first event (a connection
   * error, or a status the retry policy allows); after that a broken connection
   * throws FlyMyAIStreamInterrupted and an error event FlyMyAIStreamError.
   */
  async *stream<T>(payload: any, model: string): AsyncGenerator<T> {
    let received = 0;
    for (let attempt = 0; ; attempt++) {
      const response = await this._createConnection(payload, model, true);
      try {
        for await (const event of this._events(response)) {
          received += 1;
          if (isErrorEvent(event)) {
            throw new FlyMyAIStreamError(
              `Stream error: ${JSON.stringify(event)}`,
              received,
              event
            );
          }
          yield event as T;
        }
      } catch (error) {
        if (error instanceof FlyMyAIStreamError || error instanceof FlyMyAISSEParseError) {
          throw error;
        }
        if (received > 0) {
          throw new FlyMyAIStreamInterrupted(
            `The stream broke after ${received} event(s): ${errorMessage(error)}.` +
              " It is not sent again automatically.",
            received,
            error
          );
        }
        if (attempt < this.maxRetries) {
          await sleep(retryDelayMs(attempt));
          continue;
        }
        throw new FlyMyAIError(`Streaming failed: ${errorMessage(error)}`);
      }
      if (received === 0 && attempt < this.maxRetries) {
        // Closed before its first event: nothing reached the caller.
        await sleep(retryDelayMs(attempt));
        continue;
      }
      return;
    }
  }

  async openapiSchema(
    model: string = "",
    max_retries: number = 3
  ): Promise<OpenAPISchemaResponse> {
    const [user, modelName] = model.split("/");
    const url = `${this.baseUrl}/${user}/${modelName}/openapi-schema`;
    try {
      const response = await this._send(
        url,
        { method: "GET", headers: this._headers("application/json") },
        { maxRetries: Math.max(max_retries - 1, 0) }
      );
      return await OpenAPISchemaResponse.fromResponse(response as FlyMyAIResponse);
    } catch (error) {
      throw new FlyMyAIError(
        `Failed to fetch OpenAPI schema after ${max_retries} attempts: ${errorMessage(error)}`
      );
    }
  }
}

export {
  FlyMyAI,
  FlyMyAIError,
  FlyMyAIAPIError,
  FlyMyAIStreamError,
  FlyMyAIStreamInterrupted,
};
