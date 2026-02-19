FROM intabiafusion/front-base:v20251218
WORKDIR /app

# Build ID for tracking deployments
ARG BUILD_ID=unknown
ENV BUILD_ID=${BUILD_ID}

COPY bundle/bundle.js ./
COPY bundle/bundle.js.map ./
COPY dist/ ./dist/

EXPOSE 8080
CMD [ "node", "./bundle.js" ]
