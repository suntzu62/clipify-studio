import { getOpenAI } from './openai';

export async function embedTextBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  
  try {
    const client = getOpenAI();
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    });
    
    return response.data.map(item => item.embedding);
  } catch (error: any) {
    throw { 
      code: 'OPENAI_EMBEDDINGS_ERROR', 
      message: `Embeddings failed: ${error.message}` 
    };
  }
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (normA * normB);
}
