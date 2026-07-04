import { Type } from 'class-transformer';
import {
  IsObject,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class SubscriptionKeysDto {
  @IsString()
  @MaxLength(256)
  p256dh: string;

  @IsString()
  @MaxLength(64)
  auth: string;
}

/** 브라우저 PushSubscription.toJSON() 형태 그대로 받는다 */
export class CreateSubscriptionDto {
  @IsUrl({ require_protocol: true })
  @MaxLength(1024)
  endpoint: string;

  @IsObject()
  @ValidateNested()
  @Type(() => SubscriptionKeysDto)
  keys: SubscriptionKeysDto;
}

export class RemoveSubscriptionDto {
  @IsString()
  @MaxLength(1024)
  endpoint: string;
}
