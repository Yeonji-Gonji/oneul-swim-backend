import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PoolsService } from '../pools/pools.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  configureWebPush,
  sendPush,
  summarizeSends,
} from '../push/web-push.helper';
import {
  AnnounceDto,
  ApproveDraftDto,
  DraftStatusValue,
  KakaoLoginDto,
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
    if (dto.sido !== undefined) data.sido = dto.sido;
    if (dto.sigungu !== undefined) data.sigungu = dto.sigungu;
    if (dto.region !== undefined) data.region = dto.region;
    if (dto.dataStatus !== undefined) data.dataStatus = dto.dataStatus;
    if (dto.freeSwim !== undefined) {
      data.freeSwim = dto.freeSwim as Prisma.InputJsonValue;
    }
    if (dto.lessons !== undefined) {
      data.lessons = dto.lessons as Prisma.InputJsonValue;
    }
    if (dto.fees !== undefined) {
      data.fees = dto.fees as Prisma.InputJsonValue;
    }
    const updated = await this.prisma.pool.update({ where: { id }, data });
    this.pools.invalidateCache();
    return updated;
  }

  /**
   * 카카오 로그인 — 인가코드를 access_token 으로 교환 → 사용자 식별 →
   * **본인 카카오 id(ADMIN_KAKAO_ID)일 때만** 어드민 토큰(ADMIN_TOKEN)을 발급한다.
   * 발급된 토큰은 기존 AdminGuard 로 보호되는 모든 어드민 라우트에 그대로 쓰인다.
   */
  async loginWithKakao(dto: KakaoLoginDto) {
    const restKey = process.env.KAKAO_REST_KEY;
    const adminKakaoId = process.env.ADMIN_KAKAO_ID;
    const adminToken = process.env.ADMIN_TOKEN;
    if (!restKey || !adminKakaoId || !adminToken) {
      this.logger.error(
        '카카오 로그인 환경변수 누락(KAKAO_REST_KEY / ADMIN_KAKAO_ID / ADMIN_TOKEN)',
      );
      throw new UnauthorizedException('로그인이 구성되지 않았습니다.');
    }

    // 1) 인가코드 → access_token
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: restKey,
      redirect_uri: dto.redirectUri,
      code: dto.code,
    });
    const clientSecret = process.env.KAKAO_CLIENT_SECRET;
    if (clientSecret) params.set('client_secret', clientSecret);

    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!tokenRes.ok) {
      this.logger.warn(`카카오 토큰 교환 실패: ${tokenRes.status}`);
      throw new UnauthorizedException('카카오 인증에 실패했습니다.');
    }
    const tokenBody = (await tokenRes.json()) as { access_token?: string };
    if (!tokenBody.access_token) {
      throw new UnauthorizedException('카카오 토큰을 받지 못했습니다.');
    }

    // 2) access_token → 사용자 식별
    const meRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokenBody.access_token}` },
    });
    if (!meRes.ok) {
      throw new UnauthorizedException('카카오 사용자 조회에 실패했습니다.');
    }
    const me = (await meRes.json()) as {
      id?: number;
      kakao_account?: { profile?: { nickname?: string } };
    };

    // 3) 본인 계정만 승인 권한 부여
    if (String(me.id) !== adminKakaoId) {
      this.logger.warn(`권한 없는 카카오 계정 접근 시도: ${me.id}`);
      throw new ForbiddenException('승인 권한이 없는 계정입니다.');
    }

    return {
      token: adminToken,
      nickname: me.kakao_account?.profile?.nickname ?? '관리자',
    };
  }

  /** 시간표 AI 초안 목록(status 필터, 미지정 시 PENDING, 최근순 최대 200건) */
  listScheduleDrafts(status?: DraftStatusValue) {
    return this.prisma.scheduleDraft.findMany({
      where: { status: status ?? 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /**
   * 초안 승인 → Pool.freeSwim 에 반영.
   * 어드민이 본문으로 교정한 sessions/laneInfo/notice 가 있으면 그 값을, 없으면 초안 값을 쓴다.
   * 반영과 동시에 dataStatus 를 full 로 올리고(세션이 생겼으므로), 신선도용 updatedAt 을 오늘로 갱신한다.
   */
  async approveScheduleDraft(id: string, dto: ApproveDraftDto) {
    const draft = await this.ensureExists(
      this.prisma.scheduleDraft.findUnique({ where: { id } }),
    );
    await this.ensureExists(
      this.prisma.pool.findUnique({ where: { id: draft.poolId } }),
    );

    const sessions = dto.sessions ?? (draft.sessions as Prisma.InputJsonValue);
    const laneInfo = dto.laneInfo ?? draft.laneInfo;
    const notice = dto.notice ?? draft.notice;

    const poolData: Prisma.PoolUpdateInput = {
      freeSwim: { sessions } as Prisma.InputJsonValue,
      dataStatus: 'full',
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    if (laneInfo) poolData.laneInfo = laneInfo;
    if (notice) poolData.notice = notice;

    await this.prisma.pool.update({
      where: { id: draft.poolId },
      data: poolData,
    });
    const reviewed = await this.prisma.scheduleDraft.update({
      where: { id },
      data: { status: 'APPROVED', reviewedAt: new Date() },
    });
    this.pools.invalidateCache();
    return { ok: true, poolId: draft.poolId, draft: reviewed };
  }

  /** 초안 반려 */
  async rejectScheduleDraft(id: string) {
    await this.ensureExists(
      this.prisma.scheduleDraft.findUnique({ where: { id } }),
    );
    return this.prisma.scheduleDraft.update({
      where: { id },
      data: { status: 'REJECTED', reviewedAt: new Date() },
    });
  }

  /**
   * 요금표 일괄 교체 — 전국 확장 이행기 호환.
   * 요금은 이제 시설별(Pool.fees)이라, 이 엔드포인트는 자유수영 완비(dataStatus='full')
   * 시설 전체에 동일 요금표를 적용한다(기존 "전역 요금표 편집" UX 유지).
   * 개별 시설 요금은 PATCH /admin/pools/:id 의 fees 로 수정한다.
   */
  async replaceFees(dto: ReplaceFeesDto) {
    const res = await this.prisma.pool.updateMany({
      where: { dataStatus: 'full' },
      data: { fees: dto.tiers as unknown as Prisma.InputJsonValue },
    });
    this.pools.invalidateCache();
    return { ok: true, count: res.count };
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
