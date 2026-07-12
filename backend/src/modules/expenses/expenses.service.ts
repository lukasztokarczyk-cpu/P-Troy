import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FileStorageService } from '../../common/storage/file-storage.service';
import { CreateExpenseNoteDto } from './dto/expense-note.dto';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
  ) {}

  /**
   * "Obowiązkowe dodanie zdjęcia paragonu lub faktury" — zapisywane na
   * serwerze plików (nie w bazie), baza trzyma tylko ścieżkę, zgodnie
   * z resztą systemu. "Zapisywane są na koncie instalatora" — userId
   * zawsze pochodzi z sesji zalogowanego użytkownika, nie z body.
   */
  async create(dto: CreateExpenseNoteDto, userId: string) {
    const receiptPath = await this.storage.saveBase64Image(
      dto.receiptBase64,
      `expenses/${userId}/${Date.now()}.png`,
    );

    return this.prisma.expenseNote.create({
      data: {
        userId,
        type: dto.type,
        amount: dto.amount,
        description: dto.description,
        vehicleId: dto.vehicleId,
        receiptPath,
      },
    });
  }

  // Instalator widzi wyłącznie własną historię
  async findMine(userId: string) {
    return this.prisma.expenseNote.findMany({
      where: { userId },
      include: { vehicle: { select: { brand: true, model: true, registrationNumber: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // "Notatki widoczne wyłącznie dla administratora" — pełna lista wszystkich
  async findAll() {
    return this.prisma.expenseNote.findMany({
      include: {
        user: { select: { firstName: true, lastName: true } },
        vehicle: { select: { brand: true, model: true, registrationNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Historia tankowań konkretnego pojazdu (widok z modułu Pojazdy)
  async findRefuelingsForVehicle(vehicleId: string) {
    return this.prisma.expenseNote.findMany({
      where: { vehicleId, type: 'REFUELING' },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Tankowania danego instalatora w formie gotowej do wyświetlenia
   * w Harmonogramie (widoczne dla administratora oraz dla samego
   * instalatora — patrz kontroler). Zwraca lekki kształt zbliżony do
   * wydarzenia kalendarza, ale to NIE są prawdziwe ScheduleEvent —
   * dane pozostają wyłącznie w ExpenseNote, tu tylko przeformatowane
   * pod kątem wyświetlenia w kalendarzu.
   */
  async findRefuelingsForCalendar(userId?: string) {
    const notes = await this.prisma.expenseNote.findMany({
      where: { type: 'REFUELING', userId },
      include: { vehicle: { select: { brand: true, model: true, registrationNumber: true } }, user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return notes.map((n) => ({
      id: `refueling-${n.id}`,
      title: `Tankowanie${n.vehicle ? ` — ${n.vehicle.brand} ${n.vehicle.model}` : ''}`,
      type: 'REFUELING' as const,
      date: n.createdAt,
      installerId: n.user.id,
      installerName: `${n.user.firstName} ${n.user.lastName}`,
      amount: n.amount,
    }));
  }
}
