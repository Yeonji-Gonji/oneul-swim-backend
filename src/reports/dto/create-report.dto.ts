import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

/** 프론트 ReportSheet의 REASONS와 동일해야 한다 */
export const REPORT_REASONS = [
  '자유수영 시간',
  '요금',
  '휴관/임시변경',
  '기타',
] as const;

export class CreateReportDto {
  @IsString()
  @Length(1, 64)
  poolId: string;

  @IsIn(REPORT_REASONS)
  reason: (typeof REPORT_REASONS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  content?: string;

  @IsString()
  @Length(8, 64)
  deviceId: string;
}
