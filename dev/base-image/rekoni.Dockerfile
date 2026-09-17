# trixie, not the bookworm that plain node:24 still points at: rekoni extracts PDF text for
# fulltext search with pdftotext, and bookworm is frozen at poppler 22.12.
FROM node:24-trixie

RUN apt-get update
RUN apt-get install libjemalloc2 dumb-init
RUN apt-get clean

ENV LD_PRELOAD=libjemalloc.so.2
ENV MALLOC_CONF=dirty_decay_ms:1000,narenas:2,background_thread:true

WORKDIR /usr/src/app
ENV NODE_ENV=production
RUN npm install --ignore-scripts=false --verbose bufferutil utf-8-validate snappy msgpackr msgpackr-extract --unsafe-perm

RUN apt-get update && \
  apt-get install -y --no-install-recommends \
  coreutils \
  antiword \
  poppler-utils \
  html2text \
  unrtf
RUN npm install --ignore-scripts=false --verbose sharp@v0.34.3 pdfjs-dist@v2.12.313 --unsafe-perm