# Build from the repo root:  docker build -f services/api/Dockerfile -t prompttoppt-api .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY services/api ./services/api
RUN pnpm install --frozen-lockfile --filter @prompttoppt/api...
RUN pnpm --filter @prompttoppt/api build
# Self-contained production deps (third-party only; workspace code is already bundled into dist)
RUN pnpm --filter @prompttoppt/api deploy --prod /out && cp -r services/api/dist /out/dist && mkdir -p /out/drizzle && cp -r services/api/drizzle/. /out/drizzle/

FROM node:22-alpine
ENV NODE_ENV=production
# ffmpeg: pulls the sound and still frames out of uploaded videos (video to slides)
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY --from=build /out .
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "dist/index.js"]
