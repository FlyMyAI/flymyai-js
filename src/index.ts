import "tslib";
import {
  createParser,
  ParsedEvent,
  ReconnectInterval,
} from "eventsource-parser";

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

interface AsyncPredictionOptions {
  interval?: number;
  signal?: AbortSignal;
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

class FlyMyAI {
  private apiKey: string;
  private baseUrl = "https://api.flymy.ai/api/v1";

  constructor(config: FlyMyAIConfig) {
    if (!config.apiKey) {
      throw new FlyMyAIError(
        "API key not found. Please provide a valid API key."
      );
    }
    this.apiKey = config.apiKey;
  }

  /**
   * Создает асинхронный запрос предсказания
   * @param payload Данные для предсказания
   * @param model Модель в формате "user/modelName"
   * @returns prediction_id идентификатор запроса
   */
  async asyncPredict(payload: any, model: string): Promise<string> {
    this._validateModelFormat(model);
    const [user, modelName] = model.split("/");
    const preparedPayload = await this._preparePayload(payload);

    const formData = new FormData();
    for (const key in preparedPayload) {
      formData.append(key, preparedPayload[key]);
    }

    const headers = new Headers({
      "x-api-key": this.apiKey,
      accept: "application/json",
    });

    const response = await fetch(
      `${this.baseUrl}/${user}/${modelName}/predict/async/`,
      {
        method: "POST",
        headers,
        body: formData,
      }
    );

    if (response.status !== 202) {
      const errorBody = await response.text();
      throw new FlyMyAIError(
        `Async prediction failed: ${response.status} ${response.statusText}. Body: ${errorBody}`
      );
    }

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

    const headers = new Headers({
      "x-api-key": this.apiKey,
      accept: "application/json",
    });

    const url = new URL(
      `${this.baseUrl}/${user}/${modelName}/predict/async/result/`
    );
    url.searchParams.append("request_id", prediction_id);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers,
      signal,
    });

    if (response.status === 425) {
      return { status: "pending" };
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new FlyMyAIError(
        `Async check failed: ${response.status} ${response.statusText}. Body: ${errorBody}`
      );
    }

