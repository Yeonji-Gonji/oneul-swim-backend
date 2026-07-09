import { Module } from '@nestjs/common';
import { FreshnessService } from './freshness.service';

@Module({
  providers: [FreshnessService],
  exports: [FreshnessService],
})
export class FreshnessModule {}
