/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol, Iterator */


function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function __values(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
}

function __await(v) {
    return this instanceof __await ? (this.v = v, this) : new __await(v);
}

function __asyncGenerator(thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
}

function __asyncValues(o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

function createParser(onParse) {
  let isFirstChunk;
  let buffer;
  let startingPosition;
  let startingFieldLength;
  let eventId;
  let eventName;
  let data;
  reset();
  return {
    feed,
    reset
  };
  function reset() {
    isFirstChunk = true;
    buffer = "";
    startingPosition = 0;
    startingFieldLength = -1;
    eventId = void 0;
    eventName = void 0;
    data = "";
  }
  function feed(chunk) {
    buffer = buffer ? buffer + chunk : chunk;
    if (isFirstChunk && hasBom(buffer)) {
      buffer = buffer.slice(BOM.length);
    }
    isFirstChunk = false;
    const length = buffer.length;
    let position = 0;
    let discardTrailingNewline = false;
    while (position < length) {
      if (discardTrailingNewline) {
        if (buffer[position] === "\n") {
          ++position;
        }
        discardTrailingNewline = false;
      }
      let lineLength = -1;
      let fieldLength = startingFieldLength;
      let character;
      for (let index = startingPosition; lineLength < 0 && index < length; ++index) {
        character = buffer[index];
        if (character === ":" && fieldLength < 0) {
          fieldLength = index - position;
        } else if (character === "\r") {
          discardTrailingNewline = true;
          lineLength = index - position;
        } else if (character === "\n") {
          lineLength = index - position;
        }
      }
      if (lineLength < 0) {
        startingPosition = length - position;
        startingFieldLength = fieldLength;
        break;
      } else {
        startingPosition = 0;
        startingFieldLength = -1;
      }
      parseEventStreamLine(buffer, position, fieldLength, lineLength);
      position += lineLength + 1;
    }
    if (position === length) {
      buffer = "";
    } else if (position > 0) {
      buffer = buffer.slice(position);
    }
  }
  function parseEventStreamLine(lineBuffer, index, fieldLength, lineLength) {
    if (lineLength === 0) {
      if (data.length > 0) {
        onParse({
          type: "event",
          id: eventId,
          event: eventName || void 0,
          data: data.slice(0, -1)
          // remove trailing newline
        });

        data = "";
        eventId = void 0;
      }
      eventName = void 0;
      return;
    }
    const noValue = fieldLength < 0;
    const field = lineBuffer.slice(index, index + (noValue ? lineLength : fieldLength));
    let step = 0;
    if (noValue) {
      step = lineLength;
    } else if (lineBuffer[index + fieldLength + 1] === " ") {
      step = fieldLength + 2;
    } else {
      step = fieldLength + 1;
    }
    const position = index + step;
    const valueLength = lineLength - step;
    const value = lineBuffer.slice(position, position + valueLength).toString();
    if (field === "data") {
      data += value ? "".concat(value, "\n") : "\n";
    } else if (field === "event") {
      eventName = value;
    } else if (field === "id" && !value.includes("\0")) {
      eventId = value;
    } else if (field === "retry") {
      const retry = parseInt(value, 10);
      if (!Number.isNaN(retry)) {
        onParse({
          type: "reconnect-interval",
          value: retry
        });
      }
    }
  }
}
const BOM = [239, 187, 191];
function hasBom(buffer) {
  return BOM.every((charCode, index) => buffer.charCodeAt(index) === charCode);
}

class OpenAPISchemaResponse {
    constructor(response, data) {
        this._response = response;
        this.exc_history = data.exc_history;
        this.openapi_schema = data.openapi_schema;
        this.status = data.status;
    }
    get response() {
        return this._response;
    }
    static fromResponse(response) {
        return __awaiter(this, void 0, void 0, function* () {
            const status_code = response.status;
            const response_json = yield response.json();
            response_json["status"] = response_json["status"] || status_code;
            return new OpenAPISchemaResponse(response, response_json);
        });
    }
}
class FlyMyAIError extends Error {
    constructor(message) {
        super(message);
        this.name = "FlyMyAIError";
    }
}
/** An HTTP error status that was not (or no longer) worth another attempt. */
class FlyMyAIAPIError extends FlyMyAIError {
    constructor(message, status, body, headers) {
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
    constructor(message, eventsReceived, data) {
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
    constructor(message, eventsReceived, cause) {
        super(message);
        this.name = "FlyMyAIStreamInterrupted";
        this.eventsReceived = eventsReceived;
        this.cause = cause;
    }
}
/** An SSE event whose data is not JSON: a malformed answer, not a broken connection. */
class FlyMyAISSEParseError extends FlyMyAIError {
    constructor(message) {
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
function shouldRetryStatus(status, headers, body) {
    const header = (headers.get("x-should-retry") || "").trim().toLowerCase();
    if (header === "true")
        return true;
    if (header === "false")
        return false;
    try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === "object") {
            if (parsed.retry_safe === false)
                return false;
            if (FINAL_CONFLICT_CODES.includes(parsed.code))
                return false;
        }
    }
    catch (_) {
        // not JSON
    }
    return status === 408 || status === 409 || status === 429 || status >= 500;
}
function retryAfterMs(headers) {
    if (!headers)
        return null;
    const ms = Number.parseFloat(headers.get("retry-after-ms") || "");
    if (Number.isFinite(ms))
        return ms;
    const raw = headers.get("retry-after");
    if (!raw)
        return null;
    const seconds = Number.parseFloat(raw);
    if (Number.isFinite(seconds))
        return seconds * 1000;
    const date = Date.parse(raw);
    return Number.isFinite(date) ? date - Date.now() : null;
}
function retryDelayMs(retriesDone, headers) {
    const serverWait = retryAfterMs(headers);
    if (serverWait !== null && serverWait > 0 && serverWait <= MAX_RETRY_AFTER_MS) {
        return serverWait;
    }
    const backoff = Math.min(INITIAL_RETRY_DELAY_MS * Math.pow(2, Math.max(retriesDone, 0)), MAX_RETRY_DELAY_MS);
    return backoff * (1 - 0.25 * Math.random());
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function newIdempotencyKey() {
    const cryptoObj = globalThis.crypto;
    if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
        return `flymyai-js-${cryptoObj.randomUUID()}`;
    }
    const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    return `flymyai-js-${hex}`;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
/** A data event that reports an error (status >= 400, or details on a 200). */
function isErrorEvent(data) {
    if (!data || typeof data !== "object")
        return false;
    // "status" and "details" in the pods' events, "status_code" and "detail" in the
    // gateway's error events (predict on a streaming model answers 200 with one).
    const status = typeof data.status === "number"
        ? data.status
        : typeof data.status_code === "number"
            ? data.status_code
            : 200;
    return status >= 400 || data.details != null;
}
class FlyMyAI {
    constructor(config) {
        var _a, _b;
        this.baseUrl = "https://api.flymy.ai/api/v1";
        if (!config.apiKey) {
            throw new FlyMyAIError("API key not found. Please provide a valid API key.");
        }
        this.apiKey = config.apiKey;
        this.maxRetries = (_a = config.maxRetries) !== null && _a !== void 0 ? _a : DEFAULT_MAX_RETRIES;
        this.timeout = (_b = config.timeout) !== null && _b !== void 0 ? _b : DEFAULT_TIMEOUT_MS;
        if (config.baseUrl)
            this.baseUrl = config.baseUrl.replace(/\/$/, "");
    }
    /**
     * One request with the retry policy. Returns the response once its headers arrived
     * with an accepted status; the body is the caller's. An attempt that times out is
     * aborted before the next one starts, so two attempts never run at once.
     */
    _send(url_1, init_1) {
        return __awaiter(this, arguments, void 0, function* (url, init, options = {}) {
            var _a, _b, _c, _d, _e, _f, _g;
            const maxRetries = (_a = options.maxRetries) !== null && _a !== void 0 ? _a : this.maxRetries;
            const accept = (_b = options.accept) !== null && _b !== void 0 ? _b : ((status) => status >= 200 && status < 300);
            for (let attempt = 0;; attempt++) {
                if ((_c = options.signal) === null || _c === void 0 ? void 0 : _c.aborted)
                    throw new FlyMyAIError("Request aborted");
                const controller = new AbortController();
                const onAbort = () => controller.abort();
                (_d = options.signal) === null || _d === void 0 ? void 0 : _d.addEventListener("abort", onAbort);
                const timer = setTimeout(() => controller.abort(), this.timeout);
                let response;
                try {
                    response = yield fetch(url, Object.assign(Object.assign({}, init), { signal: controller.signal }));
                }
                catch (error) {
                    clearTimeout(timer);
                    (_e = options.signal) === null || _e === void 0 ? void 0 : _e.removeEventListener("abort", onAbort);
                    if ((_f = options.signal) === null || _f === void 0 ? void 0 : _f.aborted)
                        throw new FlyMyAIError("Request aborted");
                    if (attempt < maxRetries) {
                        yield sleep(retryDelayMs(attempt));
                        continue;
                    }
                    throw new FlyMyAIError(`Request failed after ${attempt + 1} attempt(s): ${errorMessage(error)}`);
                }
                clearTimeout(timer);
                if (accept(response.status)) {
                    return response;
                }
                (_g = options.signal) === null || _g === void 0 ? void 0 : _g.removeEventListener("abort", onAbort);
                const body = yield response.text().catch(() => "");
                if (attempt < maxRetries && shouldRetryStatus(response.status, response.headers, body)) {
                    yield sleep(retryDelayMs(attempt, response.headers));
                    continue;
                }
                throw new FlyMyAIAPIError(`Request failed: ${response.status} ${response.statusText}. Body: ${body}`, response.status, body, response.headers);
            }
        });
    }
    _headers(accept, extra = {}) {
        return new Headers(Object.assign({ "x-api-key": this.apiKey, accept }, extra));
    }
    _formData(payload) {
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
    asyncPredict(payload_1, model_1) {
        return __awaiter(this, arguments, void 0, function* (payload, model, options = {}) {
            this._validateModelFormat(model);
            const [user, modelName] = model.split("/");
            const preparedPayload = yield this._preparePayload(payload);
            // One key for every attempt: a submit sent again after a lost answer replays
            // the first job instead of starting a second paid one.
            const headers = this._headers("application/json", {
                "Idempotency-Key": options.idempotencyKey || newIdempotencyKey(),
            });
            const response = yield this._send(`${this.baseUrl}/${user}/${modelName}/predict/async/`, { method: "POST", headers, body: this._formData(preparedPayload) }, { accept: (status) => status === 202 || status === 200 });
            const responseData = yield response.json();
            if (!responseData.prediction_id) {
                throw new FlyMyAIError("Missing prediction_id in response");
            }
            return responseData.prediction_id;
        });
    }
    /**
     * Проверяет статус асинхронного запроса
     * @param model Модель в формате "user/modelName"
     * @param prediction_id Идентификатор запроса
     * @param signal Сигнал для отмены запроса
     * @returns Результат или статус pending
     */
    checkAsyncResult(model, prediction_id, signal) {
        return __awaiter(this, void 0, void 0, function* () {
            this._validateModelFormat(model);
            const [user, modelName] = model.split("/");
            const url = new URL(`${this.baseUrl}/${user}/${modelName}/predict/async/result/`);
            url.searchParams.append("request_id", prediction_id);
            const response = yield this._send(url.toString(), { method: "GET", headers: this._headers("application/json") }, { signal, accept: (status) => status === 425 || (status >= 200 && status < 300) });
            if (response.status === 425) {
                return { status: "pending" };
            }
            return yield response.json();
        });
    }
    /**
     * Полный цикл асинхронного предсказания
     * @param payload Данные для предсказания
     * @param model Модель в формате "user/modelName"
     * @param options Настройки { interval: интервал опроса, signal: сигнал отмены, idempotencyKey }
     * @returns Результат предсказания
     */
    predictAsync(payload_1, model_1) {
        return __awaiter(this, arguments, void 0, function* (payload, model, options = {}) {
            var _a, _b, _c;
            const { interval = 5000, signal } = options;
            const predictionId = yield this.asyncPredict(payload, model, {
                idempotencyKey: options.idempotencyKey,
            });
            while (true) {
                if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                    throw new FlyMyAIError("Request aborted");
                const result = yield this.checkAsyncResult(model, predictionId, signal);
                if (result.status === "pending") {
                    yield sleep(interval);
                    continue;
                }
                const inference = (_a = result.inference_responses) === null || _a === void 0 ? void 0 : _a[0];
                if (((_b = inference === null || inference === void 0 ? void 0 : inference.infer_details) === null || _b === void 0 ? void 0 : _b.status) === 200) {
                    return result;
                }
                const errorMessage = ((_c = inference === null || inference === void 0 ? void 0 : inference.response) === null || _c === void 0 ? void 0 : _c.detail) ||
                    (inference === null || inference === void 0 ? void 0 : inference.error) ||
                    "Unknown inference error";
                throw new FlyMyAIError(errorMessage);
            }
        });
    }
    _convertImageToBase64(image) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve(reader.result);
                };
                reader.onerror = () => {
                    reject(new FlyMyAIError("Failed to convert image to base64. Please check the image file."));
                };
                reader.readAsDataURL(image);
            });
        });
    }
    _preparePayload(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof File !== "undefined" &&
                payload.image &&
                payload.image instanceof File) {
                payload.image = yield this._convertImageToBase64(payload.image);
            }
            return payload;
        });
    }
    _createConnection(payload_1, model_1) {
        return __awaiter(this, arguments, void 0, function* (payload, model, stream = false) {
            this._validateModelFormat(model);
            const [user, modelName] = model.split("/");
            const preparedPayload = yield this._preparePayload(payload);
            return this._send(`${this.baseUrl}/${user}/${modelName}/predict${stream ? "/stream/" : ""}`, {
                method: "POST",
                headers: this._headers(stream ? "text/event-stream" : "application/json"),
                body: this._formData(preparedPayload),
            });
        });
    }
    _validateModelFormat(model) {
        if (!model.includes("/")) {
            throw new FlyMyAIError('Model must be in the format "user/modelName".');
        }
    }
    /** Kept for callers of 0.2.x: `retries` is the number of attempts, as before. */
    _createConnectionWithRetries(payload_1, model_1) {
        return __awaiter(this, arguments, void 0, function* (payload, model, stream = false, retries = 3) {
            this._validateModelFormat(model);
            const [user, modelName] = model.split("/");
            const preparedPayload = yield this._preparePayload(payload);
            return this._send(`${this.baseUrl}/${user}/${modelName}/predict${stream ? "/stream/" : ""}`, {
                method: "POST",
                headers: this._headers(stream ? "text/event-stream" : "application/json"),
                body: this._formData(preparedPayload),
            }, { maxRetries: Math.max(retries - 1, 0) });
        });
    }
    /** The SSE data events of one response, parsed as they arrive (UTF-8 safe). */
    _events(response) {
        return __asyncGenerator(this, arguments, function* _events_1() {
            var _a;
            const reader = (_a = response.body) === null || _a === void 0 ? void 0 : _a.getReader();
            if (!reader) {
                throw new FlyMyAIError("Failed to read response stream");
            }
            const decoder = new TextDecoder("utf-8");
            const queue = [];
            const parser = createParser((event) => {
                if (event.type === "event")
                    queue.push(event.data);
            });
            let finished = false;
            try {
                while (true) {
                    const { done, value } = yield __await(reader.read());
                    if (done) {
                        parser.feed(decoder.decode());
                    }
                    else {
                        parser.feed(decoder.decode(value, { stream: true }));
                    }
                    while (queue.length) {
                        const data = queue.shift();
                        let parsed;
                        try {
                            parsed = JSON.parse(data);
                        }
                        catch (_) {
                            throw new FlyMyAISSEParseError(`Failed to parse SSE data: ${data}`);
                        }
                        yield yield __await(parsed);
                    }
                    if (done) {
                        finished = true;
                        return yield __await(void 0);
                    }
                }
            }
            finally {
                if (!finished) {
                    // The caller stopped early or the read failed: let the connection go.
                    yield __await(reader.cancel().catch(() => undefined));
                }
                reader.releaseLock();
            }
        });
    }
    predict(payload, model) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, e_1, _b, _c;
            // A response cut before its event is sent again (nothing reached the caller);
            // once the event is here, it is the answer, as before.
            for (let attempt = 0;; attempt++) {
                const response = yield this._createConnection(payload, model);
                const events = [];
                let readError = null;
                try {
                    try {
                        for (var _d = true, _e = (e_1 = void 0, __asyncValues(this._events(response))), _f; _f = yield _e.next(), _a = _f.done, !_a; _d = true) {
                            _c = _f.value;
                            _d = false;
                            const event = _c;
                            events.push(event);
                        }
                    }
                    catch (e_1_1) { e_1 = { error: e_1_1 }; }
                    finally {
                        try {
                            if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
                        }
                        finally { if (e_1) throw e_1.error; }
                    }
                }
                catch (error) {
                    if (error instanceof FlyMyAISSEParseError)
                        throw error;
                    readError = error;
                }
                if (events.length) {
                    // The last event, as before (an error event too: its status says so).
                    return events[events.length - 1];
                }
                if (attempt < this.maxRetries) {
                    yield sleep(retryDelayMs(attempt));
                    continue;
                }
                if (readError) {
                    throw new FlyMyAIError(`Prediction failed: ${errorMessage(readError)}`);
                }
                throw new FlyMyAIError("No valid data events found in response");
            }
        });
    }
    _createStream(response) {
        return __awaiter(this, void 0, void 0, function* () {
            // Kept for callers of 0.2.x: the data of every event, encoded, then the end.
            const encoder = new TextEncoder();
            const events = this._events(response);
            return new ReadableStream({
                pull(controller) {
                    return __awaiter(this, void 0, void 0, function* () {
                        const { done, value } = yield events.next();
                        if (done) {
                            controller.close();
                        }
                        else {
                            controller.enqueue(encoder.encode(JSON.stringify(value)));
                        }
                    });
                },
            });
        });
    }
    /**
     * The stream's data events. Sent again only before its first event (a connection
     * error, or a status the retry policy allows); after that a broken connection
     * throws FlyMyAIStreamInterrupted and an error event FlyMyAIStreamError.
     */
    stream(payload, model) {
        return __asyncGenerator(this, arguments, function* stream_1() {
            var _a, e_2, _b, _c;
            let received = 0;
            for (let attempt = 0;; attempt++) {
                const response = yield __await(this._createConnection(payload, model, true));
                try {
                    try {
                        for (var _d = true, _e = (e_2 = void 0, __asyncValues(this._events(response))), _f; _f = yield __await(_e.next()), _a = _f.done, !_a; _d = true) {
                            _c = _f.value;
                            _d = false;
                            const event = _c;
                            received += 1;
                            if (isErrorEvent(event)) {
                                throw new FlyMyAIStreamError(`Stream error: ${JSON.stringify(event)}`, received, event);
                            }
                            yield yield __await(event);
                        }
                    }
                    catch (e_2_1) { e_2 = { error: e_2_1 }; }
                    finally {
                        try {
                            if (!_d && !_a && (_b = _e.return)) yield __await(_b.call(_e));
                        }
                        finally { if (e_2) throw e_2.error; }
                    }
                }
                catch (error) {
                    if (error instanceof FlyMyAIStreamError || error instanceof FlyMyAISSEParseError) {
                        throw error;
                    }
                    if (received > 0) {
                        throw new FlyMyAIStreamInterrupted(`The stream broke after ${received} event(s): ${errorMessage(error)}.` +
                            " It is not sent again automatically.", received, error);
                    }
                    if (attempt < this.maxRetries) {
                        yield __await(sleep(retryDelayMs(attempt)));
                        continue;
                    }
                    throw new FlyMyAIError(`Streaming failed: ${errorMessage(error)}`);
                }
                if (received === 0 && attempt < this.maxRetries) {
                    // Closed before its first event: nothing reached the caller.
                    yield __await(sleep(retryDelayMs(attempt)));
                    continue;
                }
                return yield __await(void 0);
            }
        });
    }
    openapiSchema() {
        return __awaiter(this, arguments, void 0, function* (model = "", max_retries = 3) {
            const [user, modelName] = model.split("/");
            const url = `${this.baseUrl}/${user}/${modelName}/openapi-schema`;
            try {
                const response = yield this._send(url, { method: "GET", headers: this._headers("application/json") }, { maxRetries: Math.max(max_retries - 1, 0) });
                return yield OpenAPISchemaResponse.fromResponse(response);
            }
            catch (error) {
                throw new FlyMyAIError(`Failed to fetch OpenAPI schema after ${max_retries} attempts: ${errorMessage(error)}`);
            }
        });
    }
}

export { FlyMyAI, FlyMyAIAPIError, FlyMyAIError, FlyMyAIStreamError, FlyMyAIStreamInterrupted };
