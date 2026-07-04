import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CreateReportDto } from './dto/create-report.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** 제보 등록. 스팸 방지를 위해 IP당 1분 5회로 별도 제한 */
  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  create(@Body() dto: CreateReportDto) {
    return this.reports.create(dto);
  }

  /** 내 제보 내역 (익명 deviceId 기준) */
  @Get()
  findMine(@Query('deviceId') deviceId?: string) {
    if (!deviceId || deviceId.length < 8) {
      throw new BadRequestException('deviceId 쿼리가 필요합니다.');
    }
    return this.reports.findMine(deviceId);
  }
}
