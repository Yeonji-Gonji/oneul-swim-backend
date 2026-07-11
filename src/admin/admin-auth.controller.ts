import { Body, Controller, Post } from '@nestjs/common';
import { AdminService } from './admin.service';
import { KakaoLoginDto } from './dto/admin.dto';

/**
 * 어드민 로그인 — 공개 라우트(AdminGuard 미적용).
 * 카카오 인가코드를 검증해 **본인 계정일 때만** 어드민 토큰을 발급한다.
 * 발급 토큰으로 이후 AdminController(가드 보호) 라우트를 호출한다.
 */
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly admin: AdminService) {}

  @Post('kakao')
  loginKakao(@Body() dto: KakaoLoginDto) {
    return this.admin.loginWithKakao(dto);
  }
}
