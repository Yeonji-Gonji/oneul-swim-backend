import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as webPush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { buildMorningSummary, SummaryPool } from './morning-summary';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly configured: boolean;
  private readonly pools: SummaryPool[];

  constructor(private readonly prisma: PrismaService) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    this.configured = Boolean(publicKey && privateKey);
    if (this.configured) {
      webPush.setVapidDetails(
        process.env.VAPID_SUBJECT ?? 'mailto:upfall.juni@gmail.com',
        publicKey!,
        privateKey!,
      );
    } else {
      this.logger.warn('VAPID 키 미설정 — 푸시 발송 비활성');
    }
    this.pools = (
      JSON.parse(
        readFileSync(join(process.cwd(), 'data', 'pools.json'), 'utf-8'),
      ) as { pools: SummaryPool[] }
    ).pools;
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
    await this.sendTo(sub, {
      title: '아침 요약 알림 설정 완료',
      body: '매일 오전 8시에 오늘의 자유수영 정보를 알려드릴게요.',
    }).catch(() => undefined);
    return { ok: true };
  }

  async unsubscribe(endpoint: string) {
    await this.prisma.pushSubscription
      .delete({ where: { endpoint } })
      .catch(() => undefined); // 이미 없으면 조용히 성공
    return { ok: true };
  }

  /** 오늘 요약 미리보기 (검증·데모용, 발송 없음) */
  previewSummary() {
    return buildMorningSummary(this.pools, this.kstNow());
  }

  /** 매일 오전 8시(KST) 아침 요약 발송 */
  @Cron('0 8 * * *', { timeZone: 'Asia/Seoul' })
  async sendMorningSummary() {
    if (!this.configured) return;
    const payload = buildMorningSummary(this.pools, this.kstNow());
    const subs = await this.prisma.pushSubscription.findMany();
    this.logger.log(`아침 요약 발송 시작: 구독 ${subs.length}건`);

    const results = await Promise.allSettled(
      subs.map((sub) => this.sendTo(sub, payload)),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    this.logger.log(`아침 요약 발송 완료 (실패 ${failed}건)`);
  }

  private async sendTo(
    sub: { endpoint: string; p256dh: string; auth: string },
    payload: { title: string; body: string },
  ) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      );
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      // 브라우저에서 구독이 사라진 경우: 목록에서 정리
      if (status === 404 || status === 410) {
        await this.prisma.pushSubscription
          .delete({ where: { endpoint: sub.endpoint } })
          .catch(() => undefined);
      }
      throw error;
    }
  }

  /** KST 현재 시각 (UTC 게터로 읽는 보정 Date) */
  private kstNow(): Date {
    return new Date(Date.now() + 9 * 3600 * 1000);
  }
}
