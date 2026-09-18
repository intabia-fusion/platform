# Runtime base for the stream pod. Keeping apk out of the per-commit build
# matters most for linux/arm64, where that stage runs emulated on an amd64
# builder; here the layers are pulled ready-made for each arch.
FROM alpine:3.24

RUN apk add --no-cache ffmpeg ca-certificates jq bash \
    && addgroup -g 1000 stream \
    && adduser -u 1000 -G stream -s /bin/sh -D stream
