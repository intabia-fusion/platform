FROM docker.elastic.co/elasticsearch/elasticsearch:8.19.1 AS builder

# Install the analysis-icu plugin into the image
RUN bin/elasticsearch-plugin install --batch analysis-icu

FROM alpine:3.21

COPY --from=builder /usr/share/elasticsearch/plugins /usr/share/elasticsearch/plugins
