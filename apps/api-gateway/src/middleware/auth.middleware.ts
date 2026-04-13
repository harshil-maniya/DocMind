import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AuthMiddleware.name);

  private readonly publicPaths = [
    '/auth/register',
    '/auth/login',
    '/auth/refresh',
    '/health',
  ];

  constructor(private readonly jwtService: JwtService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const path = req.path;

    // Skip auth for public paths
    if (this.publicPaths.some((p) => path.endsWith(p))) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization header required');
    }

    const token = authHeader.split(' ')[1];

    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });
      req['user'] = payload;
      next();
    } catch (error) {
      this.logger.warn(
        `JWT verification failed: ${(error as Error).message}`,
      );
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
