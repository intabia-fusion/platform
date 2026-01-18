FROM node:20-alpine

WORKDIR /app

# Copy the server bundle (includes express via esbuild bundling)
COPY bundle/bundle.js ./
COPY bundle/bundle.js.map ./

# Copy distribution files
COPY deploy/ ./dist/

ENV PORT=8080
ENV DIST_DIR=/app/dist

EXPOSE 8080

CMD [ "node", "./bundle.js" ]
