# Notification Service

A microservice for sending push notifications via the web push protocol.

## Overview

The notification service is a background worker that consumes user notification messages from Kafka (`user-notifications` topic) and delivers them to subscribed clients via the Web Push Protocol. It uses VAPID (Voluntary Application Server Identification) keys for secure authentication and automatically handles cleanup of expired or unregistered subscriptions.

## Features

- **Kafka Consumer**: Consumes messages from `user-notifications` topic.
- **Web Push Delivery**: Delivers push notifications directly to browsers.
- **VAPID Authentication**: Secures notification delivery with VAPID key signing.
- **Automatic Subscription Cleanup**: Cleans up expired, unregistered, or invalid push subscriptions directly in the database using the transactor API if `ACCOUNTS_URL` and `SERVER_SECRET` are configured.
- **Robust Error Handling**: Prevents loops/crashes when processing invalid JSON bodies or encountering network timeouts.
- **Graceful Shutdown**: Properly closes Kafka consumers on shutdown to prevent partition rebalance lags.

## Configuration

The service is configured via environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SOURCE` | Yes | - | Source email or URI identifier for VAPID push payload |
| `SERVICE_ID` | No | `web-push-service` | The identifier of this service used for tracing, queue client IDs, and tokens |
| `PUSH_PUBLIC_KEY` | No | - | VAPID public key for signing push notifications |
| `PUSH_PRIVATE_KEY` | No | - | VAPID private key for signing push notifications |
| `PUSH_SUBJECT` | No | `mailto:hey@huly.io` | VAPID subject (email or URL) |
| `TTL` | No | `86400` | Time-to-live for push notifications in seconds (default is 24 hours) |
| `QUEUE_CONFIG` | Yes | - | Kafka broker addresses and configuration |
| `QUEUE_REGION` | No | - | The Kafka partition region to connect to |
| `ACCOUNTS_URL` | No | - | URL of the internal accounts service, required for failed subscription cleanups |
| `SERVER_SECRET` / `SECRET` | No | - | Shared secret used to sign service tokens for database cleanups |

### VAPID Keys Generation

If you need to generate new VAPID keys, you can run:

```bash
npx web-push generate-vapid-keys
```

## Running the Service

### Development Local Run
```bash
cross-env SOURCE=no-reply@huly.io QUEUE_CONFIG=localhost:9092 rushx run-local
```

### Docker Run
```bash
docker run -d \
  -e SOURCE=no-reply@huly.io \
  -e PUSH_PUBLIC_KEY=your_public_key \
  -e PUSH_PRIVATE_KEY=your_private_key \
  -e QUEUE_CONFIG=redpanda:9092 \
  -e ACCOUNTS_URL=http://account:3000 \
  -e SERVER_SECRET=secret \
  intabiafusion/notification
```

## Internal Architecture

The consumer listens to `QueueTopic.UserNotifications` for `QueueNotificationMessage` payloads.

When a message is received:
1. It extracts target browser push subscriptions.
2. It sends push payloads via `web-push` library.
3. If an endpoint responds with an expiration error (e.g. `expired`, `Unregistered`, `No such subscription` error body), the service returns the failed subscription ID.
4. The service generates a temporary system token, contacts the transactor via `RestClient`, and removes the failed subscription documents from the database (`TxRemoveDoc`).

## Testing

Jest is used for unit and integration testing.

Run tests:
```bash
npm run test
```

## Troubleshooting

### Failed subscriptions are not being deleted
- Verify that both `ACCOUNTS_URL` and `SERVER_SECRET` (or `SECRET`) are set correctly in the service environment.
- Check service logs for "Failed to initialize RestClient or fetch transactor endpoint" or "Failed to remove expired subscription" error messages.

### TypeError on bad error bodies
- The service uses safe error parsing to prevent type crashes if `web-push` throws an error with a `null` or `undefined` body. Check that you are using version `0.7.0` or higher which contains this fix.
