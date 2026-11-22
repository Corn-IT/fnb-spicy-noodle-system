import { Controller, Get, Header, Inject, Param, ParseIntPipe, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { IamService } from './iam.service';

@Controller('api/v1/public/avatars')
export class PublicAvatarController {
  constructor(@Inject(IamService) private readonly iamService: IamService) {}

  @Get(':employeeId')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async getPublicAvatar(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const asset = await this.iamService.getPublicAvatarBinary(employeeId);
    response.setHeader('Content-Type', asset.mime);
    return new StreamableFile(asset.buffer);
  }
}
