import {
  ExecutionContext,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminGuard } from '../src/admin/admin.guard';
import { AdminService } from '../src/admin/admin.service';

/** AdminGuard 가 읽는 요청 헤더만 흉내 낸 ExecutionContext */
const ctx = (authorization?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authorization === undefined ? {} : { authorization },
      }),
    }),
  }) as unknown as ExecutionContext;

const ENV_KEYS = [
  'ADMIN_TOKEN',
  'KAKAO_REST_KEY',
  'ADMIN_KAKAO_ID',
  'KAKAO_CLIENT_SECRET',
] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  jest.restoreAllMocks();
});

describe('AdminGuard', () => {
  const guard = new AdminGuard();

  it('ADMIN_TOKEN 이 없으면 모든 요청을 503 으로 막는다(안전 기본값)', () => {
    expect(() => guard.canActivate(ctx('Bearer anything'))).toThrow(
      ServiceUnavailableException,
    );
  });

  it('Authorization 헤더가 없으면 401', () => {
    process.env.ADMIN_TOKEN = 'secret-token';
    expect(() => guard.canActivate(ctx())).toThrow(UnauthorizedException);
  });

  it('Bearer 접두사가 없으면 401', () => {
    process.env.ADMIN_TOKEN = 'secret-token';
    expect(() => guard.canActivate(ctx('secret-token'))).toThrow(
      UnauthorizedException,
    );
  });

  it('토큰이 다르면 401', () => {
    process.env.ADMIN_TOKEN = 'secret-token';
    expect(() => guard.canActivate(ctx('Bearer wrong'))).toThrow(
      UnauthorizedException,
    );
  });

  it('토큰이 같으면 통과', () => {
    process.env.ADMIN_TOKEN = 'secret-token';
    expect(guard.canActivate(ctx('Bearer secret-token'))).toBe(true);
  });
});

describe('AdminService.loginWithKakao', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new AdminService({} as any, { invalidateCache: jest.fn() } as any);
  const dto = { code: 'auth-code', redirectUri: 'https://example.com/admin' };

  const json = (status: number, body: unknown) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

  /** 카카오 토큰 교환 → 사용자 조회 두 번의 fetch 를 순서대로 흉내 낸다 */
  const mockKakao = (token: Response, me?: Response) => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(token);
    if (me) fetchMock.mockResolvedValueOnce(me);
    return fetchMock;
  };

  const configure = () => {
    process.env.ADMIN_TOKEN = 'admin-token';
    process.env.KAKAO_REST_KEY = 'rest-key';
    process.env.ADMIN_KAKAO_ID = '12345';
  };

  it('필수 env 가 하나라도 없으면 카카오를 호출하지 않고 401', async () => {
    process.env.KAKAO_REST_KEY = 'rest-key';
    process.env.ADMIN_KAKAO_ID = '12345';
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(service.loginWithKakao(dto)).rejects.toThrow(UnauthorizedException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('토큰 교환이 실패하면 401', async () => {
    configure();
    mockKakao(json(400, { error: 'invalid_grant' }));
    await expect(service.loginWithKakao(dto)).rejects.toThrow(UnauthorizedException);
  });

  it('본인이 아닌 카카오 계정이면 403 이고 토큰을 주지 않는다', async () => {
    configure();
    mockKakao(json(200, { access_token: 'at' }), json(200, { id: 99999 }));
    await expect(service.loginWithKakao(dto)).rejects.toThrow(ForbiddenException);
  });

  it('본인 계정이면 ADMIN_TOKEN 을 발급한다', async () => {
    configure();
    const fetchMock = mockKakao(
      json(200, { access_token: 'at' }),
      json(200, { id: 12345, kakao_account: { profile: { nickname: '준희' } } }),
    );
    await expect(service.loginWithKakao(dto)).resolves.toEqual({
      token: 'admin-token',
      nickname: '준희',
    });
    // 토큰 교환 요청에 인가코드·redirect_uri·client_id 가 실린다
    const body = String(fetchMock.mock.calls[0][1]?.body);
    expect(body).toContain('code=auth-code');
    expect(body).toContain('client_id=rest-key');
    expect(body).toContain(`redirect_uri=${encodeURIComponent(dto.redirectUri)}`);
    expect(body).not.toContain('client_secret');
  });

  it('KAKAO_CLIENT_SECRET 이 있으면 토큰 교환에 함께 보낸다', async () => {
    configure();
    process.env.KAKAO_CLIENT_SECRET = 'cs';
    const fetchMock = mockKakao(
      json(200, { access_token: 'at' }),
      json(200, { id: 12345 }),
    );
    await service.loginWithKakao(dto);
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('client_secret=cs');
  });
});
