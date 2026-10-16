# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
RUN npm install -g pnpm@11.25.0
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@weft/worker..." \
  && pnpm --filter @weft/worker build \
  && pnpm --filter @weft/worker deploy --prod --legacy /out \
  && cp -r apps/worker/dist /out/dist

# whisper.cpp (MIT) built from source as a single static program.
FROM node:24-alpine AS whisper
ARG WHISPER_VERSION=1.9.4
ARG WHISPER_SHA256=57e280cee375ab02425b806ad5146b99f6eb9357e3c2b31357c8a6af2e2e44ae
# x86-64 builds use AVX2 for speed; build with --build-arg WHISPER_AVX2=OFF for older CPUs.
ARG WHISPER_AVX2=ON
ARG TARGETARCH
RUN apk add --no-cache build-base cmake curl
WORKDIR /src
RUN curl -fsSL -o /tmp/whisper.tar.gz "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v${WHISPER_VERSION}.tar.gz" \
  && echo "${WHISPER_SHA256}  /tmp/whisper.tar.gz" | sha256sum -c - \
  && tar xzf /tmp/whisper.tar.gz --strip-components=1 \
  && ARCH="${TARGETARCH:-$(uname -m)}" \
  && if [ "$WHISPER_AVX2" = "ON" ] && { [ "$ARCH" = "amd64" ] || [ "$ARCH" = "x86_64" ]; }; then CPU_FLAGS="-DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON"; fi \
  && cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF \
     -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF $CPU_FLAGS \
  && cmake --build build -j "$(nproc)" --target whisper-cli \
  && install -m 755 build/bin/whisper-cli /usr/local/bin/whisper-cli

FROM node:24-alpine AS runtime
# ffmpeg and whisper.cpp are separate programs the worker runs; neither is linked into Weft.
RUN apk add --no-cache ffmpeg \
  && mkdir /scratch /models && chown node:node /scratch /models
COPY --from=whisper /usr/local/bin/whisper-cli /usr/local/bin/whisper-cli
ENV NODE_ENV=production WORK_DIR=/scratch WHISPER_MODELS_DIR=/models
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
CMD ["node", "dist/main.js"]
