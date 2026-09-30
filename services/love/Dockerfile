FROM intabiafusion/base-slim:v20260917
WORKDIR /usr/src/app

COPY bundle/bundle.js ./
COPY bundle/template ./template

EXPOSE 8096
CMD [ "node", "bundle.js" ]
