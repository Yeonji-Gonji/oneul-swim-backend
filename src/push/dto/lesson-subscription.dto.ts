import { IsString, IsUrl, MaxLength } from 'class-validator';

/**
 * 강습 접수 소식 구독. 아침 요약(중첩 keys 형태)과 달리 endpoint/p256dh/auth 를
 * 평면 바디로 받는다(프론트 계약).
 */
export class CreateLessonSubscriptionDto {
  @IsUrl({ require_protocol: true })
  @MaxLength(1024)
  endpoint: string;

  @IsString()
  @MaxLength(256)
  p256dh: string;

  @IsString()
  @MaxLength(64)
  auth: string;
}

export class RemoveLessonSubscriptionDto {
  @IsString()
  @MaxLength(1024)
  endpoint: string;
}
