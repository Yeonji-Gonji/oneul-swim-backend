import { Module } from '@nestjs/common';
import { PoolsModule } from '../pools/pools.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [PoolsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
