import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { DocModule } from './doc.module';
import { Document } from './entities/document.entity';
import { Chunk } from './entities/chunk.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USERNAME || 'docmind',
      password: process.env.DB_PASSWORD || 'docmind_password',
      database: process.env.DB_DATABASE || 'docmind',
      entities: [Document, Chunk],
      synchronize: process.env.DB_SYNCHRONIZE === 'true',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    }),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: process.env.REDIS_PASSWORD || undefined,
        db: Number(process.env.REDIS_DB ?? 0),
      },
    }),
    DocModule,
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

  const port = Number(process.env.DOC_SERVICE_PORT ?? 3002);
  await app.listen(port);
  console.log(`Doc Service running on port ${port}`);
}

bootstrap();
