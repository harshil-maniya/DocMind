import {
  Controller,
  All,
  Req,
  Res,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Request, Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { CORRELATION_ID_HEADER } from '@docmind/common';

const SERVICE_MAP: Record<string, string> = {
  '/auth': process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  '/documents': process.env.DOC_SERVICE_URL || 'http://localhost:3002',
  '/ai': process.env.AI_SERVICE_URL || 'http://localhost:3003',
  '/query': process.env.QUERY_SERVICE_URL || 'http://localhost:3004',
  '/analytics': process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3005',
};

@Controller()
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);

  constructor(private readonly httpService: HttpService) {}

  @All('auth/*')
  async proxyAuth(@Req() req: Request, @Res() res: Response) {
    return this.proxy(req, res, '/auth');
  }

  @All('documents/*')
  async proxyDocuments(@Req() req: Request, @Res() res: Response) {
    return this.proxy(req, res, '/documents');
  }

  @All('ai/*')
  async proxyAi(@Req() req: Request, @Res() res: Response) {
    return this.proxy(req, res, '/ai');
  }

  @All('query/*')
  async proxyQuery(@Req() req: Request, @Res() res: Response) {
    return this.proxy(req, res, '/query');
  }

  @All('analytics/*')
  async proxyAnalytics(@Req() req: Request, @Res() res: Response) {
    return this.proxy(req, res, '/analytics');
  }

  private async proxy(
    req: Request,
    res: Response,
    prefix: string,
  ): Promise<void> {
    const serviceUrl = SERVICE_MAP[prefix];
    if (!serviceUrl) {
      throw new HttpException('Service not found', HttpStatus.NOT_FOUND);
    }

    const targetUrl = `${serviceUrl}${req.path}`;
    const correlationId = req.headers[CORRELATION_ID_HEADER] as string;

    this.logger.debug(`Proxying ${req.method} ${req.path} -> ${targetUrl}`);

    try {
      // For SSE/streaming endpoints, use direct passthrough
      if (req.headers.accept === 'text/event-stream') {
        return this.proxyStream(req, res, targetUrl, correlationId);
      }

      const headers: Record<string, string> = {
        'content-type': req.headers['content-type'] || 'application/json',
        [CORRELATION_ID_HEADER]: correlationId,
      };

      if (req.headers.authorization) {
        headers.authorization = req.headers.authorization;
      }

      const response = await firstValueFrom(
        this.httpService.request({
          method: req.method,
          url: targetUrl,
          headers,
          data: req.body,
          params: req.query,
          validateStatus: () => true,
        }),
      );

      // Forward response headers
      res.setHeader(CORRELATION_ID_HEADER, correlationId);
      if (response.headers['content-type']) {
        res.setHeader('content-type', response.headers['content-type']);
      }

      res.status(response.status).json(response.data);
    } catch (error) {
      this.logger.error(`Proxy error for ${targetUrl}`, error);
      throw new HttpException(
        'Service temporarily unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private proxyStream(
    req: Request,
    res: Response,
    targetUrl: string,
    correlationId: string,
  ): void {
    const http = require('http');
    const https = require('https');
    const url = new URL(targetUrl);
    const client = url.protocol === 'https:' ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: req.method,
      headers: {
        ...req.headers,
        host: url.host,
        [CORRELATION_ID_HEADER]: correlationId,
      },
    };

    const proxyReq = client.request(options, (proxyRes: any) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', () => {
      res.status(503).end();
    });

    req.pipe(proxyReq, { end: true });
  }
}
