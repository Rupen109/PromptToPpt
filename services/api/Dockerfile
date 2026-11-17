# Build from the repo root:  docker build --platform linux/arm64 -f services/api/Dockerfile -t slidesdone-api .
# One image runs the API (default command), the deck worker (`node dist/worker.js`) and the one-off migration task (`node dist/migrate.js`).
#
# NODE_IMAGE is pinned to an exact version on purpose: the API needs Node >= 22.19 (undici 8 uses zlib.createZstdDecompress), a floating `node:22-*` tag
# would silently change the runtime between two deploys. Raise it deliberately (docs/DEPLOYMENT.md, "Node version"); the build stops if it is too old.
# Alpine (musl) is fine for the native part: sharp (libvips) ships a musl build, and the final stage proves it loads. (@napi-rs/canvas is only an optional peer of unpdf and unused:
# the PDF readers parse pages with pdf.js and never draw them.)
ARG NODE_IMAGE=node:22.23.5-alpine3.24

FROM ${NODE_IMAGE} AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY services/api ./services/api
RUN pnpm install --frozen-lockfile --filter @prompttoppt/api...
RUN pnpm --filter @prompttoppt/api build
# Workspace packages (@prompttoppt/*) are bundled INTO dist (tsup noExternal), so at run time they are not needed. Left in the dependency list they pull the whole
# website toolchain (next, react, lucide, vitest ...) into the image (about 700 MB), so they are dropped from the manifest of the deploy copy only.
RUN node -e "const f='services/api/package.json',p=JSON.parse(require('fs').readFileSync(f));for(const k of Object.keys(p.dependencies))if(k.startsWith('@prompttoppt/'))delete p.dependencies[k];require('fs').writeFileSync(f,JSON.stringify(p,null,2))"
RUN pnpm --filter @prompttoppt/api deploy --prod /deploy
# Only what runs: third-party node_modules, the bundle (no source maps: nothing loads them), the SQL migrations, package.json ("type": "module").
# musl is the only libc here: the glibc builds of the native packages are dead weight.
RUN mkdir -p /out/dist /out/drizzle \
 && cp -r /deploy/node_modules /out/node_modules \
 && cp /deploy/package.json /out/ \
 && cp -r services/api/dist/. /out/dist/ && find /out/dist -name '*.map' -delete \
 && cp -r services/api/drizzle/. /out/drizzle/ \
 && rm -rf /out/node_modules/.pnpm/@img+sharp-linux-arm64@* /out/node_modules/.pnpm/@img+sharp-libvips-linux-arm64@* /out/node_modules/.pnpm/@napi-rs+canvas-linux-arm64-gnu@* \
 && find /out/node_modules/.pnpm -maxdepth 1 \( -name 'next@*' -o -name '@next+*' -o -name 'react@*' -o -name 'react-dom@*' -o -name 'scheduler@*' -o -name 'styled-jsx@*' -o -name 'client-only@*' \
      -o -name 'vite@*' -o -name 'rolldown@*' -o -name '@rolldown+*' -o -name 'lightningcss*' -o -name 'vue@*' -o -name '@vue+*' -o -name 'solid-js@*' -o -name '@vitest+*' \
      -o -name 'tsx@*' -o -name 'esbuild@*' -o -name '@esbuild+*' -o -name '@esbuild-kit+*' -o -name 'postcss@*' -o -name 'caniuse-lite@*' -o -name 'baseline-browser-mapping@*' \) -exec rm -rf {} +
# (why the find: better-auth lists next, react, vite, vue, solid-js, vitest ... as OPTIONAL peers and pnpm installs them anyway (auto-install-peers). The API imports none of
# them, about 450 MB; the check at the end of this file proves everything dist imports still resolves. Structural fix to consider: auto-install-peers=false + a new lockfile.)

FROM ${NODE_IMAGE}
ENV NODE_ENV=production
# ffmpeg: pulls the sound and still frames out of uploaded videos (video to slides)
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY --from=build /out .
# Build-time proof (the build fails instead of the first deploy): Node is new enough, sharp loads on this libc, every package dist imports resolves.
COPY services/api/scripts/docker-check.mjs ./docker-check.mjs
RUN node docker-check.mjs && rm docker-check.mjs \
 && test -f dist/index.js -a -f dist/worker.js -a -f dist/parse-worker.js -a -f dist/migrate.js -a -f drizzle/meta/_journal.json
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s CMD wget -qO- http://127.0.0.1:4000/health || exit 1
CMD ["node", "dist/index.js"]
