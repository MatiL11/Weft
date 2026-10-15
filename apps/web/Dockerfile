# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
RUN npm install -g pnpm@11.25.0
WORKDIR /repo
COPY . .
# Rewrites are resolved at build time, so the API address is a build argument.
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=${API_INTERNAL_URL} NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --frozen-lockfile --filter "@weft/web..." \
  && pnpm --filter @weft/web build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
