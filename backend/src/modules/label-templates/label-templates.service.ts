import { Injectable, ForbiddenException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LabelProviderRegistryService } from './providers/label-provider-registry.service';
import { CreateLabelTemplateDto, UpdateLabelTemplateDto } from './dto/label-template.dto';
import { LabelTargetType, Role, Prisma } from '@prisma/client';

function assertPrivileged(role: Role) {
  if (role !== Role.ADMIN && role !== Role.KIEROWNIK) {
    throw new ForbiddenException('Tylko administrator lub brygadzista może zarządzać szablonami etykiet');
  }
}

// Gotowe szablony systemowe (sekcja 8 specyfikacji) — id stałe, żeby
// seed był idempotentny (upsert). Nie można ich usunąć — tylko
// zduplikować i edytować kopię.
const SYSTEM_TEMPLATES: (Prisma.LabelTemplateCreateInput & { id: string })[] = [
  {
    id: 'sys-board-identification',
    name: 'Rozdzielnia — identyfikacyjna',
    targetType: LabelTargetType.DISTRIBUTION_BOARD,
    isSystem: true,
    widthMm: 60, heightMm: 40, includeQr: true,
    fieldsLayout: [{ field: 'switchboardName', bold: true }, { field: 'location' }, { field: 'projectName' }],
  },
  {
    id: 'sys-electrical-device',
    name: 'Aparat elektryczny',
    targetType: LabelTargetType.DISTRIBUTION_BOARD_DEVICE,
    isSystem: true,
    widthMm: 40, heightMm: 20, includeQr: false,
    fieldsLayout: [{ field: 'deviceCode', bold: true }, { field: 'protectionType' }, { field: 'circuitName' }],
  },
  {
    id: 'sys-protection',
    name: 'Zabezpieczenie',
    targetType: LabelTargetType.DISTRIBUTION_BOARD_DEVICE,
    isSystem: true,
    widthMm: 40, heightMm: 20, includeQr: false,
    fieldsLayout: [{ field: 'deviceCode', bold: true }, { field: 'protectionValue' }, { field: 'circuitName' }],
  },
  {
    id: 'sys-circuit',
    name: 'Obwód elektryczny',
    targetType: LabelTargetType.DISTRIBUTION_BOARD_DEVICE,
    isSystem: true,
    widthMm: 50, heightMm: 20, includeQr: false,
    fieldsLayout: [{ field: 'circuitName', bold: true }, { field: 'deviceCode' }, { field: 'switchboardName' }],
  },
  {
    id: 'sys-rack-identification',
    name: 'Szafa rack — identyfikacyjna',
    targetType: LabelTargetType.RACK,
    isSystem: true,
    widthMm: 60, heightMm: 40, includeQr: true,
    fieldsLayout: [{ field: 'rackName', bold: true }, { field: 'rackLocation' }, { field: 'projectName' }],
  },
  {
    id: 'sys-rack-device',
    name: 'Urządzenie w szafie rack',
    targetType: LabelTargetType.RACK_DEVICE,
    isSystem: true,
    widthMm: 50, heightMm: 25, includeQr: true,
    fieldsLayout: [{ field: 'deviceName', bold: true }, { field: 'deviceType' }, { field: 'purpose' }],
  },
  {
    id: 'sys-rack-port',
    name: 'Port urządzenia',
    targetType: LabelTargetType.RACK_DEVICE_PORT,
    isSystem: true,
    widthMm: 30, heightMm: 15, includeQr: false,
    fieldsLayout: [{ field: 'portNumber', bold: true }, { field: 'connectionType' }, { field: 'label' }, { field: 'location' }],
  },
  {
    id: 'sys-warning',
    name: 'Ostrzegawcza',
    targetType: LabelTargetType.DISTRIBUTION_BOARD_DEVICE, // placeholder — dostępna dla każdego kontekstu, patrz findTemplates
    isSystem: true,
    isWarning: true,
    widthMm: 50, heightMm: 30, includeQr: false,
    fieldsLayout: [],
  },
];

