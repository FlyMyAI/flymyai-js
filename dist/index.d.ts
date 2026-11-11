import "tslib";
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
declare class OpenAPISchemaResponse {
    exc_history?: any[];
    openapi_schema: Record<string, any>;
    status: number;
    private _response;
    constructor(response: FlyMyAIResponse, data: any);
    get response(): FlyMyAIResponse;
    static fromResponse(response: FlyMyAIResponse): Promise<OpenAPISchemaResponse>;
}
declare class FlyMyAIError extends Error {
    constructor(message: string);
}
/** An HTTP error status that was not (or no longer) worth another attempt. */
declare class FlyMyAIAPIError extends FlyMyAIError {
    status: number;
    body: string;
    headers: Headers;
    constructor(message: string, status: number, body: string, headers: Headers);
}
/**
 * The server reported an error inside a stream that had already started (an SSE event
 * with an error status after HTTP 200). Not sent again: the request reached the model.
 */
declare class FlyMyAIStreamError extends FlyMyAIError {
    eventsReceived: number;
    data: any;
    constructor(message: string, eventsReceived: number, data: any);
}
/**
 * The connection broke after the stream had delivered at least one event. The SDK
 * never sends such a stream again by itself (the model may still be running, and a
 * second run would repeat the output and its cost), as the official OpenAI and
 * Anthropic SDKs do not; retry yourself if a second run is acceptable.
 */
declare class FlyMyAIStreamInterrupted extends FlyMyAIError {
    eventsReceived: number;
    cause?: unknown;
    constructor(message: string, eventsReceived: number, cause?: unknown);
}
declare class FlyMyAI {
    private apiKey;
    private baseUrl;
    private maxRetries;
    private timeout;
    constructor(config: FlyMyAIConfig);
    /**
     * One request with the retry policy. Returns the response once its headers arrived
     * with an accepted status; the body is the caller's. An attempt that times out is
     * aborted before the next one starts, so two attempts never run at once.
     */
    _send(url: string, init: RequestInit, options?: {
        signal?: AbortSignal;
        accept?: (status: number) => boolean;
        maxRetries?: number;
    }): Promise<Response>;
    private _headers;
    private _formData;
    /**
     * Создает асинхронный запрос предсказания
     * @param payload Данные для предсказания
     * @param model Модель в формате "user/modelName"
     * @param options { idempotencyKey } один ключ на все попытки (по умолчанию новый)
     * @returns prediction_id идентификатор запроса
     */
    asyncPredict(payload: any, model: string, options?: {
        idempotencyKey?: string;
    }): Promise<string>;
    /**
     * Проверяет статус асинхронного запроса
     * @param model Модель в формате "user/modelName"
     * @param prediction_id Идентификатор запроса
     * @param signal Сигнал для отмены запроса
     * @returns Результат или статус pending
     */
    checkAsyncResult(model: string, prediction_id: string, signal?: AbortSignal): Promise<any>;
    /**
     * Полный цикл асинхронного предсказания
     * @param payload Данные для предсказания
     * @param model Модель в формате "user/modelName"
     * @param options Настройки { interval: интервал опроса, signal: сигнал отмены, idempotencyKey }
     * @returns Результат предсказания
     */
    predictAsync<T = any>(payload: any, model: string, options?: AsyncPredictionOptions): Promise<T>;
    private _convertImageToBase64;
    private _preparePayload;
    _createConnection(payload: any, model: string, stream?: boolean): Promise<Response>;
    private _validateModelFormat;
    /** Kept for callers of 0.2.x: `retries` is the number of attempts, as before. */
    _createConnectionWithRetries(payload: any, model: string, stream?: boolean, retries?: number): Promise<Response>;
    /** The SSE data events of one response, parsed as they arrive (UTF-8 safe). */
    private _events;
    predict<T = PredictionResult>(payload: any, model: string): Promise<T>;
    _createStream(response: Response): Promise<ReadableStream>;
    /**
     * The stream's data events. Sent again only before its first event (a connection
     * error, or a status the retry policy allows); after that a broken connection
     * throws FlyMyAIStreamInterrupted and an error event FlyMyAIStreamError.
     */
    stream<T>(payload: any, model: string): AsyncGenerator<T>;
    openapiSchema(model?: string, max_retries?: number): Promise<OpenAPISchemaResponse>;
}
export { FlyMyAI, FlyMyAIError, FlyMyAIAPIError, FlyMyAIStreamError, FlyMyAIStreamInterrupted, };
