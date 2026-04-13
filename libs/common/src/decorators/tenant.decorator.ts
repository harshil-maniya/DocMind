import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { IRequestUser } from '../interfaces/tenant.interface';

export const CurrentTenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): IRequestUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as IRequestUser;
  },
);

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): IRequestUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as IRequestUser;
  },
);
