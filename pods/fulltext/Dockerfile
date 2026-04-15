FROM intabiafusion/base-slim:v20251218
WORKDIR /usr/src/app

COPY bundle/bundle.js ./
COPY bundle/bundle.js.map ./
COPY bundle/model.json ./

# Install native ONNX runtime deps (excluded from esbuild bundle due to native .node binaries).
# onnxruntime-node provides native performance; onnxruntime-web is the WASM fallback.
COPY runtime-deps.json package.json
RUN npm install --omit=dev --no-package-lock && rm package.json

EXPOSE 4700
CMD [ "node", "--expose-gc", "bundle.js" ]
