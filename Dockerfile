# syntax=docker/dockerfile:1
# 오늘수영 백엔드 운영 이미지(linux/arm64, Oracle Cloud A1). 배포·운영 절차는 docs/OPERATIONS.md
#
# 단계: base(런타임 공통) → pnpm(매니페스트) → build(전체 의존성으로 컴파일) → prod-deps(운영 의존성과 Prisma 클라이언트) → runtime
# 런타임 이미지에는 운영 의존성(dependencies)만 넣는다. 테스트·린트·컴파일 도구(devDependencies)는 넣지 않는다.
# 런타임에 쓰는 prisma CLI(migrate deploy)와 tsx(seed·데이터 스크립트)는 그래서 dependencies 에 있다.
# 컨테이너 안 명령은 pnpm 이 아니라 npx 로 실행한다(런타임 이미지에 pnpm 이 없다).
#   마이그레이션    npx prisma migrate deploy   (scripts/deploy.sh 가 씀)
#   시드            npx tsx prisma/seed.ts
#   데이터 스크립트 npx tsx scripts/<이름>.ts
#   기동            node dist/main.js           (dumb-init 이 PID 1 로 시그널을 넘기고 좀비 프로세스를 거둔다)

# 베이스 이미지는 버전+다이제스트로 고정한다(같은 태그도 다시 빌드되면 내용이 바뀐다). 올리는 건 Dependabot PR(.github/dependabot.yml).
# 외부 이미지를 가리키는 FROM 은 이 한 줄뿐이고 나머지 단계는 여기서 갈라진다
FROM node:22.23.5-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS base
# Prisma 는 OpenSSL 버전을 보고 엔진을 고른다. openssl 이 있어야 linux-musl-arm64-openssl-3.0.x 로 확실히 고른다
RUN apk add --no-cache openssl

FROM base AS pnpm
# pnpm 버전은 corepack 이 package.json 의 packageManager 를 보고 받는다
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
# 잠금 파일과 매니페스트만 먼저 복사해 의존성 레이어를 소스 변경과 나눈다
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

FROM pnpm AS build
RUN --mount=type=cache,id=oneul-swim-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY prisma ./prisma
RUN pnpm prisma:generate
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

FROM pnpm AS prod-deps
RUN --mount=type=cache,id=oneul-swim-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --store-dir /pnpm/store
COPY prisma ./prisma
# 운영 의존성 트리에 Prisma 클라이언트를 만든다. 이때 이 플랫폼용 쿼리·스키마 엔진도 받아 둬서 런타임에 내려받지 않는다
RUN ./node_modules/.bin/prisma generate

FROM base AS runtime
RUN apk add --no-cache dumb-init
# NPM_CONFIG_UPDATE_NOTIFIER: 컨테이너 안 npx 실행 때마다 뜨는 npm 업데이트 알림을 끈다(로그 잡음)
# CHECKPOINT_DISABLE: Prisma CLI 의 버전 확인 호출을 끈다
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    CHECKPOINT_DISABLE=1
WORKDIR /app
# 코드와 의존성은 root 소유로 두고 node 사용자로 실행한다(앱 프로세스가 자기 코드와 의존성을 고칠 수 없게).
# data/ 만 node 소유다. 데이터 스크립트가 dry-run 계획 파일(data/open-facility-plan.json)을 여기에 쓴다.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --chown=node:node data ./data
COPY scripts ./scripts
COPY package.json ./
USER node
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
