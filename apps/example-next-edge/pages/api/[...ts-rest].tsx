import { apiNested } from '@ts-rest/example-contracts';
import { createEdgeRoute, createEdgeRequestHandler } from '@ts-rest/edge';

export const config = {
  runtime: 'edge',
};
const postsRouter = createEdgeRoute(apiNested.posts, {
  createPost: async (args) => {

    return new Response(
      JSON.stringify({
        id: '1',
        title: 'title',
        tags: [],
        description: '',
        content: '',
        published: false,
      }),
      {
        headers: {
          'content-type': 'application/json',
        },
        status: 201,
      }
    );
  },
  updatePost: async (args) => {
    return new Response(
      JSON.stringify({
        id: '1',
        title: 'title',
        tags: [],
        description: '',
        content: '',
        published: false,
      }),
      {
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  },
  deletePost: async (args) => {
    return new Response(JSON.stringify({ message: 'Post deleted' }), {
      headers: {
        'content-type': 'application/json',
      },
    });
  },
  getPost: async ({ params }) => {

    return new Response(
      JSON.stringify({
        id: '1',
        title: 'title',
        tags: [],
        description: '',
        content: '',
        published: false,
      }),
      {
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  },
  getPosts: async (args) => {

    return new Response(
      JSON.stringify({
        posts: [
          {
            id: '1',
            title: 'title',
            tags: [],
            content: '',
            description:null,
            published: false,

          },
        ],
        count: 1,
        skip: args.query.skip,
        take: args.query.take,
      }),
      {
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  },
  testPathParams: async (args) => {
    return new Response(args.params, {
      headers: {
        'content-type': 'text/plain',
      },
    });
  },
});

const healthRouter = createEdgeRoute(apiNested.health, {
  check: async (args) => {
    return new Response('OK', {
      headers: {
        'content-type': 'text/plain',
      },
    });
  },
});

const router = createEdgeRoute(apiNested, {
  posts: postsRouter,
  health: healthRouter,
});

export default function handler(request: Request) {
  return createEdgeRequestHandler({
    appContract: apiNested,
    appRouter: router,
    baseEndpoint: '/api',
    request,
  }, {
    responseValidation: true,
  });
}