    return await response.json();
  }

  /**
   * Полный цикл асинхронного предсказания
   * @param payload Данные для предсказания
   * @param model Модель в формате "user/modelName"
   * @param options Настройки { interval: интервал опроса, signal: сигнал отмены }
   * @returns Результат предсказания
   */
  async predictAsync<T = any>(
    payload: any,
    model: string,
    options: { interval?: number; signal?: AbortSignal } = {}
  ): Promise<T> {
    const { interval = 5000, signal } = options;
    const predictionId = await this.asyncPredict(payload, model);

    while (true) {
      if (signal?.aborted) throw new FlyMyAIError("Request aborted");

      const result = await this.checkAsyncResult(model, predictionId, signal);

      if (result.status === "pending") {
        await new Promise((resolve) => setTimeout(resolve, interval));
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
    if (payload.image && payload.image instanceof File) {
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
    const formData = new FormData();
    for (const key in preparedPayload) {
      formData.append(key, payload[key]);
    }

    const headers = new Headers({
      "x-api-key": this.apiKey,
      accept: stream ? "text/event-stream" : "application/json",
    });

    const response = await fetch(
      `${this.baseUrl}/${user}/${modelName}/predict${stream ? "/stream/" : ""}`,
      {
        method: "POST",
        headers,
        body: formData,
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new FlyMyAIError(
        `Request failed: ${response.status} ${response.statusText}. Body: ${errorBody}`
      );
    }

    return response;
  }

  private _validateModelFormat(model: string) {
    if (!model.includes("/")) {
      throw new FlyMyAIError('Model must be in the format "user/modelName".');
    }
  }
  async _createConnectionWithRetries(
    payload: any,
    model: string,
    stream = false,
    retries: number = 3,
    timeout: number = 10000
  ): Promise<Response> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const responsePromise = this._createConnection(payload, model, stream);

        const response = await Promise.race([
          responsePromise,
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new FlyMyAIError("Request timed out")),
              timeout
            )
          ),
        ]);

        return response as Response;
      } catch (error) {
        let errorMessage = "Unknown error occurred";
        if (error instanceof Error) {
          errorMessage = error.message;
        }
        if (attempt === retries - 1) {
          throw new FlyMyAIError(
            `Failed after ${retries} attempts: ${errorMessage}`
          );
        }
        console.log(
          `Attempt ${attempt + 1} failed: ${errorMessage}. Retrying...`
        );
      }
    }
    throw new FlyMyAIError("Maximum retry attempts reached");
  }

  async predict<T = PredictionResult>(payload: any, model: string): Promise<T> {
    try {
      const response = await this._createConnection(payload, model);

      // Если ответ приходит как SSE (даже для обычных запросов)
      const reader = response.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let result = "";

      if (!reader) {
        throw new FlyMyAIError("Failed to read response stream");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += decoder.decode(value);
      }

      // Извлекаем данные из SSE формата
      const jsonData = result
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => {
          try {
            return JSON.parse(line.replace(/^data:\s*/, ""));
          } catch (e) {
            throw new FlyMyAIError(`Failed to parse SSE data: ${line}`);
          }
        });

      if (jsonData.length === 0) {
        throw new FlyMyAIError("No valid data events found in response");
      }

      // Возвращаем последнее событие (или обрабатываем все)
      return jsonData[jsonData.length - 1] as T;
    } catch (error) {
      if (error instanceof FlyMyAIError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new FlyMyAIError(`Prediction failed: ${error.message}`);
      } else {
        throw new FlyMyAIError("Prediction failed due to an unknown error.");
      }
    }
  }

  async _createStream(response: Response): Promise<ReadableStream> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const readableStream = new ReadableStream({
      async start(controller) {
        const onParse = (event: ParsedEvent | ReconnectInterval) => {
          if (event.type === "event") {
            const data = event.data;
            controller.enqueue(encoder.encode(data));
          }
        };

        if (response.status !== 200) {
          const data = {
            status: response.status,
            statusText: response.statusText,
            body: await response.text(),
          };
          console.log(
            `Error: received non-200 status code, ${JSON.stringify(data)}`
          );
          controller.close();
          return;
        }

        const parser = createParser(onParse);
        for await (const chunk of response.body as any) {
          parser.feed(decoder.decode(chunk, { stream: true }));
        }
      },
    });

    return readableStream;
  }

  async *stream<T>(payload: any, model: string): AsyncGenerator<T> {
    try {
      const response = await this._createConnectionWithRetries(
        payload,
        model,
        true
      );
      const stream = await this._createStream(response);
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          yield JSON.parse(String.fromCharCode(...value));
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new FlyMyAIError(`Streaming failed: ${error.message}`);
      } else {
        throw new FlyMyAIError("Streaming failed due to an unknown error.");
      }
    }
  }

  async openapiSchema(
    model: string = "",
    max_retries: number = 3
  ): Promise<OpenAPISchemaResponse> {
    const [user, modelName] = model.split("/");
    const url = `${this.baseUrl}/${user}/${modelName}/openapi-schema`;

    for (let attempt = 0; attempt < max_retries; attempt++) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            accept: "application/json",
            "x-api-key": this.apiKey,
          },
        });

        if (!response.ok) {
          throw new FlyMyAIError(
            `Failed to fetch OpenAPI schema. Server responded with status: ${response.statusText}`
          );
        }

        const schemaResponse = await OpenAPISchemaResponse.fromResponse(
          response as FlyMyAIResponse
        );
        return schemaResponse;
      } catch (error) {
        if (attempt === max_retries - 1) {
          if (error instanceof Error) {
            throw new FlyMyAIError(
              `Failed to fetch OpenAPI schema after ${max_retries} attempts: ${error.message}`
            );
          } else {
            throw new FlyMyAIError(
              "Failed to fetch OpenAPI schema after maximum retries due to an unknown error."
            );
          }
        }
      }
    }

    throw new FlyMyAIError(
      "Failed to fetch OpenAPI schema after maximum retries."
    );
  }
}

export { FlyMyAI, FlyMyAIError };