@Injectable()
export class LabelTemplatesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: LabelProviderRegistryService,
  ) {}

  async onModuleInit() {
    // Zabezpieczenie: jeśli tabele label_templates jeszcze nie istnieją
    // w bazie (np. backend wystartował przed wykonaniem `prisma db push`
    // dla tego schematu), NIE WOLNO pozwolić, żeby ten seed wywrócił
    // start całej aplikacji (a wraz z nią np. logowanie). Logujemy
    // ostrzeżenie i próbujemy ponownie przy kolejnym restarcie/deployu.
    try {
      for (const tpl of SYSTEM_TEMPLATES) {
        const { id, ...data } = tpl;
        await this.prisma.labelTemplate.upsert({ where: { id }, create: { id, ...data }, update: {} });
      }
    } catch (err) {
      console.error(
        '[LabelTemplatesService] Nie udało się zaseedować szablonów systemowych — ' +
        'prawdopodobnie tabela label_templates jeszcze nie istnieje (uruchom `prisma db push`, ' +
        'a następnie zrestartuj backend). System etykiet będzie działał bez szablonów systemowych ' +
        'do czasu naprawy, ale reszta aplikacji (w tym logowanie) NIE zostanie tym zablokowana.',
        err,
      );
    }
  }

  // Szablony ostrzegawcze (isWarning) są dostępne niezależnie od
  // targetType, bo ich treść jest wpisywana ręcznie i nie zależy od
  // danych konkretnego modułu
  findTemplates(targetType: LabelTargetType) {
    return this.prisma.labelTemplate.findMany({
      where: { OR: [{ targetType }, { isWarning: true }] },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async findTemplate(id: string) {
    const tpl = await this.prisma.labelTemplate.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundException('Szablon etykiety nie został znaleziony');
    return tpl;
  }

  // Pola dostępne do wyboru w edytorze szablonu dla danego targetType —
  // pochodzą wprost z LabelDataProvider tego modułu
  getAvailableFields(targetType: LabelTargetType) {
    return this.registry.get(targetType).getAvailableFields();
  }

  createTemplate(dto: CreateLabelTemplateDto, requesterRole: Role, createdById: string) {
    assertPrivileged(requesterRole);
    return this.prisma.labelTemplate.create({
      data: {
        name: dto.name,
        targetType: dto.targetType,
        widthMm: dto.widthMm ?? 50,
        heightMm: dto.heightMm ?? 30,
        fieldsLayout: dto.fieldsLayout as unknown as Prisma.InputJsonValue,
        includeQr: dto.includeQr ?? false,
        isWarning: dto.isWarning ?? false,
        createdById,
      },
    });
  }

  async updateTemplate(id: string, dto: UpdateLabelTemplateDto, requesterRole: Role) {
    assertPrivileged(requesterRole);
    const tpl = await this.findTemplate(id);
    if (tpl.isSystem) throw new ForbiddenException('Szablony systemowe nie mogą być edytowane — zduplikuj go, aby stworzyć własną wersję');
    return this.prisma.labelTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        widthMm: dto.widthMm,
        heightMm: dto.heightMm,
        fieldsLayout: dto.fieldsLayout as unknown as Prisma.InputJsonValue | undefined,
        includeQr: dto.includeQr,
      },
    });
  }

  async duplicateTemplate(id: string, requesterRole: Role, createdById: string) {
    assertPrivileged(requesterRole);
    const tpl = await this.findTemplate(id);
    return this.prisma.labelTemplate.create({
      data: {
        name: `${tpl.name} (kopia)`,
        targetType: tpl.targetType,
        widthMm: tpl.widthMm,
        heightMm: tpl.heightMm,
        fieldsLayout: tpl.fieldsLayout as unknown as Prisma.InputJsonValue,
        includeQr: tpl.includeQr,
        isWarning: tpl.isWarning,
        createdById,
      },
    });
  }

  async deleteTemplate(id: string, requesterRole: Role) {
    assertPrivileged(requesterRole);
    const tpl = await this.findTemplate(id);
    if (tpl.isSystem) throw new ForbiddenException('Szablony systemowe nie mogą być usunięte');
    await this.prisma.labelTemplate.delete({ where: { id } });
    return { success: true };
  }

  // Rozwiązanie QR: adres docelowy w aplikacji dla danego rekordu —
  // używane przez stronę przekierowania /qr/[type]/[id]
  async resolveTarget(targetType: LabelTargetType, recordId: string) {
    const resolved = await this.registry.get(targetType).resolve(recordId);
    if (!resolved) throw new NotFoundException('Element nie został znaleziony');
    return { targetPath: resolved.targetPath, displayName: resolved.displayName };
  }
}
