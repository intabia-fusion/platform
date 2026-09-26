# The adapter's mapping uses icu_transform and icu_folding, so the plugin has to be in the image.
# Building it once is cheaper than installing the plugin on every container start.
FROM elasticsearch:8.19.1
RUN ./bin/elasticsearch-plugin install --batch analysis-icu
