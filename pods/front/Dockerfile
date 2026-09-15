FROM intabiafusion/front-base:v20260309
WORKDIR /app

# Reported in /config.json so a running stand can be traced back to its build
ARG BUILD_ID
ENV BUILD_ID=${BUILD_ID}

COPY bundle/bundle.js ./
COPY bundle/bundle.js.map ./
COPY dist/ ./dist/

EXPOSE 8080
CMD [ "node", "./bundle.js" ]
