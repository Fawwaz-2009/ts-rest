import {
  // ApiRouteServerResponse,
  AppRoute,
  AppRouteMutation,
  AppRouteQuery,
  AppRouter,
  LowercaseKeys,
  // PathParamsWithCustomValidators,
  ZodInferOrType,
  checkZodSchema,
  isAppRoute,
  parseJsonQueryObject,
  validateResponse,
} from '@ts-rest/core';
import { getPathParamsFromArray } from './helpers/path-utils';
import { z } from 'zod';

type RouteToQueryFunctionImplementation<T extends AppRouteQuery> = (args: {
  params: any;
  // params: PathParamsWithCustomValidators<T>;
  query: ZodInferOrType<T['query']>;
  headers: LowercaseKeys<ZodInferOrType<T['headers']>> & Request['headers'];
  req: Request;
// }) => Promise<ApiRouteServerResponse<T['responses']>>;
}) => Promise<any>;

type RouteToMutationFunctionImplementation<T extends AppRouteMutation> =
  (args: {
    // params: PathParamsWithCustomValidators<T>;
    params: any;
    body: ZodInferOrType<T['body']>;
    query: ZodInferOrType<T['query']>;
    headers: LowercaseKeys<ZodInferOrType<T['headers']>> & Request['headers'];
    req: Request;
  // }) => Promise<ApiRouteServerResponse<T['responses']>>;
}) => Promise<any>;

type RouteToFunctionImplementation<T extends AppRoute> = T extends AppRouteQuery
  ? RouteToQueryFunctionImplementation<T>
  : T extends AppRouteMutation
  ? RouteToMutationFunctionImplementation<T>
  : never;

type RecursiveRouterObj<T extends AppRouter> = {
  [TKey in keyof T]: T[TKey] extends AppRouter
    ? RecursiveRouterObj<T[TKey]>
    : T[TKey] extends AppRoute
    ? RouteToFunctionImplementation<T[TKey]>
    : never;
};

type AppRouteQueryWithImplementation<T extends AppRouteQuery> = T & {
  implementation: RouteToQueryFunctionImplementation<T>;
};

type AppRouteMutationWithImplementation<T extends AppRouteMutation> = T & {
  implementation: RouteToMutationFunctionImplementation<T>;
};

type AppRouteWithImplementation<T extends AppRoute> = T extends AppRouteMutation
  ? AppRouteMutationWithImplementation<T>
  : T extends AppRouteQuery
  ? AppRouteQueryWithImplementation<T>
  : never;

type AppRouterWithImplementation = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: AppRouterWithImplementation | AppRouteWithImplementation<any>;
};

/**
 * Combine all AppRoutes with their implementations into a single object
 * which is easier to work with
 * @param router
 * @param implementation
 * @returns
 */
const mergeRouterAndImplementation = <T extends AppRouter>(
  router: T,
  implementation: RecursiveRouterObj<T>
): AppRouterWithImplementation => {
  const keys = Object.keys(router);

  return keys.reduce((acc, key) => {
    const existing = router[key];
    const existingImpl = implementation[key];

    if (isAppRoute(existing)) {
      acc[key] = {
        ...existing,
        implementation: existingImpl as RouteToFunctionImplementation<
          typeof existing
        >,
      };
    } else {
      acc[key] = mergeRouterAndImplementation(
        existing,
        existingImpl as RecursiveRouterObj<typeof existing>
      );
    }
    return acc;
  }, {} as AppRouterWithImplementation);
};

/** create Query object from URLSearchParams
 * @param URLSearchParams
 * @returns Query object
 * */

export const createQueryObject = (URLSearchParams: URLSearchParams) => {
  const queryObject: Record<string, string> = {};
  URLSearchParams.forEach((value, key) => {
    queryObject[key] = value;
  });
  return queryObject;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isAppRouteWithImplementation = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  obj: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): obj is AppRouteWithImplementation<any> => {
  return obj?.implementation !== undefined && obj?.method;
};

export function findRoute(
  appRouter: AppRouter,
  pathname: string,
  method: string
): AppRouteWithImplementation<AppRoute> | null {
  const matchPath = (routePath: string, targetPath: string) => {
    const pathSegments = routePath.split('/').filter((s) => s.length > 0);
    const targetSegments = targetPath.split('/').filter((s) => s.length > 0);
    if (pathSegments.length !== targetSegments.length) return false;

    return pathSegments.every(
      (segment, i) => segment.startsWith(':') || segment === targetSegments[i]
    );
  };

  const findMatchingRoute = (
    routes: AppRouter
  ): AppRouteWithImplementation<AppRoute> | null => {
    for (const route of Object.values(routes)) {
      const isApiRouter = isAppRoute(route);
      if (!isApiRouter) return findMatchingRoute(route as AppRouter);

      if (route.method !== method) continue;

      if (matchPath(route.path, pathname))
        return route as AppRouteWithImplementation<AppRoute>;
    }
    return null;
  };

  return findMatchingRoute(appRouter);
}

