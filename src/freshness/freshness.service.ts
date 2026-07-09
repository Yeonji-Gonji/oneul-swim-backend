import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as webPush from 'web-push';
import { sourceUrlsFromFile } from '../pools/pools-file';
import { PrismaService } from '../prisma/prisma.service';
import { diffSnapshot, hashContent } from './freshness.diff';

/** 원본 페이지 fetch 타임아웃(ms) */
const FETCH_TIMEOUT_MS = 15_000;

@Injectable()
export class FreshnessService {
  private readonly logger = new Logger(FreshnessService.name);
  private readonly pushConfigured: boolean;

  constructor(private readonly prisma: PrismaService) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    this.pushConfigured = Boolean(publicKey && privateKey);
    if (this.pushConfigured) {
      webPush.setVapidDetails(
        process.env.VAPID_SUBJECT ?? 'mailto:upfall.juni@gmail.com',
        publicKey!,
        privateKey!,
      );
    }
  }

  /**
   * 매주 월 09:00(KST) 원본 페이지 신선도 감시.
   * 감지·알림까지만 — 자동 반영은 하지 않는다(사람 검토용 레코드를 남긴다).
   */
  @Cron('0 9 * * 1', { timeZone: 'Asia/Seoul' })
  async checkAll(): Promise<{ checked: number; alerts: number }> {
    let checked = 0;
    let alerts = 0;
    try {
      const urls = sourceUrlsFromFile();
      this.logger.log(`신선도 감시 시작: 대상 ${urls.length}개`);
      for (const url of urls) {
        try {
          const alerted = await this.checkUrl(url);
          checked += 1;
          if (alerted) alerts += 1;
        } catch (error) {
          // 개별 URL 실패(네트워크/타임아웃)는 조용히 스킵 — 크론을 죽이지 않는다
          this.logger.warn(`신선도 감시 스킵 (${url}): ${String(error)}`);
        }
      }
      this.logger.log(`신선도 감시 완료: 확인 ${checked}건, 변경 ${alerts}건`);
    } catch (error) {
      // 전체를 감싸 크론이 서버를 죽이지 않도록 방어
      this.logger.error(`신선도 감시 전체 실패: ${String(error)}`);
    }
    return { checked, alerts };
  }

  /** 단일 URL 확인. 변경 시 스냅샷 갱신 + 알림 레코드 + (가능하면)관리자 푸시. 알림 여부 반환 */
  private async checkUrl(url: string): Promise<boolean> {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      this.logger.warn(`신선도 감시 HTTP ${res.status} (${url}) — 스킵`);
      return false;
    }
    const text = await res.text();
    const newHash = hashContent(text);

    const existing = await this.prisma.crawlSnapshot.findUnique({
      where: { url },
    });
    const decision = diffSnapshot({
      existingHash: existing?.contentHash ?? null,
      newHash,
    });

    if (decision.shouldUpsert) {
      await this.prisma.crawlSnapshot.upsert({
        where: { url },
        create: { url, contentHash: newHash, content: text },
        update: { contentHash: newHash, content: text },
      });
    }

    if (decision.shouldAlert && existing) {
      await this.prisma.freshnessAlert.create({
        data: { url, oldHash: existing.contentHash, newHash },
      });
      await this.notifyAdmin(url).catch(() => undefined); // best-effort
      this.logger.log(`원본 변경 감지: ${url}`);
      return true;
    }
    return false;
  }

  /** 관리자 기기가 등록돼 있으면 변경 알림 푸시(실패는 무시) */
  private async notifyAdmin(url: string): Promise<void> {
    if (!this.pushConfigured) return;
    const target = await this.prisma.adminPushTarget.findUnique({
      where: { id: 'singleton' },
    });
    if (!target) return;
    await webPush.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dh, auth: target.auth },
      },
      JSON.stringify({
        title: '수영장 정보 원본 변경 감지',
        body: `원본 페이지가 바뀌었어요. 검토가 필요합니다: ${url}`,
      }),
    );
  }
}
