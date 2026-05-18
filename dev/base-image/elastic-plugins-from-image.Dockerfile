FROM intabiafusion/elastic-plugins:8.19.2 AS source

FROM alpine:3.21

COPY --from=source /usr/share/elasticsearch/plugins /usr/share/elasticsearch/plugins
