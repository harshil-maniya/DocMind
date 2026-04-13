import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { AiService } from './ai.service';
import { ChatDto } from './dto/chat.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, IRequestUser } from '@docmind/common';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(@Body() dto: ChatDto, @CurrentUser() user: IRequestUser) {
    return this.aiService.chat(dto, user);
  }

  @Post('chat/stream')
  async chatStream(
    @Body() dto: ChatDto,
    @CurrentUser() user: IRequestUser,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      for await (const event of this.aiService.chatStream(dto, user)) {
        const data = typeof event.data === 'string'
          ? event.data
          : JSON.stringify(event.data);
        res.write(`event: ${event.type}\ndata: ${data}\n\n`);
      }
    } catch (error) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'Stream error' })}\n\n`);
    } finally {
      res.end();
    }
  }

  @Get('history/:sessionId')
  async getHistory(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: IRequestUser,
  ) {
    return this.aiService.getHistory(sessionId, user.tenantId);
  }
}
