import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from './ai.module';
import { ChatSession } from './chat/chat-session.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USERNAME || 'docmind',
      password: process.env.DB_PASSWORD || 'docmind_password',
      database: process.env.DB_DATABASE || 'docmind',
      entities: [ChatSession],
      synchronize: process.env.DB_SYNCHRONIZE === 'true',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    }),
    AiModule,
  ],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','),
    credentials: true,
  });

  const port = Number(process.env.AI_SERVICE_PORT ?? 3003);
  await app.listen(port);
  console.log(`AI Service running on port ${port}`);
}

bootstrap();
