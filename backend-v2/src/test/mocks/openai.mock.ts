import { vi } from 'vitest';

export const mockWhisperTranscription = vi.fn();
export const mockChatCompletion = vi.fn();

export const mockOpenAI = vi.fn().mockImplementation(() => ({
  audio: {
    transcriptions: {
      create: mockWhisperTranscription,
    },
  },
  chat: {
    completions: {
      create: mockChatCompletion,
    },
  },
}));

export function setupOpenAIMock() {
  vi.mock('openai', () => ({
    default: mockOpenAI,
    OpenAI: mockOpenAI,
  }));
}

export function resetOpenAIMock() {
  mockWhisperTranscription.mockReset();
  mockChatCompletion.mockReset();
}

// Helper to create mock transcription response
export function createMockTranscriptionResponse(overrides?: Partial<{
  text: string;
  language: string;
  duration: number;
  segments: any[];
}>) {
  return {
    text: 'This is a test transcription of the video content.',
    language: 'en',
    duration: 120.5,
    segments: [
      {
        id: 0,
        start: 0,
        end: 5,
        text: 'This is a test transcription',
      },
      {
        id: 1,
        start: 5,
        end: 10,
        text: 'of the video content.',
      },
    ],
    ...overrides,
  };
}

// Helper to create mock chat completion response
export function createMockChatCompletionResponse(content: string) {
  return {
    id: 'test-completion-id',
    object: 'chat.completion',
    created: Date.now(),
    model: 'gpt-4',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    },
  };
}

// Helper to create mock analysis response (JSON content)
export function createMockAnalysisResponse(highlights: any[]) {
  return createMockChatCompletionResponse(JSON.stringify({ highlights }));
}
