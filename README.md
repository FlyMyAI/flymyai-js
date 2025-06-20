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
import { FlyMyAI } from "flymyai-js-client";

const client = new FlyMyAI({ apiKey: "YOUR_API_KEY" });
```

### Making Predictions

You can make predictions by calling the `predict` method. Here’s an example:

```typescript
const payload = {
  prompt: "Funny cat with stupid dog",
  height: 1024,
  width: 1024,
  num_inference_steps: 26,
  guidance_scale: "0",
  seed: 1654,
  negative_prompt: "0",
};

const model = "flymyai/HiDream-I1-dev";
const apiKey = process.env.REACT_APP_FLYMYAI_API_KEY || "";

const client = new FlyMyAI({ apiKey });

try {
  const result = await client.predict(payload, model);
  console.log("Prediction result:", result.output_data["sample"][0]);
} catch (error) {
  console.error("Error making prediction:", error);
}
```

### Streaming Predictions

If you want to stream predictions, you can use the `stream` method. Here’s how:

```typescript
const payload = {
  i_prompt:
    "An astronaut riding a rainbow unicorn, cinematic, dramatic, photorealistic",
  i_negative_prompt: "Dark colors, gloomy atmosphere, horror",
};

const model = "flymyai/SDTurboFMAAceleratedH100";

async function streamPredictions() {
  try {
    for await (const result of client.stream(payload, model)) {
      console.log(
        "Streaming result:",
        (result.output_data?.output || [])[0] || ""
      );
    }
  } catch (error) {
    console.error("Error during streaming:", error);
  }
}

streamPredictions();
```

### Long-Running Predictions with Polling

For operations requiring extended processing time, use predictAsync with polling:

```typescript
const client = new FlyMyAI({
  apiKey: "YOUR_API_KEY",
});

const model = "flymyai/flux-schnell-lora";
const payload = {
  prompt: "a robotic funny cat with robotic stupid dog",
  height: 1024,
  width: 1024,
  num_inference_steps: 4,
  guidance_scale: "0",
  seed: 1654,
  lora_url:
    "https://civitai.com/api/download/models/730973?type=Model&format=SafeTensor",
  lora_scale: "0.9",
};

try {
  const result = await client.predictAsync(payload, model, {
    interval: 3000, // Poll every 3 seconds
    signal: AbortSignal.timeout(3_600_000), // 1 hour timeout
  });
  console.log(
    "Prediction URL:",
    result.inference_responses[0].response.sample[0].url
  );
} catch (error) {
  if (error instanceof FlyMyAIError) {
    console.error("Prediction failed:", error.message);
  }
}
```

### Waiting for all requests to be completed

```typescript
import { FlyMyAI } from "your-module-path";

async function main() {
  const apiKey = "fly-secret-key";
  const model = "flymyai/model-name";
  const client = new FlyMyAI({ apiKey });

  const payloads: Array<Record<string, any>> = Array.from(
    { length: 9 },
    (_, count) => ({
      prompt: "a robotic funny cat with robotic stupid dog",
      height: 1024,
      width: 1024,
      num_inference_steps: 4,
      guidance_scale: "0",
      seed: 1654,
      lora_url:
        "https://civitai.com/api/download/models/730973?type=Model&format=SafeTensor",
      lora_scale: "0.9",
    })
  );

  try {
    const results = await Promise.all(
      payloads.map((payload) =>
        client.predictAsync<AsyncPredictionResult>(payload, model, {
          interval: 3000,
          signal: createAbortSignal(36_000_000),
        })
      )
    );

    for (const result of results) {
      const url = result.inference_responses?.[0]?.response?.sample?.[0]?.url;
      if (url) {
        console.log(result.inference_responses[0].response.sample[0].url);
      }
    }
  } catch (error) {
    console.error("Error processing predictions:", error);
  }
}

main().catch(console.error);
```

### Separately getting predict_id and the result of generation

Get predict_id

```typescript
try {
  // Start the async prediction and get the prediction ID
  const predictionId = await client.asyncPredict(payload, model);
  console.log("Async prediction started. Prediction ID:", predictionId);

  // You can now store this predictionId to check results later
  // or pass it to another system component
} catch (error) {
  if (error instanceof FlyMyAIError) {
    console.error("Failed to start async prediction:", error.message);
  } else {
    console.error("Unknown error:", error);
  }
}
```

Retrieve the final results when ready

```typescript
try {
  const result = await client.checkAsyncResult(model, storedPredictionId);

  if (result.status === "pending") {
    console.log("Prediction is still processing");
  } else {
    console.log(
      "Final prediction result:",
      result.inference_responses[0].response.sample[0].url
    );
  }
} catch (error) {
  console.error("Error checking prediction status:", error);
}
```

### Error Handling

Uses custom error handling. If an error occurs, a `FlyMyAIError` will be thrown. You can catch it like this:

```typescript
try {
  const response = await flyMyAI.predict(payload, model);
} catch (error) {
  if (error instanceof FlyMyAIError) {
    console.error("FlyMyAI error:", error.message);
  } else {
    console.error("Unknown error:", error);
  }
}
```
