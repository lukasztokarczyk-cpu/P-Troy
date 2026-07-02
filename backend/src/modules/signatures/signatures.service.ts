import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FileStorageService } from '../../common/storage/file-storage.service';
import { PdfGeneratorService } from '../../common/pdf/pdf-generator.service';
import { SignerRole, SignatureInputMethod, SignableDocumentType } from '@prisma/client';

interface SignDocumentInput {
  documentId: string;
  signerRole: SignerRole;
  signerId?: string;
  signerName: string;
  inputMethod: SignatureInputMethod;
  // Podpis przesyłany jako base64 PNG wygenerowany z <canvas> na froncie
  signatureImageBase64: string;
  ipAddress: string;
  userAgent: string;
}

// Wymagane role podpisujące per typ dokumentu — reguła biznesowa
// decydująca kiedy dokument jest uznany za "skompletowany" i blokowany
const REQUIRED_SIGNERS: Record<SignableDocumentType, SignerRole[]> = {
  MEASUREMENT_PROTOCOL: ['INSTALLER', 'MANAGER'],
  HANDOVER_PROTOCOL: ['INSTALLER', 'CLIENT'],
};

@Injectable()
export class SignaturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly pdf: PdfGeneratorService,
  ) {}

  async createDocument(params: {
    type: SignableDocumentType;
    title: string;
    siteId: string;
    measurementId?: string;
    contentSnapshot: Record<string, unknown>;
    createdById: string;
  }) {
    return this.prisma.signableDocument.create({ data: params });
  }

  async getDocument(id: string) {
    const doc = await this.prisma.signableDocument.findUnique({
      where: { id },
      include: { signatures: { include: { signer: true } }, site: true },
    });
    if (!doc) throw new NotFoundException('Dokument nie został znaleziony');
    return doc;
  }

  /**
   * Zapisuje podpis elektroniczny. Jeśli po tym podpisie skompletowany
   * jest wymagany zestaw podpisów dla danego typu dokumentu — dokument
   * zostaje trwale zablokowany przed edycją i generowany jest PDF.
   */
  async sign(input: SignDocumentInput) {
    const document = await this.getDocument(input.documentId);

    if (document.isLocked) {
      throw new BadRequestException('Dokument jest już podpisany i zablokowany przed edycją');
    }

    const alreadySigned = document.signatures.some((s) => s.signerRole === input.signerRole);
    if (alreadySigned) {
      throw new BadRequestException(`Rola "${input.signerRole}" już złożyła podpis na tym dokumencie`);
    }

    // Zapis obrazu podpisu na serwerze plików (nie w bazie) — spójnie
    // z zasadą "aplikacja zapisuje jedynie ścieżkę do zdjęcia/pliku"
    const signatureImagePath = await this.storage.saveBase64Image(
      input.signatureImageBase64,
      `signatures/${document.id}/${input.signerRole.toLowerCase()}-${Date.now()}.png`,
    );

    const signature = await this.prisma.electronicSignature.create({
      data: {
        documentId: document.id,
        signerRole: input.signerRole,
        signerId: input.signerId,
        signerName: input.signerName,
        inputMethod: input.inputMethod,
        signatureImagePath,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });

    const requiredRoles = REQUIRED_SIGNERS[document.type];
    const allSignatures = [...document.signatures, signature];
    const isComplete = requiredRoles.every((role) =>
      allSignatures.some((s) => s.signerRole === role),
    );

    if (isComplete) {
      const pdfPath = await this.pdf.generateSignedDocumentPdf({
        title: document.title,
        contentSnapshot: document.contentSnapshot,
        signatures: allSignatures,
      });

      await this.prisma.signableDocument.update({
        where: { id: document.id },
        data: { isLocked: true, lockedAt: new Date(), pdfPath },
      });
    }

    return signature;
  }
}
