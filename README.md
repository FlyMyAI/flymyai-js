# FlyMyAI SDK

This repository contains the FlyMyAI SDK, a TypeScript library for interacting with the FlyMyAI API. It provides functionality for making predictions, streaming responses.

## Installation

To install the SDK, use npm or yarn:

```bash
npm install flymyai-js-client
```

or

```bash
yarn add flymyai-js-client
```

## Usage

### Initialization

To use the FlyMyAI SDK, you need to initialize it with your API key.

```typescript
import { FlyMyAI } from 'flymyai-js-client';

const client = new FlyMyAI({ apiKey: 'YOUR_API_KEY' });
```

### Making Predictions

You can make predictions by calling the `predict` method. Here’s an example:

```typescript
const payload = {
  "prompt": "Funny cat with stupid dog",
  "height": 1024,
  "width": 1024,
  "num_inference_steps": 26,
  "guidance_scale": "0",
  "seed": 1654,
  "negative_prompt": "0"
}

const model = 'flymyai/HiDream-I1-dev';
const apiKey = process.env.REACT_APP_FLYMYAI_API_KEY || '';

const client = new FlyMyAI({ apiKey });

try {
    const result = await client.predict(payload, model);
    console.log('Prediction result:', result.output_data['sample'][0]);
} catch (error) {
    console.error('Error making prediction:', error);
}
```

### Streaming Predictions

If you want to stream predictions, you can use the `stream` method. Here’s how:

```typescript
const payload = {
    i_prompt: 'An astronaut riding a rainbow unicorn, cinematic, dramatic, photorealistic',
    i_negative_prompt: 'Dark colors, gloomy atmosphere, horror'
};

const model = 'flymyai/SDTurboFMAAceleratedH100';

async function streamPredictions() {
    try {
        for await (const result of client.stream(payload, model)) {
            console.log('Streaming result:', (result.output_data?.output || [])[0] || '');
        }
    } catch (error) {
        console.error('Error during streaming:', error);
    }
}

streamPredictions();
```

### Error Handling

Uses custom error handling. If an error occurs, a `FlyMyAIError` will be thrown. You can catch it like this:

```typescript
try {
    const response = await flyMyAI.predict(payload, model);
} catch (error) {
    if (error instanceof FlyMyAIError) {
        console.error('FlyMyAI error:', error.message);
    } else {
        console.error('Unknown error:', error);
    }
}
```
