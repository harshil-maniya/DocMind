import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocService } from './doc.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, PaginationDto, IRequestUser } from '@docmind/common';

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocController {
  constructor(private readonly docService: DocService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: IRequestUser,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }
    return this.docService.upload(file, user.tenantId, user.sub);
  }

  @Get()
  async findAll(
    @CurrentUser() user: IRequestUser,
    @Query() pagination: PaginationDto,
  ) {
    const { data, total } = await this.docService.findAll(
      user.tenantId,
      pagination.page,
      pagination.limit,
    );
    return {
      data,
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / (pagination.limit ?? 20)),
    };
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: IRequestUser,
  ) {
    return this.docService.findById(id, user.tenantId);
  }

  @Get(':id/download-url')
  async getDownloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: IRequestUser,
  ) {
    const url = await this.docService.getDownloadUrl(id, user.tenantId);
    return { url };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: IRequestUser,
  ) {
    await this.docService.delete(id, user.tenantId);
  }
}
