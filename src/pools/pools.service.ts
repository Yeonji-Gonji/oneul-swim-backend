import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assemblePoolsPayload } from './pools.assembler';
import { readPoolsFile } from './pools-file';
import { PoolsPayload } from './pools.types';

/** GET /pools 캐시 TTL (5분). 요금/시간표는 자주 안 바뀌므로 충분 */
const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class PoolsService {
  private readonly logger = new Logger(PoolsService.name);
  private cache: { payload: PoolsPayload; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** 프론트 계약 shape 로 수영장 데이터 반환. DB 0건이면 파일 폴백 */
  async getPools(): Promise<PoolsPayload> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.payload;
    }
    const payload = await this.load();
    this.cache = { payload, at: Date.now() };
    return payload;
  }

  private async load(): Promise<PoolsPayload> {
    try {
      const poolRows = await this.prisma.pool.findMany({
        orderBy: { id: 'asc' },
      });
      if (poolRows.length > 0) {
        return assemblePoolsPayload(
          poolRows as unknown as Record<string, unknown>[],
          'db',
        );
      }
      this.logger.warn('Pool 테이블 비어 있음 — 파일 폴백 사용');
    } catch (error) {
      // DB 장애 시에도 서비스가 죽지 않도록 파일 폴백
      this.logger.error(`DB 조회 실패 — 파일 폴백: ${String(error)}`);
    }
    return this.fileFallback();
  }

  private fileFallback(): PoolsPayload {
    const file = readPoolsFile();
    return {
      _meta: { ...(file._meta ?? {}), source: 'file' },
      freeSwimPriceTiers: file.freeSwimPriceTiers,
      pools: file.pools,
    };
  }

  /** 데이터 갱신 후 캐시 무효화 (어드민에서 호출) */
  invalidateCache() {
    this.cache = null;
  }
}
