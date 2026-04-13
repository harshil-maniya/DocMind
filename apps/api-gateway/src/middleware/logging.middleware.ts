import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { CORRELATION_ID_HEADER } from '@docmind/common';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    const correlationId = req.headers[CORRELATION_ID_HEADER] as string;

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const logEntry = {
        correlationId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: duration,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        contentLength: res.getHeader('content-length'),
      };

      if (res.statusCode >= 500) {
        this.logger.error(JSON.stringify(logEntry));
      } else if (res.statusCode >= 400) {
        this.logger.warn(JSON.stringify(logEntry));
      } else {
        this.logger.log(JSON.stringify(logEntry));
      }
    });

    next();
  }
}
