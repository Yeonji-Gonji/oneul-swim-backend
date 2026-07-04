import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  CreateSubscriptionDto,
  RemoveSubscriptionDto,
} from './dto/create-subscription.dto';
import { PushService } from './push.service';

@Controller()
export class PushController {
  constructor(private readonly push: PushService) {}

  /** 아침 요약 구독 등록 (브라우저 PushSubscription JSON) */
  @Post('subscriptions')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  subscribe(@Body() dto: CreateSubscriptionDto) {
    return this.push.subscribe(dto);
  }

  /** 구독 해제 */
  @Delete('subscriptions')
  unsubscribe(@Body() dto: RemoveSubscriptionDto) {
    return this.push.unsubscribe(dto.endpoint);
  }

  /** 오늘 요약 미리보기 (읽기 전용, 발송 없음) */
  @Get('push/preview')
  preview() {
    return this.push.previewSummary();
  }
}
