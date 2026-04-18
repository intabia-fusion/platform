# Huly Core

[![GitHub License](https://img.shields.io/github/license/hcengineering/huly.core?style=for-the-badge)](LICENSE)

⭐️ Your star shines on us. Star us on GitHub!

## About

Huly Core is a collection of core packages extracted from the [Huly Platform](https://github.com/intabia-fusion/foundation). This repository contains fundamental building blocks and libraries that power the Huly ecosystem, including core data models, client libraries, text processing engines, and platform utilities.

These packages are designed to be reusable, modular, and framework-agnostic, making them suitable for building custom applications on top of the Huly Platform or integrating Huly functionality into existing projects.

## Packages

This repository includes the following core packages:

### Core Packages

- **[@intabiafusion/core](packages/core)** - Core data models, types, and fundamental platform abstractions
- **[@intabiafusion/platform](packages/platform)** - Platform runtime, plugin system, and dependency injection
- **[@intabiafusion/model](packages/model)** - Data model definitions and schema management

### Client Libraries

- **[@intabiafusion/client](packages/client)** - Client-side data access and synchronization layer
- **[@intabiafusion/client-resources](packages/client-resources)** - Shared client resources and utilities
- **[@intabiafusion/api-client](packages/api-client)** - API client for programmatic access to Huly Platform (WebSocket and REST)
- **[@intabiafusion/account-client](packages/account-client)** - Account management client
- **[@intabiafusion/collaborator-client](packages/collaborator-client)** - Real-time collaboration client
- **[@intabiafusion/hulylake-client](packages/hulylake-client)** - HulyLake data warehouse client
- **[@intabiafusion/analytics](packages/analytics)** - Analytics and tracking
- **[@intabiafusion/analytics-service](packages/analytics-service)** - Analytics service implementation

### Text Processing

- **[@intabiafusion/text](packages/text)** - High-level text processing utilities
- **[@intabiafusion/text-core](packages/text-core)** - Core text processing engine
- **[@intabiafusion/text-html](packages/text-html)** - HTML text rendering and parsing
- **[@intabiafusion/text-markdown](packages/text-markdown)** - Markdown support
- **[@intabiafusion/text-ydoc](packages/text-ydoc)** - Yjs document integration for collaborative editing

### Utilities

- **[@intabiafusion/query](packages/query)** - Query language and execution engine
- **[@intabiafusion/storage](packages/storage)** - Storage abstractions and implementations
- **[@intabiafusion/rank](packages/rank)** - Ranking and ordering utilities
- **[@intabiafusion/retry](packages/retry)** - Retry logic and resilience patterns
- **[@intabiafusion/rpc](packages/rpc)** - RPC communication layer
- **[@intabiafusion/token](packages/token)** - Token management and authentication utilities

## Pre-requisites

Before proceeding, ensure that your system meets the following requirements:

- [Node.js](https://nodejs.org/en/download/) (v20.11.0 or higher is required)
- [Rush](https://rushjs.io/) - Microsoft's scalable monorepo manager

## Installation

You need Microsoft's [rush](https://rushjs.io/) to install the application.

1. Install Rush globally using the command:

```bash
npm install -g @microsoft/rush
```

1. Navigate to the repository root and run the following commands:

```bash
rush install
rush build
```

## Build

To build all packages:

```bash
rush build
```

To rebuild (ignoring cache):

```bash
rush rebuild
```

## Build & Watch

For development purposes, `rush build:watch` action could be used:

```bash
rush build:watch
```

It includes build and validate phases in watch mode.

## Update project structure

If the project's structure is updated, it may be necessary to relink and rebuild the projects:

```bash
rush update
rush build
```

## Troubleshooting

If a build fails, but the code is correct, try to delete the [build cache](https://rushjs.io/pages/maintainer/build_cache/) and retry:

```bash
rm -rf common/temp/build-cache
rush rebuild
```

## Tests

To execute all tests:

```bash
rush test
```

For individual test execution inside a package directory:

```bash
rushx test
```

## Package Publishing

To bump a package version:

```bash
node ./common/scripts/bump.js -p projectName
```

## API Client Usage

If you want to interact with Huly programmatically, check out the [API Client](packages/api-client/README.md) documentation. The API client provides a typed interface for all Huly operations and can be used to build integrations and custom applications.

You can find API usage examples in the [Huly examples](https://github.com/intabia-fusion/huly-examples) repository.

## Related Projects

- **[Huly Platform](https://github.com/intabia-fusion/foundation)** - The main Huly Platform repository
- **[Huly Self-Host](https://github.com/intabia-fusion/huly-selfhost)** - Self-hosting solution for Huly
- **[Huly Examples](https://github.com/intabia-fusion/huly-examples)** - API usage examples

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

Licensed under the [EPL-2.0](LICENSE) license.

## Additional Links

- [Huly Website](https://huly.io/)
- [Documentation](https://docs.huly.io/)
- [Community](https://github.com/intabia-fusion/foundation/discussions)

---

© 2025 [Hardcore Engineering Inc](https://hardcoreeng.com/).
