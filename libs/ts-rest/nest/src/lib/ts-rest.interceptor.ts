import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { AppRoute, isAppRouteResponse, validateResponse } from '@ts-rest/core';
import { Reflector } from '@nestjs/core';
import {
  TsRestAppRouteMetadataKey,
  ValidateResponsesSymbol,
} from './constants';
import type { Response } from 'express-serve-static-core';

@Injectable()
export class TsRestInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const res: Response = context.switchToHttp().getResponse();

    const appRoute = this.reflector.get<AppRoute | undefined>(
      TsRestAppRouteMetadataKey,
      context.getHandler()
    );

    if (!appRoute) {
      // this will respond with a 500 error without revealing this error message in the response body
      throw new Error('Make sure your route is decorated with @TsRest()');
    }

    const isValidationEnabled = Boolean(
      this.reflector.getAllAndOverride<boolean | undefined>(
        ValidateResponsesSymbol,
        [context.getHandler(), context.getClass()]
      )
    );

    return next.handle().pipe(
      map((value) => {
        if (isAppRouteResponse(value)) {
          const response = isValidationEnabled
            ? validateResponse({
                responseType: appRoute.responses[value.status],
                response: value,
              })
            : value;

          res.status(response.status);
          return response.body;
        }

        return value;
      })
    );
  }
}
