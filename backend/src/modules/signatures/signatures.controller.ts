import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SignaturesService } from './signatures.service';
import { SignDocumentDto } from './dto/signature.dto';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';

@UseGuards(JwtAuthGuard)
@Controller('api/signatures')
export class SignaturesController {
  constructor(private readonly signaturesService: SignaturesService) {}

  @Get('documents/:id')
  getDocument(@Param('id') id: string) {
    return this.signaturesService.getDocument(id);
  }

  @Post('documents/:id/sign')
  sign(
    @Param('id') id: string,
    @Body() dto: SignDocumentDto,
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.signaturesService.sign({
      documentId: id,
      signerRole: dto.signerRole,
      // Jeśli podpisuje zalogowany pracownik (instalator/kierownik) —
      // wiążemy podpis z jego kontem; klient/inwestor mogą nie mieć konta
      signerId: dto.signerId ?? user?.id,
      signerName: dto.signerName,
      inputMethod: dto.inputMethod,
      signatureImageBase64: dto.signatureImageBase64,
      ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    });
  }
}
