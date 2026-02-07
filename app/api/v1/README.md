# OpenAI-Compatible API (v1)

This directory contains OpenAI-compatible endpoints that map OpenAI API formats to Gemini Cloud Code API.

## Endpoints

### POST /api/v1/chat/completions

OpenAI-compatible chat completions endpoint that translates requests to Gemini's Cloud Code API.

#### Model Mapping

| OpenAI Model | Gemini Model |
|-------------|-------------|
| gpt-4 | gemini-2.5-pro |
| gpt-4o | gemini-2.0-flash |
| gpt-4o-mini | gemini-2.0-flash |
| gpt-3.5-turbo | gemini-2.0-flash |
| gemini-* | Pass-through |

**Note:** Any model name starting with "gemini-" is passed through as-is, allowing direct access to specific Gemini models.

#### Request Format

```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello!" }
  ],
  "max_tokens": 1000,
  "temperature": 0.7,
  "stream": false
}
```

#### Response Format

```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 15,
    "completion_tokens": 10,
    "total_tokens": 25
  }
}
```

#### Streaming

Set `"stream": true` to enable Server-Sent Events (SSE) streaming. The response will follow OpenAI's streaming format with `data: {...}` chunks and `data: [DONE]` at the end.

#### Authentication

Use the same API key authentication as other GSwarm endpoints. Include your API key in the `Authorization` header:

```
Authorization: Bearer your-api-key-here
```

#### Example Usage

**cURL:**
```bash
curl https://your-domain.com/api/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

**OpenAI Python SDK:**
```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://your-domain.com/api/v1"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)
print(response.choices[0].message.content)
```

**Node.js:**
```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'YOUR_API_KEY',
  baseURL: 'https://your-domain.com/api/v1'
});

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'user', content: 'Hello!' }
  ]
});
console.log(response.choices[0].message.content);
```

## Implementation Details

The endpoint:
1. Authenticates requests using the existing GSwarm API key system
2. Maps OpenAI model names to Gemini models
3. Converts OpenAI message format to Gemini's contents format
4. Uses the rotation engine to select projects/tokens automatically
5. Returns OpenAI-compatible responses with token usage
6. Records metrics for monitoring and analytics

## Rotation Engine Integration

The endpoint automatically uses the project/token rotation engine (from task #7) via `gswarmClient.generateContent()`. This provides:

- **LRU rotation** - Projects rotate based on least-recently-used order
- **Token management** - Automatic token refresh and validation
- **Error handling** - Project cooldown on quota exhaustion
- **Metrics tracking** - Usage statistics per account/project

## Testing

Run the test suite:
```bash
pnpm vitest run app/api/v1/chat/completions/route.test.ts
```

## Rate Limiting

Rate limits are enforced per API key using the existing GSwarm rate limiting system. Headers included in responses:

- `X-RateLimit-Remaining` - Requests remaining in the current window
- `X-RateLimit-Reset` - Unix timestamp when the limit resets
