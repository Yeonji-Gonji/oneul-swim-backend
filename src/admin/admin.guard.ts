import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

/** Express 타입 패키지에 의존하지 않도록 필요한 필드만 최소 정의 */
interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * 미니 어드민 토큰 인증.
 * ADMIN_TOKEN env 와 Authorization: Bearer <token> 을 비교한다.
 * env 미설정 시에는 모든 admin 라우트를 503 으로 막는다(안전 기본값).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.ADMIN_TOKEN;
    if (!expected) {
      throw new ServiceUnavailableException('어드민이 설정되지 않았습니다.');
    }
    const req = context.switchToHttp().getRequest<RequestLike>();
    const header = req.headers['authorization'];
    const token =
      typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice('Bearer '.length)
        : null;
    if (!token || token !== expected) {
      throw new UnauthorizedException('유효한 관리자 토큰이 필요합니다.');
    }
    return true;
  }
}
