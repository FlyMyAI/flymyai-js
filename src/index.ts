import 'tslib';
import { createParser, ParsedEvent, ReconnectInterval } from 'eventsource-parser';

interface PredictPayload {
    i_prompt: string;
    i_negative_prompt: string;
}

interface FlyMyAIConfig {
    apiKey: string;
}

class FlyMyAI {
    private apiKey: string;

    constructor(config: FlyMyAIConfig) {
        this.apiKey = config.apiKey;
    }

    parseModel(model: string) {
        return model.split('/')
    }

    async predict(payload: any, model: string) {
        const [user, modelName] = this.parseModel(model)

        const response = await fetch(`https://api.flymy.ai/api/v1/${user}/${modelName}/predict`, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'x-api-key': this.apiKey,
            },
            body: JSON.stringify(
                { ...payload }
            )
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
        }

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
        const resultJSON = JSON.parse(result.split(/\s/, 2)[1]);
        return resultJSON;
    }

    async stream(payload: any, model: string) {
        const [user, modelName] = this.parseModel(model)
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const res = await fetch(`https://api.flymy.ai/api/v1/${user}/${modelName}/predict`, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'x-api-key': this.apiKey,
            },
            body: JSON.stringify(
                { ...payload }
            )
        });

        const readableStream = new ReadableStream({
            async start(controller) {
                const onParse = (event: ParsedEvent | ReconnectInterval) => {
                    if (event.type === "event") {
                        const data = event.data;
                        controller.enqueue(encoder.encode(data));
                    }
                }

                if (res.status !== 200) {
                    const data = {
                        status: res.status,
                        statusText: res.statusText,
                        body: await res.text(),
                    }
                    console.log(`Error: recieved non-200 status code, ${JSON.stringify(data)}`);
                    controller.close();
                    return
                }

                const parser = createParser(onParse);
                for await (const chunk of res.body as any) {
                    parser.feed(decoder.decode(chunk));
                }
            },
        });

        return readableStream
    }

    async* streamToAsyncIterator(stream: ReadableStream<Uint8Array>) {
        const reader = stream.getReader();
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                yield value;
            }
        } finally {
            reader.releaseLock();
        }
    }


}

export { FlyMyAI };
