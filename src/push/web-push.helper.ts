/**
 * Web Push 공통 헬퍼. 아침 요약·강습 소식·관리자 알림이 모두 이 함수를 통해 발송한다.
 * 특정 테이블에 의존하지 않도록 "발송"과 "만료 판정"만 담당하고,
 * 구독 정리(410 삭제)는 각 서비스가 반환값을 보고 처리한다.
 */
import * as webPush from 'web-push';

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
}

/** 단일 발송 결과 */
export interface SendOutcome {
  endpoint: string;
  /** 발송 성공 여부 */
  ok: boolean;
  /** 구독이 만료(404/410)돼 정리 대상인지 */
  gone: boolean;
}

/**
 * VAPID 키가 설정돼 있으면 web-push 를 구성하고 true 를 반환한다.
 * 키가 없으면 발송을 비활성(false)한다. 여러 번 호출해도 안전하다.
 */
export function configureWebPush(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:upfall.juni@gmail.com',
    publicKey,
    privateKey,
  );
  return true;
}

/** 구독이 만료(404/410)됐는지 판단한다(브라우저에서 구독 해제된 경우) */
export function isGoneError(error: unknown): boolean {
  const status = (error as { statusCode?: number } | null | undefined)
    ?.statusCode;
  return status === 404 || status === 410;
}

/**
 * 단일 구독에 발송한다. throw 하지 않고 결과를 반환한다(best-effort 대량 발송용).
 */
export async function sendPush(
  sub: PushSub,
  payload: PushPayload,
): Promise<SendOutcome> {
  try {
    await webPush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
    return { endpoint: sub.endpoint, ok: true, gone: false };
  } catch (error) {
    return { endpoint: sub.endpoint, ok: false, gone: isGoneError(error) };
  }
}

/**
 * 발송 결과 배열을 집계한다(순수 함수 — 테스트 용이).
 * 성공/실패 수와 정리 대상(만료) endpoint 목록을 돌려준다.
 */
export function summarizeSends(results: SendOutcome[]): {
  sent: number;
  failed: number;
  goneEndpoints: string[];
} {
  const sent = results.filter((r) => r.ok).length;
  return {
    sent,
    failed: results.length - sent,
    goneEndpoints: results.filter((r) => r.gone).map((r) => r.endpoint),
  };
}
