import { vi } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';

export interface MockRequestOptions {
  user?: {
    userId: string;
    email: string;
    name?: string;
  };
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

export interface MockReplyState {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  sent: boolean;
}

export function createMockRequest(options: MockRequestOptions = {}): FastifyRequest {
  const request = {
    user: options.user,
    cookies: options.cookies ?? {},
    headers: {
      'content-type': 'application/json',
      ...options.headers,
    },
    body: options.body ?? {},
    params: options.params ?? {},
    query: options.query ?? {},
    raw: {},
    server: {},
    id: 'test-request-id',
    log: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  } as unknown as FastifyRequest;

  return request;
}

export function createMockReply(): { reply: FastifyReply; state: MockReplyState } {
  const state: MockReplyState = {
    statusCode: 200,
    headers: {},
    body: null,
    sent: false,
  };

  const reply = {
    statusCode: 200,
    code: vi.fn().mockImplementation((code: number) => {
      state.statusCode = code;
      reply.statusCode = code;
      return reply;
    }),
    status: vi.fn().mockImplementation((code: number) => {
      state.statusCode = code;
      reply.statusCode = code;
      return reply;
    }),
    send: vi.fn().mockImplementation((body: any) => {
      state.body = body;
      state.sent = true;
      return reply;
    }),
    header: vi.fn().mockImplementation((name: string, value: string) => {
      state.headers[name.toLowerCase()] = value;
      return reply;
    }),
    headers: vi.fn().mockImplementation((headers: Record<string, string>) => {
      Object.entries(headers).forEach(([name, value]) => {
        state.headers[name.toLowerCase()] = value;
      });
      return reply;
    }),
    type: vi.fn().mockImplementation((type: string) => {
      state.headers['content-type'] = type;
      return reply;
    }),
    setCookie: vi.fn().mockImplementation((name: string, value: string, options?: any) => {
      state.headers[`set-cookie-${name}`] = value;
      return reply;
    }),
    clearCookie: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockImplementation((url: string) => {
      state.headers['location'] = url;
      state.statusCode = 302;
      return reply;
    }),
    raw: {},
    server: {},
    log: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  } as unknown as FastifyReply;

  return { reply, state };
}

// Helper to create authenticated request
export function createAuthenticatedRequest(
  userId: string,
  email: string,
  options: Omit<MockRequestOptions, 'user'> = {}
): FastifyRequest {
  return createMockRequest({
    ...options,
    user: { userId, email },
    cookies: {
      access_token: 'mock-access-token',
      ...options.cookies,
    },
  });
}

// Helper to create request with Bearer token
export function createBearerAuthRequest(
  token: string,
  options: Omit<MockRequestOptions, 'headers'> = {}
): FastifyRequest {
  return createMockRequest({
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
}

// Helper to simulate middleware chain
export async function runMiddlewareChain(
  request: FastifyRequest,
  reply: FastifyReply,
  middlewares: Array<(req: FastifyRequest, rep: FastifyReply) => Promise<void>>
): Promise<boolean> {
  for (const middleware of middlewares) {
    await middleware(request, reply);
    // Check if response was sent (middleware returned early)
    if ((reply.send as any).mock?.calls?.length > 0) {
      return false; // Chain was interrupted
    }
  }
  return true; // Chain completed successfully
}

// Helper to extract response from mock reply
export function extractResponse(state: MockReplyState) {
  return {
    statusCode: state.statusCode,
    body: state.body,
    headers: state.headers,
  };
}
