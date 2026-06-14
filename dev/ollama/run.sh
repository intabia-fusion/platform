#!/usr/bin/env bash
#
# Copyright © 2026 Intabia Fusion.
#
# Start a local Ollama LLM server in Docker and pull a small Qwen2.5 model
# for ai-bot e2e tests. CPU by default; pass --gpu to reserve NVIDIA GPUs.
#
# Usage:
#   ./run.sh                 # CPU, pulls q8 model
#   ./run.sh --gpu           # reserve NVIDIA GPUs (requires nvidia-container-toolkit)
#   ./run.sh --fp16          # pull bf16/fp16 model instead of q8
#   MODEL=qwen2.5:1.5b-instruct-q8_0 ./run.sh   # override model
#
# The OpenAI-compatible endpoint is http://127.0.0.1:11434/v1 (no API key).
# Point ai-bot e2e tests at it:
#   AI_BOT_E2E=1 AI_BOT_E2E_URL=http://127.0.0.1:11434/v1 AI_BOT_E2E_KEY=ollama \
#     AI_BOT_E2E_MODEL="$MODEL" rushx test e2e-usage
#
set -euo pipefail

cd "$(dirname "$0")"

GPU=0
MODEL_DEFAULT="qwen2.5:0.5b-instruct-q8_0"
MODEL_FP16="qwen2.5:0.5b-instruct-fp16"

for arg in "$@"; do
  case "$arg" in
    --gpu) GPU=1 ;;
    --fp16) MODEL_DEFAULT="$MODEL_FP16" ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

MODEL="${MODEL:-$MODEL_DEFAULT}"

COMPOSE_FILES=(-f docker-compose.yaml)
if [[ "$GPU" == "1" ]]; then
  COMPOSE_FILES+=(-f docker-compose.gpu.yaml)
  echo "GPU mode: reserving NVIDIA devices"
fi

echo "Starting ollama container..."
docker compose "${COMPOSE_FILES[@]}" up -d

echo "Waiting for ollama to become healthy..."
for i in $(seq 1 40); do
  if docker compose "${COMPOSE_FILES[@]}" exec -T ollama ollama list >/dev/null 2>&1; then
    break
  fi
  sleep 2
  if [[ "$i" == "40" ]]; then
    echo "ollama did not become ready in time" >&2
    exit 1
  fi
done

echo "Pulling model: $MODEL"
docker compose "${COMPOSE_FILES[@]}" exec -T ollama ollama pull "$MODEL"

echo
echo "Ready. Model '$MODEL' available at http://127.0.0.1:11434/v1"
echo "Quick check:"
curl -s http://127.0.0.1:11434/v1/models | head -c 400 || true
echo
echo
echo "Run ai-bot e2e against it:"
echo "  AI_BOT_E2E=1 AI_BOT_E2E_URL=http://127.0.0.1:11434/v1 AI_BOT_E2E_KEY=ollama AI_BOT_E2E_MODEL=\"$MODEL\" rushx test"
