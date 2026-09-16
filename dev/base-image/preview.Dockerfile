# trixie, not the bookworm that plain node:24 still points at: bookworm is oldstable and frozen at
# ffmpeg 5.1, libreoffice 7.4 and poppler 22.12, all of which this image exists to run.
FROM node:24-trixie

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    dumb-init \
    libjemalloc2 \
    ffmpeg \
    poppler-utils \
    libreoffice \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/share/doc/* \
    && rm -rf /usr/share/man/*

ENV LD_PRELOAD=libjemalloc.so.2
ENV MALLOC_CONF=dirty_decay_ms:1000,narenas:2,background_thread:true

WORKDIR /app
ENV NODE_ENV=production
RUN npm install --ignore-scripts=false --verbose bufferutil sharp@v0.34.3 utf-8-validate snappy --unsafe-perm
