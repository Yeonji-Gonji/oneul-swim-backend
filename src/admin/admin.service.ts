import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { flattenFeeTiers } from '../pools/pools.assembler';
import { PoolsService } from '../pools/pools.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  configureWebPush,
  sendPush,
  summarizeSends,
} from '../push/web-push.helper';
import {
  AnnounceDto,
  RegisterPushTargetDto,
  ReplaceFeesDto,
  ReportStatusValue,
  UpdatePoolDto,
} from './dto/admin.dto';

/** 어드민 목록 조회 상한 */
const REPORTS_TAKE = 100;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly pushConfigured: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pools: PoolsService,
  ) {
    this.pushConfigured = configureWebPush();
  }

  /** 제보 목록(status 필터, 최근순, 최대 100건) */
  listReports(status?: ReportStatusValue) {
    return this.prisma.report.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: REPORTS_TAKE,
    });
  }

  /** 제보 상태 변경 */
  async updateReportStatus(id: string, status: ReportStatusValue) {
    await this.ensureExists(this.prisma.report.findUnique({ where: { id } }));
    return this.prisma.report.update({ where: { id }, data: { status } });
  }

  /** 수영장 부분 수정(무배포 데이터 갱신) */
  async updatePool(id: string, dto: UpdatePoolDto) {
    await this.ensureExists(this.prisma.pool.findUnique({ where: { id } }));
    const data: Prisma.PoolUpdateInput = {};
    if (dto.notice !== undefined) data.notice = dto.notice;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.laneInfo !== undefined) data.laneInfo = dto.laneInfo;
    if (dto.updatedAt !== undefined) data.updatedAt = dto.updatedAt;
    if (dto.freeSwim !== undefined) {
      data.freeSwim = dto.freeSwim as Prisma.InputJsonValue;
    }
    if (dto.lessons !== undefined) {
      data.lessons = dto.lessons as Prisma.InputJsonValue;
    }
    const updated = await this.prisma.pool.update({ where: { id }, data });
    this.pools.invalidateCache();
    return updated;
  }

  /** 요금표 전체 교체(FeeTier upsert) */
  async replaceFees(dto: ReplaceFeesDto) {
    const rows = flattenFeeTiers(dto.tiers);
    await this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.feeTier.upsert({
          where: { tier_target: { tier: row.tier, target: row.target } },
          create: row,
          update: { price: row.price },
        }),
      ),
    );
    this.pools.invalidateCache();
    return { ok: true, count: rows.length };
  }

  /** 신선도 알림 목록(resolved 필터) */
  listFreshness(resolved?: boolean) {
    return this.prisma.freshnessAlert.findMany({
      where: resolved === undefined ? undefined : { resolved },
      orderBy: { detectedAt: 'desc' },
      take: 100,
    });
  }

  /** 신선도 알림 처리 상태 변경 */
  async updateFreshness(id: string, resolved: boolean) {
    await this.ensureExists(
      this.prisma.freshnessAlert.findUnique({ where: { id } }),
    );
    return this.prisma.freshnessAlert.update({
      where: { id },
      data: { resolved },
    });
  }

  /** 관리자 알림 수신 기기 등록(단일 행 upsert) */
  registerPushTarget(dto: RegisterPushTargetDto) {
    return this.prisma.adminPushTarget.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        endpoint: dto.endpoint,
        p256dh: dto.p256dh,
        auth: dto.auth,
      },
      update: { endpoint: dto.endpoint, p256dh: dto.p256dh, auth: dto.auth },
    });
  }

  /**
   * 강습 접수 소식 구독자 전체에게 푸시(best-effort).
   * 만료(410)된 endpoint 는 자동 삭제한다. {sent, failed} 를 반환한다.
   */
  async announce(dto: AnnounceDto): Promise<{ sent: number; failed: number }> {
    if (!this.pushConfigured) {
      this.logger.warn('VAPID 키 미설정 — 강습 소식 발송 비활성');
      return { sent: 0, failed: 0 };
    }
    const subs = await this.prisma.lessonSubscription.findMany();
    const payload = { title: dto.title, body: dto.body };
    const results = await Promise.all(
      subs.map((sub) => sendPush(sub, payload)),
    );
    const { sent, failed, goneEndpoints } = summarizeSends(results);
    if (goneEndpoints.length > 0) {
      await this.prisma.lessonSubscription.deleteMany({
        where: { endpoint: { in: goneEndpoints } },
      });
    }
    this.logger.log(
      `강습 소식 발송: 대상 ${subs.length}건, 성공 ${sent}, 실패 ${failed}, 정리 ${goneEndpoints.length}`,
    );
    return { sent, failed };
  }

  /** 조회 결과가 없으면 404 */
  private async ensureExists<T>(query: Promise<T | null>): Promise<T> {
    const found = await query;
    if (!found) throw new NotFoundException('대상을 찾을 수 없습니다.');
    return found;
  }
}
