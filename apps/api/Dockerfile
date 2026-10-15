# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
RUN npm install -g pnpm@11.25.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@weft/api..." \
  && pnpm --filter @weft/api build \
  && pnpm --filter @weft/api deploy --prod --legacy /out \
  && cp -r apps/api/dist /out/dist \
  && cp -r packages/infra/db-drizzle/drizzle /out/drizzle

FROM node:24-alpine AS runtime
ENV NODE_ENV=production PORT=4000 MIGRATIONS_DIR=/app/drizzle
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
