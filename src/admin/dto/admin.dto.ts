import { Type } from 'class-transformer';
import {
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
