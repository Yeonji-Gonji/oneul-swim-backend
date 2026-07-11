import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** 제보 상태 값(Prisma ReportStatus 와 동일) */
export const REPORT_STATUSES = ['PENDING', 'APPLIED', 'REJECTED'] as const;
export type ReportStatusValue = (typeof REPORT_STATUSES)[number];

/** GET /admin/reports?status= */
export class ListReportsQueryDto {
  @IsOptional()
  @IsIn(REPORT_STATUSES)
  status?: ReportStatusValue;
}

/** PATCH /admin/reports/:id */
export class UpdateReportStatusDto {
  @IsIn(REPORT_STATUSES)
  status: ReportStatusValue;
}

/** PATCH /admin/pools/:id — 부분 수정(무배포 데이터 갱신) */
export class UpdatePoolDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notice?: string;

  @IsOptional()
  @IsObject()
  freeSwim?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  lessons?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  laneInfo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  updatedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  sido?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  sigungu?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  region?: string;

  @IsOptional()
  @IsIn(['listing', 'full'])
  dataStatus?: string;

  /** 시설별 요금표 { full:{...}, half:{...} } */
  @IsOptional()
  @IsObject()
  fees?: Record<string, unknown>;
}

/** 요금표 { full:{...}, half:{...} } */
class FeeTiersDto {
  @IsObject()
  full: Record<string, number>;

  @IsObject()
  half: Record<string, number>;
}

/** PUT /admin/fees — 요금표 전체 교체 */
export class ReplaceFeesDto {
  @IsObject()
  @ValidateNested()
  @Type(() => FeeTiersDto)
  tiers: FeeTiersDto;
}

/** PATCH /admin/freshness/:id */
export class UpdateFreshnessDto {
  @IsBoolean()
  resolved: boolean;
}

/** 시간표 초안 상태(Prisma DraftStatus 와 동일) */
export const DRAFT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type DraftStatusValue = (typeof DRAFT_STATUSES)[number];

/** GET /admin/schedule-drafts?status= (미지정 시 PENDING) */
export class ListDraftsQueryDto {
  @IsOptional()
  @IsIn(DRAFT_STATUSES)
  status?: DraftStatusValue;
}

/**
 * POST /admin/schedule-drafts/:id/approve
 * 어드민이 초안을 그대로 승인하거나(본문 없음), 검수 중 교정한 값으로 덮어써 승인할 수 있다.
 * sessions 미지정 시 초안의 sessions 를 그대로 Pool.freeSwim 에 반영한다.
 */
export class ApproveDraftDto {
  @IsOptional()
  @IsArray()
  sessions?: Record<string, unknown>[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  laneInfo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notice?: string;
}

/** POST /admin/announce — 강습 접수 소식 구독자 전체에게 푸시 */
export class AnnounceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  body: string;
}

/** POST /admin/auth/kakao — 카카오 인가코드로 로그인(본인 계정만 어드민 토큰 발급) */
export class KakaoLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  redirectUri: string;
}

/** POST /admin/push-target — 관리자 기기 등록 */
export class RegisterPushTargetDto {
  @IsString()
  @MaxLength(1024)
  endpoint: string;

  @IsString()
  @MaxLength(256)
  p256dh: string;

  @IsString()
  @MaxLength(64)
  auth: string;
}
