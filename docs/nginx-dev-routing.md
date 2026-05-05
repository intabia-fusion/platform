# Dev Nginx Path-Based Routing

## Architecture

All external traffic goes through nginx on port 8087. Services no longer expose ports to the host except:
- nginx: 8087, 8080 (webpack dev server)
- transactor: 9229 (kept for direct WS connections and debug)
- postgres: 5432, redis: 6379
- mailpit: 8025

## Nginx Config Location

`dev/nginx.conf` mounted into nginx container as `/etc/nginx/conf.d/default.conf`.

## Route Map

| Path prefix | Backend |
|---|---|
| `/` | front:8080 (WebSocket, buffering off, 300s timeouts) |
| `~ ^/eyJ` | transactor:3332 (base64-token WebSocket) |
| `/_account` | account:3000 |
| `/_tr` | transactor:3332 (WebSocket) |
| `/_cl` | collaborator0:3078 (WebSocket) |
| `/_rekoni` | rekoni:4004 |
| `/_stats` | stats:4900 |
| `/_datalake` | datalake:4030 |
| `/_stream` | stream:1080 (no `/` required in capture) |
| `/_preview` | preview:4040 (no `/` required in capture) |
| `/_billing` | billing:4041 |
| `/_ai` | aibot:4010 (WebSocket) |
| `/_love` | love:8096 (WebSocket) |
| `/_fulltext` | fulltext:4702 |
| `/_print` | print:4005 |
| `/_sign` | sign:4006 |
| `/_export` | export:4009 |
| `/_link-preview` | link-preview:4042 |
| `/_mail` | mail_server:8097 (WebSocket) |
| `/health` | return 200 |

## Key Decisions

- `_stream` and `_preview` use `rewrite ^/_stream(.*)$ $1 break` (without `/` requirement) to handle paths like `/_stream/recording` correctly.
- `client_max_body_size 0` at top level (outside server block) to allow unlimited uploads.
- front service loses its host ports; nginx takes over 8087.

## Env Var Changes (front service)

- `ACCOUNTS_URL` -> `http://localhost:8087/_account`
- `ACCOUNTS_URL_INTERNAL=http://account:3000` (added, for server-side calls)
- `STATS_URL` -> `http://stats:4900` (internal service name, not through nginx)
- `STATS_API=http://localhost:8087/_stats` (added)
- All other service URLs updated to go through `http://localhost:8087/_<service>`.

## Env Var Changes (account service)

- `ACCOUNTS_URL` -> `http://localhost:8087/_account`
- `STATS_URL` -> `http://stats:4900` (internal)

## Env Var Changes (transactor service)

- `FILES_URL` -> `http://localhost:8087/_datalake/blob/:workspace/:blobId/:filename`
