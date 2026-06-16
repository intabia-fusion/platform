# Ollama base image with a tiny LLM model baked in, for offline e2e tests.
# OpenAI-compatible API on :11434/v1. Default model: qwen2.5:0.5b-instruct-q8_0
# (tool calling + usage, ~1-2s on CPU). Build pulls the model so tests start
# without a runtime download.
FROM ollama/ollama:latest

# Which model to bake in (override with --build-arg OLLAMA_MODEL=...).
ARG OLLAMA_MODEL=qwen2.5:0.5b-instruct-q8_0
ENV OLLAMA_MODEL=${OLLAMA_MODEL}

# Pull the model during build: start the daemon, wait for it, pull, stop.
RUN ollama serve & \
    pid=$!; \
    for i in $(seq 1 60); do ollama list >/dev/null 2>&1 && break; sleep 1; done; \
    ollama pull "${OLLAMA_MODEL}"; \
    kill $pid; \
    wait $pid 2>/dev/null || true

ENV OLLAMA_HOST=0.0.0.0:11434
EXPOSE 11434

# Base ollama image entrypoint is `ollama`; default to `serve`.
CMD ["serve"]
