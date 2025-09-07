import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateJSON<T = any>(
  model: string,
  schema: any,
  prompt: string
): Promise<T> {
  try {
    const resp: any = await client.responses.create({
      model: model || 'gpt-4o-mini',
      input: prompt,
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

