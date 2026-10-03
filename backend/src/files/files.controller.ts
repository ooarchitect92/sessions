import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../common/auth/current-principal.decorator';
import type { Principal } from '../common/auth/principal';
import { CreateFileUploadDto } from './dto/create-file-upload.dto';
import { FilesService } from './files.service';

@ApiTags('files')
@ApiBearerAuth()
@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('sessions/:sessionId/files/uploads')
  createUpload(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
    @Body() body: CreateFileUploadDto,
  ) {
    return this.files.createUpload(principal, sessionId, body);
  }

  @Post('files/:fileId/complete')
  completeUpload(
    @CurrentPrincipal() principal: Principal,
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
  ) {
    return this.files.completeUpload(principal, fileId);
  }

  @Get('sessions/:sessionId/files')
  listSessionFiles(
    @CurrentPrincipal() principal: Principal,
    @Param('sessionId', new ParseUUIDPipe({ version: '4' })) sessionId: string,
  ) {
    return this.files.listSessionFiles(principal, sessionId);
  }

  @Get('files/:fileId/download')
  createDownloadGrant(
    @CurrentPrincipal() principal: Principal,
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
  ) {
    return this.files.createDownloadGrant(principal, fileId);
  }

  @Delete('files/:fileId')
  remove(
    @CurrentPrincipal() principal: Principal,
    @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
  ) {
    return this.files.remove(principal, fileId);
  }
}
