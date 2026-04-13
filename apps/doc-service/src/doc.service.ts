import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { Document } from './entities/document.entity';
import { IngestionService } from './ingestion/ingestion.service';
import { DocumentStatus } from '@docmind/common';

const ALLOWED_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

@Injectable()
export class DocService {
  private readonly logger = new Logger(DocService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    private readonly ingestionService: IngestionService,
  ) {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
    this.bucketName = process.env.S3_BUCKET_NAME || 'docmind-documents';
  }

  async upload(
    file: Express.Multer.File,
    tenantId: string,
    uploadedBy: string,
  ): Promise<Document> {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type ${file.mimetype} is not supported`,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File size exceeds maximum allowed size of 50MB`,
      );
    }

    const fileExtension = file.originalname.split('.').pop() || '';
    const s3Key = `${tenantId}/${uuidv4()}.${fileExtension}`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
        Metadata: {
          tenantId,
          uploadedBy,
          originalName: file.originalname,
        },
      }),
    );

    const document = this.documentRepository.create({
      tenantId,
      filename: s3Key.split('/').pop() || s3Key,
      originalName: file.originalname,
      s3Key,
      s3Bucket: this.bucketName,
      status: DocumentStatus.PENDING,
      mimeType: file.mimetype,
      fileSize: file.size,
      uploadedBy,
    });

    const saved = await this.documentRepository.save(document);

    // Trigger async ingestion
    await this.ingestionService.addIngestionJob({
      documentId: saved.id,
      s3Key,
      tenantId,
      mimeType: file.mimetype,
    });

    this.logger.log(`Document ${saved.id} uploaded and queued for ingestion`);
    return saved;
  }

  async findAll(
    tenantId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: Document[]; total: number }> {
    const [data, total] = await this.documentRepository.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async findById(id: string, tenantId: string): Promise<Document> {
    const document = await this.documentRepository.findOne({
      where: { id, tenantId },
    });
    if (!document) {
      throw new NotFoundException(`Document ${id} not found`);
    }
    return document;
  }

  async getDownloadUrl(id: string, tenantId: string): Promise<string> {
    const document = await this.findById(id, tenantId);
    const command = new GetObjectCommand({
      Bucket: document.s3Bucket,
      Key: document.s3Key,
    });
    return getSignedUrl(this.s3Client, command, {
      expiresIn: Number(process.env.S3_PRESIGNED_URL_EXPIRES ?? 3600),
    });
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const document = await this.findById(id, tenantId);

    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: document.s3Bucket,
        Key: document.s3Key,
      }),
    );

    await this.documentRepository.remove(document);
    this.logger.log(`Document ${id} deleted`);
  }
}
