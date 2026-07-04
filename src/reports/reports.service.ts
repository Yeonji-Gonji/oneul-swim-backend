import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';

/** "내 제보 내역"이 무한히 길어지지 않도록 최근 것만 돌려준다 */
const MY_REPORTS_LIMIT = 20;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateReportDto) {
    return this.prisma.report.create({
      data: {
        poolId: dto.poolId,
        reason: dto.reason,
        content: dto.content ?? '',
        deviceId: dto.deviceId,
      },
      select: { id: true, status: true, createdAt: true },
    });
  }

  findMine(deviceId: string) {
    return this.prisma.report.findMany({
      where: { deviceId },
      orderBy: { createdAt: 'desc' },
      take: MY_REPORTS_LIMIT,
      select: {
        id: true,
        poolId: true,
        reason: true,
        content: true,
        status: true,
        createdAt: true,
      },
    });
  }
}
