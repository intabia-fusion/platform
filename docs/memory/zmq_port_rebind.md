# ZeroMQ: rebinding a just-closed port on Linux

Область: [Тесты](../testing.md)

On Linux a zeromq socket releases its TCP port asynchronously after `close()`, even with `linger: 0`. Binding the same port right away fails with `EADDRINUSE` in about a third of attempts (measured on `node:24` with zeromq 6.7.0: 118 of 300). macOS does not reproduce it, so the failure shows up only in CI.

Measured on 500 close-then-bind cycles:

- `linger: 0` alone: 98 failures
- `await socket.unbind(lastEndpoint)` before `close()`: 1 failure
- retrying `bind` on `EADDRINUSE` (20 ms step): 0 failures

`BackRPCServer.start` (`foundations/net/packages/backrpc/src/server.ts`) retries `bind` on `EADDRINUSE` for up to about 1 s. Tests that do not need a fixed port bind `tcp://127.0.0.1:0` and read `lastEndpoint` (see `zmq.spec.ts`).
