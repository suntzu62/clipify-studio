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
  try {
    const cli = getOpenAI();
    const resp: any = await cli.chat.completions.create({
      model: model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'structured_output',
          schema,
          strict: true,
        },
      },
    });

    // New SDK provides a convenience aggregator
    const text: string = resp?.output_text
      ?? resp?.content?.[0]?.text
      ?? resp?.choices?.[0]?.message?.content
      ?? '';

    if (!text) throw new Error('Empty response from OpenAI');

    return JSON.parse(text) as T;
  } catch (error: any) {
    throw {
      code: 'OPENAI_JSON_ERROR',
      message: `generateJSON failed: ${error?.message || error}`,
    };
  }
}
