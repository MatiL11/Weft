# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
RUN npm install -g pnpm@11.25.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@weft/worker..." \
  && pnpm --filter @weft/worker build \
  && pnpm --filter @weft/worker deploy --prod --legacy /out \
  && cp -r apps/worker/dist /out/dist

FROM node:24-alpine AS runtime
# ffmpeg is a separate program the worker runs; it is not linked into Weft.
RUN apk add --no-cache ffmpeg
ENV NODE_ENV=production WORK_DIR=/tmp
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
CMD ["node", "dist/main.js"]
