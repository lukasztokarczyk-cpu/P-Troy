import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

interface AuditFilter {
  userId?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(filter: AuditFilter) {
    return this.prisma.auditLog.findMany({
      where: {
        userId: filter.userId,
        entityType: filter.entityType,
        entityId: filter.entityId,
        createdAt: {
          gte: filter.from ? new Date(filter.from) : undefined,
          lte: filter.to ? new Date(filter.to) : undefined,
        },
      },
      include: { user: { select: { firstName: true, lastName: true, login: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  // Wpis ręczny — dla zdarzeń, które nie przechodzą przez standardowy
  // HTTP request (np. logowanie, zdarzenia z crona, WebSocket)
  async record(params: {
    userId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.prisma.auditLog.create({ data: params });
  }
}
