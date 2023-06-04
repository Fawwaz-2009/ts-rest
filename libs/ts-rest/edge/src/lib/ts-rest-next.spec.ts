import { initContract } from '@ts-rest/core';
import { createEdgeRoute, createEdgeRequestHandler } from './ts-rest-edge';
import { Request, Response } from 'cross-fetch';
import { URLSearchParams } from 'url';

global.Request = Request;
global.Response = Response;

const c = initContract();

const contract = c.router({
  get: {
    method: 'GET',
    path: '/test',
    query: c.body<{ test: string }>(),
    responses: {
      200: c.response<{ message: string }>(),
    },
  },
});

const nextEndpoint = createEdgeRoute(contract, {
  get: async ({ query: { test } }) => {
    return new Response(JSON.stringify({ message: test }));
  },
});

describe('createNextRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('should send back a 200', async () => {
    const resultingRouter = (req: Request) =>
      createEdgeRequestHandler({
        appContract: contract,
        appRouter: nextEndpoint,
        baseEndpoint: '/',
        request: req,
      });

    const searchParams = new URLSearchParams();
    searchParams.append('test', 'test-query-string');
    searchParams.append('foo', '123');

    const url = `http://localhost:3000/test?${searchParams.toString()}`;
    const req = new Request(url, { method: 'GET' });

    const response = await resultingRouter(req);

    expect(response).toBeDefined();

    expect(response.status).toEqual(200);
    const json = await response.json();
    expect(json).toEqual({
      message: 'test-query-string',
    });
  });
});