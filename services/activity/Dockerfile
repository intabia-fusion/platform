FROM intabiafusion/base-slim:v20251218
WORKDIR /usr/src/app

COPY bundle/bundle.js ./
COPY bundle/bundle.js.map ./
COPY bundle/model.json ./

CMD [ "node", "bundle.js" ]
