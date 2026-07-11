import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import {
  AnnounceDto,
  ApproveDraftDto,
  ListDraftsQueryDto,
  ListReportsQueryDto,
  RegisterPushTargetDto,
  ReplaceFeesDto,
  UpdateFreshnessDto,
  UpdatePoolDto,
  UpdateReportStatusDto,
} from './dto/admin.dto';

/** 미니 어드민 — 전 라우트 AdminGuard(토큰) 보호 */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /** 제보 목록(status 필터) */
  @Get('reports')
  listReports(@Query() query: ListReportsQueryDto) {
    return this.admin.listReports(query.status);
  }

  /** 제보 상태 변경 */
  @Patch('reports/:id')
  updateReport(@Param('id') id: string, @Body() dto: UpdateReportStatusDto) {
    return this.admin.updateReportStatus(id, dto.status);
  }

  /** 수영장 부분 수정(무배포 데이터 갱신) */
  @Patch('pools/:id')
  updatePool(@Param('id') id: string, @Body() dto: UpdatePoolDto) {
    return this.admin.updatePool(id, dto);
  }

  /** 요금표 전체 교체 */
  @Put('fees')
  replaceFees(@Body() dto: ReplaceFeesDto) {
    return this.admin.replaceFees(dto);
  }

  /** 신선도 알림 목록(resolved 필터: 'true'|'false') */
  @Get('freshness')
  listFreshness(@Query('resolved') resolved?: string) {
    const parsed =
      resolved === undefined ? undefined : resolved !== 'false';
    return this.admin.listFreshness(parsed);
  }

  /** 신선도 알림 처리 */
  @Patch('freshness/:id')
  updateFreshness(@Param('id') id: string, @Body() dto: UpdateFreshnessDto) {
    return this.admin.updateFreshness(id, dto.resolved);
  }

  /** 관리자 알림 수신 기기 등록 */
  @Post('push-target')
  registerPushTarget(@Body() dto: RegisterPushTargetDto) {
    return this.admin.registerPushTarget(dto);
  }

  /** 강습 접수 소식 발송 — 구독자 전체에게 푸시 */
  @Post('announce')
  announce(@Body() dto: AnnounceDto) {
    return this.admin.announce(dto);
  }

  /** 자유수영 시간표 AI 초안 목록(status 필터, 미지정 시 PENDING) */
  @Get('schedule-drafts')
  listScheduleDrafts(@Query() query: ListDraftsQueryDto) {
    return this.admin.listScheduleDrafts(query.status);
  }

  /** 초안 승인 → Pool.freeSwim 에 반영(어드민 교정값 우선) */
  @Post('schedule-drafts/:id/approve')
  approveScheduleDraft(@Param('id') id: string, @Body() dto: ApproveDraftDto) {
    return this.admin.approveScheduleDraft(id, dto);
  }

  /** 초안 반려 */
  @Post('schedule-drafts/:id/reject')
  rejectScheduleDraft(@Param('id') id: string) {
    return this.admin.rejectScheduleDraft(id);
  }
}
