# Build from the repo root:  docker build -f apps/web/Dockerfile -t prompttoppt-web \
#   --build-arg NEXT_PUBLIC_SITE_URL=... --build-arg NEXT_PUBLIC_API_URL=... --build-arg NEXT_PUBLIC_EDITOR_URL=... .
# NEXT_PUBLIC_* are inlined at build time, so they are build args, not runtime env.
FROM node:25-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY scripts/csp.mjs scripts/csp.d.mts ./scripts/
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile --filter @prompttoppt/web...
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_EDITOR_URL
ARG NEXT_PUBLIC_GOOGLE_AUTH=false
ARG NEXT_PUBLIC_MICROSOFT_AUTH=false
RUN pnpm --filter @prompttoppt/web build

FROM node:25-alpine
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
