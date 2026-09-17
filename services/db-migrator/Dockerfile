FROM intabiafusion/base-slim:v20260917
WORKDIR /usr/src/app

COPY bundle/bundle.js ./
COPY bundle/bundle.js.map ./
COPY migrations ./migrations

CMD [ "node", "bundle.js" ]
