#!/usr/bin/env sh
# Builds whisper.cpp and downloads the tiny model into a directory, for running the
# worker's transcription tests locally or in CI:
#   scripts/setup-whisper.sh ~/.cache/weft-whisper
#   WHISPER_CLI_PATH=~/.cache/weft-whisper/whisper-cli \
#   WHISPER_MODEL_PATH=~/.cache/weft-whisper/ggml-tiny.bin \
#   WHISPER_SAMPLE_WAV=~/.cache/weft-whisper/jfk.wav pnpm --filter @weft/worker test
set -eu

DIR="${1:?usage: setup-whisper.sh <directory>}"
VERSION=1.9.4
SOURCE_SHA256=57e280cee375ab02425b806ad5146b99f6eb9357e3c2b31357c8a6af2e2e44ae
TINY_SHA256=be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21
mkdir -p "$DIR"

if [ ! -x "$DIR/whisper-cli" ]; then
  SRC="$DIR/src"
  rm -rf "$SRC" && mkdir -p "$SRC"
  curl -fsSL -o "$SRC.tar.gz" "https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v$VERSION.tar.gz"
  echo "$SOURCE_SHA256  $SRC.tar.gz" | sha256sum -c - >/dev/null
  tar xzf "$SRC.tar.gz" --strip-components=1 -C "$SRC"
  rm "$SRC.tar.gz"
  cmake -S "$SRC" -B "$SRC/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
    -DWHISPER_BUILD_TESTS=OFF -DGGML_OPENMP=OFF >/dev/null
  cmake --build "$SRC/build" -j "$(nproc)" --target whisper-cli >/dev/null
  install -m 755 "$SRC/build/bin/whisper-cli" "$DIR/whisper-cli"
  cp "$SRC/samples/jfk.wav" "$DIR/jfk.wav"
  rm -rf "$SRC"
fi

if [ ! -f "$DIR/ggml-tiny.bin" ]; then
  curl -fsSL -o "$DIR/ggml-tiny.bin.partial" \
    https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin
  echo "$TINY_SHA256  $DIR/ggml-tiny.bin.partial" | sha256sum -c - >/dev/null
  mv "$DIR/ggml-tiny.bin.partial" "$DIR/ggml-tiny.bin"
fi
echo "whisper.cpp $VERSION ready. To run the real transcription test:"
echo "  WHISPER_CLI_PATH=$DIR/whisper-cli WHISPER_MODEL_PATH=$DIR/ggml-tiny.bin WHISPER_SAMPLE_WAV=$DIR/jfk.wav"
