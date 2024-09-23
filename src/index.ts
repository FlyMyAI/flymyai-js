import 'tslib';
import { createParser, ParsedEvent, ReconnectInterval } from 'eventsource-parser';

interface FlyMyAIConfig {
    apiKey: string | undefined;
}

interface FlyMyAIResponse {
    status: number;
    json: () => Promise<any>;
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

    static async fromResponse(response: FlyMyAIResponse): Promise<OpenAPISchemaResponse> {
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
    private baseUrl = 'https://api.flymy.ai/api/v1';

    constructor(config: FlyMyAIConfig) {
        if (!config.apiKey) {
            throw new FlyMyAIError('API key not found. Please provide a valid API key.');
        }
        this.apiKey = config.apiKey;
    }

    private async _convertImageToBase64(image: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                resolve(reader.result as string);
            };
            reader.onerror = () => {
                reject(new FlyMyAIError('Failed to convert image to base64. Please check the image file.'));
            };
            reader.readAsDataURL(image);
        });
    }

    private async _preparePayload(payload: any): Promise<any> {
        if (payload.image && payload.image instanceof File) {
            payload.image = await this._convertImageToBase64(payload.image);
        }
        return payload;
    }

    async _createConnection(payload: any, model: string, stream: boolean = false): Promise<Response> {
        const [user, modelName] = model.split('/');
        payload = await this._preparePayload(payload);

        const response = await fetch(`${this.baseUrl}/${user}/${modelName}/predict${stream ? '/stream/' : ''}`, {
            method: 'POST',
            headers: {
                'accept': 'text/event-stream',
                'x-api-key': this.apiKey,
            },
            body: JSON.stringify({ ...payload }),
        });

        if (!response.ok) {
            throw new FlyMyAIError(`Failed to create connection. Server responded with status: ${response.statusText}`);
        }

        return response;
    }

    async _createConnectionWithRetries(payload: any, model: string, stream = false, retries: number = 3, timeout: number = 10000): Promise<Response> {
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                const responsePromise = this._createConnection(payload, model, true);
                
                const response = await Promise.race([
                    responsePromise,
                    new Promise((_, reject) => setTimeout(() => reject(new FlyMyAIError('Request timed out')), timeout)),
                ]);

                return response as Response;
            } catch (error) {
                if (attempt === retries - 1) {
                    throw new FlyMyAIError(`Failed after ${retries} attempts: ${error.message}`);
                }
                console.log(`Attempt ${attempt + 1} failed: ${error.message}. Retrying...`);
            }
        }
        throw new FlyMyAIError('Maximum retry attempts reached');
    }

    async predict(payload: any, model: string) {
        try {
            const response = await this._createConnectionWithRetries(payload, model);
            const reader = response.body?.getReader();
            const decoder = new TextDecoder('utf-8');
            let result = '';

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    result += decoder.decode(value, { stream: true });
                }
            }
            const resultJSON = JSON.parse(result.replace(/^data:s*/, ''));
            return resultJSON;
        } catch (error) {
            if (error instanceof Error) {
                throw new FlyMyAIError(`Prediction failed: ${error.message}`);
            } else {
                throw new FlyMyAIError('Prediction failed due to an unknown error.');
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
                    console.log(`Error: received non-200 status code, ${JSON.stringify(data)}`);
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

    async* stream(payload: any, model: string) {
        try {
            const response = await this._createConnectionWithRetries(payload, model, true);
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
                throw new FlyMyAIError('Streaming failed due to an unknown error.');
            }
        }
    }

    async openapiSchema(model: string = '', max_retries: number = 3): Promise<OpenAPISchemaResponse> {
        const [user, modelName] = model.split('/');
        const url = `${this.baseUrl}/${user}/${modelName}/openapi-schema`;

        for (let attempt = 0; attempt < max_retries; attempt++) {
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'accept': 'application/json',
                        'x-api-key': this.apiKey,
                    },
                });

                if (!response.ok) {
                    throw new FlyMyAIError(`Failed to fetch OpenAPI schema. Server responded with status: ${response.statusText}`);
                }

                const schemaResponse = await OpenAPISchemaResponse.fromResponse(response as FlyMyAIResponse);
                return schemaResponse;
            } catch (error) {
                if (attempt === max_retries - 1) {
                    if (error instanceof Error) {
                        throw new FlyMyAIError(`Failed to fetch OpenAPI schema after ${max_retries} attempts: ${error.message}`);
                    } else {
                        throw new FlyMyAIError('Failed to fetch OpenAPI schema after maximum retries due to an unknown error.');
                    }
                }
            }
        }

        throw new FlyMyAIError('Failed to fetch OpenAPI schema after maximum retries.');
    }
}

export { FlyMyAI };
