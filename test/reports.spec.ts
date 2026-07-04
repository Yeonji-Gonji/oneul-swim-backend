import { BadRequestException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateReportDto } from '../src/reports/dto/create-report.dto';
import { ReportsController } from '../src/reports/reports.controller';
import { ReportsService } from '../src/reports/reports.service';

describe('CreateReportDto 검증', () => {
  const base = {
    poolId: 'hanam-misa',
    reason: '자유수영 시간',
    content: '토요일 16시 세션이 없어졌어요',
    deviceId: 'device-uuid-1234',
  };

  it('정상 입력은 통과한다', async () => {
    const dto = plainToInstance(CreateReportDto, base);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('정해진 사유가 아니면 거부한다', async () => {
    const dto = plainToInstance(CreateReportDto, { ...base, reason: '스팸' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });

  it('짧은 deviceId는 거부한다 (익명 식별자 최소 길이)', async () => {
    const dto = plainToInstance(CreateReportDto, { ...base, deviceId: 'ab' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'deviceId')).toBe(true);
  });
});

describe('ReportsService', () => {
  const prisma = {
    report: { create: jest.fn(), findMany: jest.fn() },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new ReportsService(prisma as any);

  it('content가 없으면 빈 문자열로 저장한다', () => {
    service.create({
      poolId: 'hanam-misa',
      reason: '요금',
      deviceId: 'device-uuid-1234',
    });
    expect(prisma.report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: '' }),
      }),
    );
  });

  it('내 제보는 최신순 최대 20건만 조회한다', () => {
    service.findMine('device-uuid-1234');
    expect(prisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deviceId: 'device-uuid-1234' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    );
  });
});

describe('ReportsController', () => {
  const service = { create: jest.fn(), findMine: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controller = new ReportsController(service as any);

  it('deviceId 없이 내역을 조회하면 400', () => {
    expect(() => controller.findMine(undefined)).toThrow(BadRequestException);
  });
});
