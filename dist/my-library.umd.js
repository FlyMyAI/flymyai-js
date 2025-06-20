(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global["flymyai-js-client"] = {}));
})(this, (function (exports) { 'use strict';

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
    class FlyMyAI {
        constructor(config) {
            this.baseUrl = "https://api.flymy.ai/api/v1";
            if (!config.apiKey) {
                throw new FlyMyAIError("API key not found. Please provide a valid API key.");
            }
            this.apiKey = config.apiKey;
        }
        /**
         * Создает асинхронный запрос предсказания
         * @param payload Данные для предсказания
         * @param model Модель в формате "user/modelName"
         * @returns prediction_id идентификатор запроса
         */
        asyncPredict(payload, model) {
            return __awaiter(this, void 0, void 0, function* () {
                this._validateModelFormat(model);
                const [user, modelName] = model.split("/");
                const preparedPayload = yield this._preparePayload(payload);
                const formData = new FormData();
                for (const key in preparedPayload) {
                    formData.append(key, preparedPayload[key]);
                }
                const headers = new Headers({
                    "x-api-key": this.apiKey,
                    accept: "application/json",
                });
                const response = yield fetch(`${this.baseUrl}/${user}/${modelName}/predict/async/`, {
                    method: "POST",
                    headers,
                    body: formData,
                });
                if (response.status !== 202) {
                    const errorBody = yield response.text();
                    throw new FlyMyAIError(`Async prediction failed: ${response.status} ${response.statusText}. Body: ${errorBody}`);
                }
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
                const headers = new Headers({
                    "x-api-key": this.apiKey,
                    accept: "application/json",
                });
                const url = new URL(`${this.baseUrl}/${user}/${modelName}/predict/async/result/`);
                url.searchParams.append("request_id", prediction_id);
                const response = yield fetch(url.toString(), {
                    method: "GET",
                    headers,
                    signal,
                });
                if (response.status === 425) {
                    return { status: "pending" };
                }
                if (!response.ok) {
                    const errorBody = yield response.text();
                    throw new FlyMyAIError(`Async check failed: ${response.status} ${response.statusText}. Body: ${errorBody}`);
                }
                return yield response.json();
            });
        }
        /**
         * Полный цикл асинхронного предсказания
         * @param payload Данные для предсказания
         * @param model Модель в формате "user/modelName"
         * @param options Настройки { interval: интервал опроса, signal: сигнал отмены }
         * @returns Результат предсказания
         */
        predictAsync(payload_1, model_1) {
            return __awaiter(this, arguments, void 0, function* (payload, model, options = {}) {
                var _a, _b, _c;
                const { interval = 5000, signal } = options;
                const predictionId = yield this.asyncPredict(payload, model);
                while (true) {
                    if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                        throw new FlyMyAIError("Request aborted");
                    const result = yield this.checkAsyncResult(model, predictionId, signal);
                    if (result.status === "pending") {
                        yield new Promise((resolve) => setTimeout(resolve, interval));
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
                if (payload.image && payload.image instanceof File) {
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
                const formData = new FormData();
                for (const key in preparedPayload) {
                    formData.append(key, payload[key]);
                }
                const headers = new Headers({
                    "x-api-key": this.apiKey,
                    accept: stream ? "text/event-stream" : "application/json",
                });
                const response = yield fetch(`${this.baseUrl}/${user}/${modelName}/predict${stream ? "/stream/" : ""}`, {
                    method: "POST",
                    headers,
                    body: formData,
                });
                if (!response.ok) {
                    const errorBody = yield response.text();
                    throw new FlyMyAIError(`Request failed: ${response.status} ${response.statusText}. Body: ${errorBody}`);
                }
                return response;
            });
        }
        _validateModelFormat(model) {
            if (!model.includes("/")) {
                throw new FlyMyAIError('Model must be in the format "user/modelName".');
            }
        }
        _createConnectionWithRetries(payload_1, model_1) {
            return __awaiter(this, arguments, void 0, function* (payload, model, stream = false, retries = 3, timeout = 10000) {
                for (let attempt = 0; attempt < retries; attempt++) {
                    try {
                        const responsePromise = this._createConnection(payload, model, stream);
                        const response = yield Promise.race([
                            responsePromise,
                            new Promise((_, reject) => setTimeout(() => reject(new FlyMyAIError("Request timed out")), timeout)),
                        ]);
                        return response;
                    }
                    catch (error) {
                        let errorMessage = "Unknown error occurred";
                        if (error instanceof Error) {
                            errorMessage = error.message;
                        }
                        if (attempt === retries - 1) {
                            throw new FlyMyAIError(`Failed after ${retries} attempts: ${errorMessage}`);
                        }
                        console.log(`Attempt ${attempt + 1} failed: ${errorMessage}. Retrying...`);
                    }
                }
                throw new FlyMyAIError("Maximum retry attempts reached");
            });
        }
        predict(payload, model) {
            return __awaiter(this, void 0, void 0, function* () {
                var _a;
                try {
                    const response = yield this._createConnection(payload, model);
                    // Если ответ приходит как SSE (даже для обычных запросов)
                    const reader = (_a = response.body) === null || _a === void 0 ? void 0 : _a.getReader();
                    const decoder = new TextDecoder("utf-8");
                    let result = "";
                    if (!reader) {
                        throw new FlyMyAIError("Failed to read response stream");
                    }
                    while (true) {
                        const { done, value } = yield reader.read();
                        if (done)
                            break;
                        result += decoder.decode(value);
                    }
                    // Извлекаем данные из SSE формата
                    const jsonData = result
                        .split("\n")
                        .filter((line) => line.startsWith("data:"))
                        .map((line) => {
                        try {
                            return JSON.parse(line.replace(/^data:\s*/, ""));
                        }
                        catch (e) {
                            throw new FlyMyAIError(`Failed to parse SSE data: ${line}`);
                        }
                    });
                    if (jsonData.length === 0) {
                        throw new FlyMyAIError("No valid data events found in response");
                    }
                    // Возвращаем последнее событие (или обрабатываем все)
                    return jsonData[jsonData.length - 1];
                }
                catch (error) {
                    if (error instanceof FlyMyAIError) {
                        throw error;
                    }
                    if (error instanceof Error) {
                        throw new FlyMyAIError(`Prediction failed: ${error.message}`);
                    }
                    else {
                        throw new FlyMyAIError("Prediction failed due to an unknown error.");
                    }
                }
            });
        }
        _createStream(response) {
            return __awaiter(this, void 0, void 0, function* () {
                const encoder = new TextEncoder();
                const decoder = new TextDecoder();
                const readableStream = new ReadableStream({
                    start(controller) {
                        return __awaiter(this, void 0, void 0, function* () {
                            var _a, e_1, _b, _c;
                            const onParse = (event) => {
                                if (event.type === "event") {
                                    const data = event.data;
                                    controller.enqueue(encoder.encode(data));
                                }
                            };
                            if (response.status !== 200) {
                                const data = {
                                    status: response.status,
                                    statusText: response.statusText,
                                    body: yield response.text(),
                                };
                                console.log(`Error: received non-200 status code, ${JSON.stringify(data)}`);
                                controller.close();
                                return;
                            }
                            const parser = createParser(onParse);
                            try {
                                for (var _d = true, _e = __asyncValues(response.body), _f; _f = yield _e.next(), _a = _f.done, !_a; _d = true) {
                                    _c = _f.value;
                                    _d = false;
                                    const chunk = _c;
                                    parser.feed(decoder.decode(chunk, { stream: true }));
                                }
                            }
                            catch (e_1_1) { e_1 = { error: e_1_1 }; }
                            finally {
                                try {
                                    if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
                                }
                                finally { if (e_1) throw e_1.error; }
                            }
                        });
                    },
                });
                return readableStream;
            });
        }
        stream(payload, model) {
            return __asyncGenerator(this, arguments, function* stream_1() {
                try {
                    const response = yield __await(this._createConnectionWithRetries(payload, model, true));
                    const stream = yield __await(this._createStream(response));
                    const reader = stream.getReader();
                    try {
                        while (true) {
                            const { done, value } = yield __await(reader.read());
                            if (done)
                                break;
                            yield yield __await(JSON.parse(String.fromCharCode(...value)));
                        }
                    }
                    finally {
                        reader.releaseLock();
                    }
                }
                catch (error) {
                    if (error instanceof Error) {
                        throw new FlyMyAIError(`Streaming failed: ${error.message}`);
                    }
                    else {
                        throw new FlyMyAIError("Streaming failed due to an unknown error.");
                    }
                }
            });
        }
        openapiSchema() {
            return __awaiter(this, arguments, void 0, function* (model = "", max_retries = 3) {
                const [user, modelName] = model.split("/");
                const url = `${this.baseUrl}/${user}/${modelName}/openapi-schema`;
                for (let attempt = 0; attempt < max_retries; attempt++) {
                    try {
                        const response = yield fetch(url, {
                            method: "GET",
                            headers: {
                                accept: "application/json",
                                "x-api-key": this.apiKey,
                            },
                        });
                        if (!response.ok) {
                            throw new FlyMyAIError(`Failed to fetch OpenAPI schema. Server responded with status: ${response.statusText}`);
                        }
                        const schemaResponse = yield OpenAPISchemaResponse.fromResponse(response);
                        return schemaResponse;
                    }
                    catch (error) {
                        if (attempt === max_retries - 1) {
                            if (error instanceof Error) {
                                throw new FlyMyAIError(`Failed to fetch OpenAPI schema after ${max_retries} attempts: ${error.message}`);
                            }
                            else {
                                throw new FlyMyAIError("Failed to fetch OpenAPI schema after maximum retries due to an unknown error.");
                            }
                        }
                    }
                }
                throw new FlyMyAIError("Failed to fetch OpenAPI schema after maximum retries.");
            });
        }
    }

    exports.FlyMyAI = FlyMyAI;
    exports.FlyMyAIError = FlyMyAIError;

}));
