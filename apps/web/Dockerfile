# Build from the repo root:  docker build --platform linux/arm64 -f apps/web/Dockerfile -t slidesdone-web \
#   --build-arg NEXT_PUBLIC_SITE_URL=... --build-arg NEXT_PUBLIC_API_URL=... --build-arg NEXT_PUBLIC_EDITOR_URL=... .
# NEXT_PUBLIC_* are inlined at build time, so they are build args, not runtime env.
#
# RELEASE BUILD: add  --build-arg APP_ENV=production --build-arg RELEASE_CHECK=1  (infra/prod/deploy.sh does). The build then FAILS, first thing, while the owner fields in
# apps/web/lib/legal.ts are still TODO (docs/LEGAL_PAGES.md); without them (CI, local) it only lists what is open.
#
# NODE_IMAGE is pinned to an exact version (same as services/api/Dockerfile): raise it deliberately, docs/DEPLOYMENT.md "Node version".
ARG NODE_IMAGE=node:22.23.5-alpine3.24

FROM ${NODE_IMAGE} AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY scripts/csp.mjs scripts/csp.d.mts scripts/check-legal.mjs ./scripts/
COPY apps/web ./apps/web
# The legal release guard first: seconds, not the minutes of install + build. (These ARGs are visible to every RUN below, so `next build` sees them too.)
ARG APP_ENV
ARG NEXT_PUBLIC_APP_ENV
ARG RELEASE_CHECK
RUN node scripts/check-legal.mjs
RUN pnpm install --frozen-lockfile --filter @prompttoppt/web...
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_EDITOR_URL
ARG NEXT_PUBLIC_GOOGLE_AUTH=false
ARG NEXT_PUBLIC_MICROSOFT_AUTH=false
RUN pnpm --filter @prompttoppt/web build

FROM ${NODE_IMAGE}
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
# --chown: Next writes at run time under apps/web/.next (the prerender/ISR cache that blog and news refreshes update, the image cache); owned by root it fails with EACCES
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
