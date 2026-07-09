import { Controller, Get } from '@nestjs/common';
import { PoolsService } from './pools.service';

@Controller('pools')
export class PoolsController {
  constructor(private readonly pools: PoolsService) {}

  /** 수영장 전체 데이터 (프론트 data/pools.json 과 동일 shape) */
  @Get()
  getPools() {
    return this.pools.getPools();
  }
}
