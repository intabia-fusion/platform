FROM intabiafusion/base:v20251218
WORKDIR /usr/src/app

RUN npm install -g pnpm

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

COPY package.json package.json
COPY pnpm-lock.yaml pnpm-lock.yaml

RUN pnpm install --ignore-scripts=false
COPY ./bundle .

EXPOSE 4012
CMD [ "node", "index.js" , "start"]