const parseJsonBody = async (requestOrResponse: Request | Response) => {
  try {
    const json = await requestOrResponse.json();
    return {
      isJson: true,
      body: json,
    };
  } catch (e) {
    return {
      isJson: false,
    };
  }
};
/**
 * Create the implementation for a given AppRouter.
 *
 * @param appRouter - AppRouter
 * @param implementation - Implementation of the AppRouter, e.g. your API controllers
 * @returns
 */
// TODO maybe just accept a type argument
export const createEdgeRoute = <T extends AppRouter>(
  appRouter: T,
  implementation: RecursiveRouterObj<T>
) => implementation;

/**
 * Create a request handler for the serverless edge computing.
 *
 * @param params - An object that includes the route contract, route handlers, the incoming request, and the base endpoint.
 * @param params.appContract - The route contract.
 * @param params.appRouter - The route handlers that correspond to the route contract.
 * @param params.request - The incoming request.
 * @param params.baseEndpoint - The base endpoint that should be stripped from the request URL before the route matching.
 * @param options - An optional object for additional configurations.
 * @param options.jsonQuery - A flag to parse JSON-encoded query parameters.
 * @param options.responseValidation - A flag to validate the response from the route handlers against the route contract.
 * @param options.errorHandler - An optional error handler to handle errors thrown during the request processing.
 * @returns The response to be sent back to the client.
 */
export const createEdgeRequestHandler = async <T extends AppRouter>(
  {
    appContract,
    appRouter,
    request: req,
    baseEndpoint: endpoint,
  }: {
    appContract: T;
    appRouter: RecursiveRouterObj<T>;
    request: Request;
    baseEndpoint: string;
  },
  options?: {
    jsonQuery?: boolean;
    responseValidation?: boolean;
    errorHandler?: (err: unknown, req: Request) => void;
  }
) => {
  const { jsonQuery = false, responseValidation = false } = options || {};

  const combinedRouter = mergeRouterAndImplementation(appContract, appRouter);

  const url = new URL(req.url, 'https://example.com');

  const pathname = url.pathname.slice(endpoint.length);

 /**
 * To handle cases of OPTONS, CORS, etc. we can do something similar to the express adapter https://github.com/ts-rest/ts-rest/blob/66d5cb9d585c7f4dc032b358f0e966ff655f45a2/libs/ts-rest/express/src/lib/ts-rest-express.ts#L134-L136
 *   const handler = isAppRouteImplementation(implementationOrOptions)
    ? implementationOrOptions
    : implementationOrOptions.handler;
 */
  const route = findRoute(combinedRouter, pathname, req.method);

  if (!route) {
    return new Response('Not Found', { status: 404 });
  }

  const pathParams = getPathParamsFromArray(pathname.split('/'), route);
  let query = createQueryObject(url.searchParams);
  query = jsonQuery
    ? parseJsonQueryObject(query as Record<string, string>)
    : query;
  const queryResult = checkZodSchema(query, route.query);

  const parsedJsonBody = await parseJsonBody(req);
  const bodyResult = parsedJsonBody.isJson
    ? checkZodSchema(parsedJsonBody.body, 'body' in route ? route.body : null)
    : {
        success: true,
        data: req.body,
        error: null,
      };

  const plainHeaders: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    plainHeaders[key] = value;
  });
  const headersResult = checkZodSchema(plainHeaders, route.headers, {
    passThroughExtraKeys: true,
  });
  const pathParamsResult = checkZodSchema(
    pathParams,
    route.pathParams || z.object({}),
    {
      passThroughExtraKeys: true,
    }
  );

  if (!pathParamsResult.success) {
    return new Response(JSON.stringify(pathParamsResult.error), {
      status: 400,
    });
  }

  if (!queryResult.success) {
    return new Response(JSON.stringify(queryResult.error), {
      status: 400,
    });
  }

  if (!bodyResult.success) {
    return new Response(JSON.stringify(bodyResult.error), {
      status: 400,
    });
  }

  if (!headersResult.success) {
    return new Response(JSON.stringify(headersResult.error), {
      status: 400,
    });
  }

  try {
    const res: Response = await route.implementation({
      body: bodyResult.data,
      query: queryResult.data,
      params: pathParamsResult.data as any,
      headers: headersResult.data as any,
      req,
    });

    const parsedResponse = await parseJsonBody(res);
    if (responseValidation && parsedResponse.isJson) {
      const status = res.status;
      const response = validateResponse({
        responseType: route.responses[status],
        response: {
          status: status,
          body: parsedResponse.body,
        },
      });
      return new Response(JSON.stringify(response.body), {
        status: response.status,
        headers: res.headers,
      });
    }

    return new Response(res.body, {
      status: res.status,
      headers: res.headers,
    });
    
  } catch (e) {
    if (options?.errorHandler) {
      options.errorHandler(e, req);
      return new Response('Internal Server Error', { status: 500 });
    }

    throw e;
  }
};
