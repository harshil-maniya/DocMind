import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { QueryController } from './query.controller';
import { QueryService } from './query.service';
import { LlmModule } from '@docmind/llm';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'fallback-secret',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '15m' },
    }),
    LlmModule,
  ],
  controllers: [QueryController],
  providers: [QueryService, JwtStrategy, JwtAuthGuard],
})
export class QueryModule {}
