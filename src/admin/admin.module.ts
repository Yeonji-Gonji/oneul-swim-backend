import { Module } from '@nestjs/common';
import { PoolsModule } from '../pools/pools.module';
import { AdminAuthController } from './admin-auth.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [PoolsModule],
  controllers: [AdminAuthController, AdminController],
  providers: [AdminService],
})
export class AdminModule {}
