import "tslib";
interface FlyMyAIConfig {
    apiKey: string;
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
declare class FlyMyAI {
    private apiKey;
    private baseUrl;
    constructor(config: FlyMyAIConfig);
    /**
     * Создает асинхронный запрос предсказания
     * @param payload Данные для предсказания
     * @param model Модель в формате "user/modelName"
     * @returns prediction_id идентификатор запроса
     */
    asyncPredict(payload: any, model: string): Promise<string>;
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
     * @param options Настройки { interval: интервал опроса, signal: сигнал отмены }
     * @returns Результат предсказания
     */
    predictAsync<T = any>(payload: any, model: string, options?: {
        interval?: number;
        signal?: AbortSignal;
    }): Promise<T>;
    private _convertImageToBase64;
    private _preparePayload;
    _createConnection(payload: any, model: string, stream?: boolean): Promise<Response>;
    private _validateModelFormat;
    _createConnectionWithRetries(payload: any, model: string, stream?: boolean, retries?: number, timeout?: number): Promise<Response>;
    predict<T = PredictionResult>(payload: any, model: string): Promise<T>;
    _createStream(response: Response): Promise<ReadableStream>;
    stream<T>(payload: any, model: string): AsyncGenerator<T>;
    openapiSchema(model?: string, max_retries?: number): Promise<OpenAPISchemaResponse>;
}
export { FlyMyAI, FlyMyAIError };
