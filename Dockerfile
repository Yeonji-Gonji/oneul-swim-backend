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
# prune 하지 않는다: 런타임에 prisma CLI(migrate deploy)와 tsx(seed)가 필요하다.
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# 런타임에도 pnpm 필요: CD 의 `pnpm prisma migrate deploy`, 수동 `pnpm seed` 가
# 컨테이너 안에서 실행되므로 최종 이미지에서도 corepack 을 켜 pnpm 을 PATH 에 둔다.
RUN corepack enable
# 마이그레이션(migrate deploy)·시드(tsx seed)에 devDependencies 도 필요해 전체 복사
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY data ./data
COPY package.json ./
EXPOSE 3000
CMD ["node", "dist/main.js"]
