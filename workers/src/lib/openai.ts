import OpenAI from 'openai';

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  if (!client) {
    client = new OpenAI({ apiKey });
  }
  return client;
}

export async function generateJSON<T = any>(
  model: string,
  schema: any,
  prompt: string
): Promise<T> {
  const cli = getOpenAI();
  const modelToUse = model || 'gpt-4o-mini';
  
  // Try different response formats for compatibility
  const responseFormats: Array<{ type: 'json_schema'; json_schema: any } | { type: 'json_object' } | undefined> = [
    // Modern structured output
    {
      type: 'json_schema' as const,
      json_schema: {
        name: 'structured_output',
        schema,
        strict: true,
      },
    },
    // Fallback to json_object
    { type: 'json_object' as const },
    // Final fallback with no response format
    undefined,
  ];

  for (let i = 0; i < responseFormats.length; i++) {
    try {
      const resp: any = await cli.chat.completions.create({
        model: modelToUse,
        messages: [
          { role: 'system', content: 'You are a helpful assistant that responds with valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        ...(responseFormats[i] && { response_format: responseFormats[i] }),
      });

      const text: string = resp?.output_text
        ?? resp?.content?.[0]?.text
        ?? resp?.choices?.[0]?.message?.content
        ?? '';

      if (!text) throw new Error('Empty response from OpenAI');

      return JSON.parse(text) as T;
    } catch (error: any) {
      console.error(`OpenAI attempt ${i + 1} failed:`, error?.message || error);
      
      // If this is the last attempt, throw the error
      if (i === responseFormats.length - 1) {
        throw {
          code: 'OPENAI_JSON_ERROR',
          message: `generateJSON failed after ${responseFormats.length} attempts: ${error?.message || error}`,
          originalError: error,
        };
      }
    }
  }

  // This should never be reached due to the throw above, but TypeScript needs it
  throw new Error('Unexpected end of generateJSON function');
}
