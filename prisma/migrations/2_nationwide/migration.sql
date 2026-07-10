-- 전국 확장: 요금을 Pool.fees(JSON)로 이관, 지역 계층(sido/sigungu) + dataStatus 추가, FeeTier 제거.
-- 이 마이그레이션은 스스로 기존 데이터를 백필한다(CD 는 seed 없이 migrate deploy 만 하므로).

-- 1) Pool 새 컬럼
ALTER TABLE "Pool" ADD COLUMN "sido" TEXT;
ALTER TABLE "Pool" ADD COLUMN "sigungu" TEXT;
ALTER TABLE "Pool" ADD COLUMN "fees" JSONB;
ALTER TABLE "Pool" ADD COLUMN "dataStatus" TEXT NOT NULL DEFAULT 'listing';

-- 2) 리스팅 전용 시설을 위해 nullable 로 완화
ALTER TABLE "Pool" ALTER COLUMN "region" DROP NOT NULL;
ALTER TABLE "Pool" ALTER COLUMN "freeSwim" DROP NOT NULL;
ALTER TABLE "Pool" ALTER COLUMN "lessons" DROP NOT NULL;

-- 3) 기존 전역 요금표(FeeTier)를 {full:{대상:금액}, half:{...}} 로 조립해 모든 기존 pool 에 백필.
--    (현재는 poolId 가 없어 전 시설 공통이었으므로 모두 동일하게 채운다)
UPDATE "Pool" SET "fees" = (
  SELECT jsonb_build_object(
    'full', COALESCE(jsonb_object_agg("target", "price") FILTER (WHERE "tier" = 'full'), '{}'::jsonb),
    'half', COALESCE(jsonb_object_agg("target", "price") FILTER (WHERE "tier" = 'half'), '{}'::jsonb)
  )
  FROM "FeeTier"
)
WHERE EXISTS (SELECT 1 FROM "FeeTier");

-- 4) 자유수영 데이터가 있는 기존 시설은 full 로 표시
UPDATE "Pool" SET "dataStatus" = 'full' WHERE "freeSwim" IS NOT NULL;

-- 5) 시도/시군구를 주소 앞 두 토큰에서 백필 (예: "경기도 하남시 ..." → 경기도 / 하남시)
UPDATE "Pool"
SET "sido" = split_part("address", ' ', 1),
    "sigungu" = split_part("address", ' ', 2)
WHERE "sido" IS NULL AND "address" <> '';

-- 6) FeeTier 제거 (요금은 이제 Pool.fees 로 관리)
DROP TABLE "FeeTier";
