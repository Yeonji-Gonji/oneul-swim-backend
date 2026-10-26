# 멀티스테이지: 빌드 도구는 최종 이미지에 남기지 않는다 (ARM/x86 공용)
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY prisma ./prisma
RUN pnpm prisma:generate
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
# prune 하지 않는다: 런타임에 prisma CLI(migrate deploy)와 tsx(seed·데이터 스크립트)가 필요하다.
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# 컨테이너 안 npx 실행 때마다 뜨는 npm 업데이트 알림을 끈다(로그 잡음)
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
# dumb-init: PID 1 로 시그널을 앱에 전달하고 좀비 프로세스를 거둔다(docker stop 시 graceful shutdown).
RUN apk add --no-cache dumb-init
# 컨테이너 안 명령은 pnpm 이 아니라 npx 로 실행한다(런타임 pnpm 은 deps 재검사로 실패한다).
#   마이그레이션: npx prisma migrate deploy / 시드: npx tsx prisma/seed.ts / 데이터 스크립트: npx tsx scripts/<이름>.ts
# 마이그레이션·시드·데이터 스크립트에 devDependencies 도 필요해 node_modules 전체를 복사한다.
# 파일 소유자를 node 로 두어 비루트로 실행해도 data/ 쓰기(스크립트 dry-run 계획 파일)가 된다.
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/prisma ./prisma
COPY --chown=node:node data ./data
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
