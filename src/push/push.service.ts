import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { readPoolsFile } from '../pools/pools-file';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { CreateLessonSubscriptionDto } from './dto/lesson-subscription.dto';
import { buildMorningSummary, SummaryPool } from './morning-summary';
import {
  configureWebPush,
  PushPayload,
  PushSub,
  sendPush,
} from './web-push.helper';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly configured: boolean;

  constructor(private readonly prisma: PrismaService) {
    this.configured = configureWebPush();
    if (!this.configured) {
      this.logger.warn('VAPID 키 미설정 — 푸시 발송 비활성');
    }
  }

  /**
   * 아침 요약용 수영장 데이터. DB Pool 을 우선 읽고, 0건이거나 실패하면
   * data/pools.json 파일로 폴백한다(2단계 데이터 이관 대비).
   */
  private async loadPools(): Promise<SummaryPool[]> {
    try {
      const rows = await this.prisma.pool.findMany({
        select: { id: true, name: true, freeSwim: true },
      });
      if (rows.length > 0) {
        return rows.map((row) => ({
          id: row.id,
          name: row.name,
          freeSwim: row.freeSwim as unknown as SummaryPool['freeSwim'],
        }));
      }
    } catch (error) {
      this.logger.warn(`Pool DB 조회 실패 — 파일 폴백: ${String(error)}`);
    }
    return readPoolsFile().pools as unknown as SummaryPool[];
  }

  async subscribe(dto: CreateSubscriptionDto) {
    const sub = await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
      update: { p256dh: dto.keys.p256dh, auth: dto.keys.auth },
    });
    // 구독 직후 확인 푸시 (실패해도 구독 자체는 유효)
    await this.sendMorning(sub, {
      title: '아침 요약 알림 설정 완료',
      body: '매일 오전 8시에 오늘의 자유수영 정보를 알려드릴게요.',
    });
    return { ok: true };
  }

  async unsubscribe(endpoint: string) {
    await this.prisma.pushSubscription
      .delete({ where: { endpoint } })
      .catch(() => undefined); // 이미 없으면 조용히 성공
    return { ok: true };
  }

  /** 강습 접수 소식 구독 등록(endpoint 기준 upsert) */
  async subscribeLessons(dto: CreateLessonSubscriptionDto) {
    const sub = await this.prisma.lessonSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: { endpoint: dto.endpoint, p256dh: dto.p256dh, auth: dto.auth },
      update: { p256dh: dto.p256dh, auth: dto.auth },
    });
    // 구독 직후 확인 푸시 (실패해도 구독 자체는 유효)
    await this.sendLesson(sub, {
      title: '강습 접수 소식 알림 설정 완료',
      body: '새 강습 접수 공지가 올라오면 알려드릴게요.',
    });
    return { ok: true };
  }

  /** 강습 접수 소식 구독 해제 */
  async unsubscribeLessons(endpoint: string) {
    await this.prisma.lessonSubscription
      .delete({ where: { endpoint } })
      .catch(() => undefined);
    return { ok: true };
  }

  /** 오늘 요약 미리보기 (검증·데모용, 발송 없음) */
  async previewSummary() {
    return buildMorningSummary(await this.loadPools(), this.kstNow());
  }

  /** 매일 오전 8시(KST) 아침 요약 발송 */
  @Cron('0 8 * * *', { timeZone: 'Asia/Seoul' })
  async sendMorningSummary() {
    if (!this.configured) return;
    const payload = buildMorningSummary(await this.loadPools(), this.kstNow());
    const subs = await this.prisma.pushSubscription.findMany();
    this.logger.log(`아침 요약 발송 시작: 구독 ${subs.length}건`);

    const results = await Promise.all(
      subs.map((sub) => this.sendMorning(sub, payload)),
    );
    const failed = results.filter((ok) => !ok).length;
    this.logger.log(`아침 요약 발송 완료 (실패 ${failed}건)`);
  }

  /** 아침 요약 구독 1건 발송. 만료(410)면 PushSubscription 정리. 성공 여부 반환 */
  private async sendMorning(sub: PushSub, payload: PushPayload) {
    const { ok, gone } = await sendPush(sub, payload);
    if (gone) {
      await this.prisma.pushSubscription
        .delete({ where: { endpoint: sub.endpoint } })
        .catch(() => undefined);
    }
    return ok;
  }

  /** 강습 소식 구독 1건 발송. 만료(410)면 LessonSubscription 정리. 성공 여부 반환 */
  private async sendLesson(sub: PushSub, payload: PushPayload) {
    const { ok, gone } = await sendPush(sub, payload);
    if (gone) {
      await this.prisma.lessonSubscription
        .delete({ where: { endpoint: sub.endpoint } })
        .catch(() => undefined);
    }
    return ok;
  }

  /** KST 현재 시각 (UTC 게터로 읽는 보정 Date) */
  private kstNow(): Date {
    return new Date(Date.now() + 9 * 3600 * 1000);
  }
}
