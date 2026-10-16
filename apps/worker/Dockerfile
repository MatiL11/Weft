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
ARG TARGETARCH
RUN apk add --no-cache build-base cmake curl
WORKDIR /src
RUN curl -fsSL "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v${WHISPER_VERSION}.tar.gz" | tar xz --strip-components=1 \
  && ARCH="${TARGETARCH:-$(uname -m)}" \
  && if [ "$ARCH" = "amd64" ] || [ "$ARCH" = "x86_64" ]; then CPU_FLAGS="-DGGML_AVX=ON -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON"; fi \
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
