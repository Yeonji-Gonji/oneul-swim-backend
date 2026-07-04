import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { PushModule } from './push/push.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    // 전역 속도 제한: IP당 1분에 30회 (엔드포인트별 상세 제한은 각 컨트롤러에서)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    ReportsModule,
    PushModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
