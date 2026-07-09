import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { FreshnessModule } from './freshness/freshness.module';
import { HealthController } from './health/health.controller';
import { PoolsModule } from './pools/pools.module';
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
    PoolsModule,
    AdminModule,
    FreshnessModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
