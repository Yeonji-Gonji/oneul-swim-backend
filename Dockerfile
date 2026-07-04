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
RUN pnpm build && pnpm prune --prod

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# 마이그레이션 실행(migrate deploy)에 prisma CLI가 필요해 schema와 함께 복사
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY data ./data
COPY package.json ./
EXPOSE 3000
CMD ["node", "dist/main.js"]
