# Space Security Broadcast Routing Matrix

This document defines how `SpaceSecurityMiddleware` filters and restricts transaction broadcasts (live updates) to clients based on the space type and transaction scope (space-level vs. object-level).

## Transaction Scopes

Broadcast target filtering differentiates between two scopes of transactions:
1. **Space-level transactions (`isSpaceTx === true`)**: Transactions that create, modify, or delete the space document itself (e.g., modifying membership, privacy settings, or name).
2. **Object-level transactions (`isSpaceTx === false`)**: Transactions on regular documents/objects (e.g., tasks, chat messages, docs) located *inside* a space.

---

## Broadcast Matrix

The following table summarizes which clients receive live updates:

| Space Type | Transaction Level | Operation Type | Broadcast Recipients |
| :--- | :--- | :--- | :--- |
| **Public** | **Space-level** | Create / Update / Delete | **All workspace users** |
| | **Object-level** | Create / Update / Delete | **Space members only** (+ object collaborators) |
| **Private** | **Space-level** | Create / Update / Delete | **Space members + Workspace owners** |
| | **Object-level** | Create / Update / Delete | **Space members only** (+ object collaborators) |
| **Personal** | **Space-level** | Create / Update / Delete | **Space members only** |
| | **Object-level** | Create / Update / Delete | **Space members only** |

---

## Detailed Rules by Space Type

### Public Spaces
- **Space-level updates**: Broadcasted to all workspace users so the space is visible in the public directory/catalog and users can join it.
- **Object-level updates**: Broadcasted only to members of that public space. Even though any user is technically allowed to join a public space, they must join it first to see inside and receive live updates. This prevents client overloading by avoiding broadcasting unnecessary updates to users who haven't joined the space.

### Private Spaces
- **Space-level updates**: Broadcasted to space members and workspace owners. Workspace owners can view all private spaces, so they must receive space updates.
- **Object-level updates**: Broadcasted only to space members and object collaborators. Workspace owners who are not members of the space do not receive broadcasts for objects within the private space.

### Personal Spaces (`PersonSpace`)
- **Space-level & Object-level updates**: Broadcasted strictly to members of the personal space. Workspace owners are never included in broadcasts for personal spaces unless they are explicitly added as members.

---

## Deletion Handling

When a space is deleted, it is removed from the active `spacesMap`. `SpaceSecurityMiddleware`'s `getTxSpaceInfo` helper falls back to `ctx.contextData.removedMap` (populated during the transaction flow) to still find the space's metadata and restrict the broadcast of the deletion transaction (both for the space itself and any objects deleted inside it) to its members/owners.

If a space is not found in either `spacesMap` or `removedMap`, `getTxSpaceInfo` returns `undefined`. An `undefined` target is treated by `BroadcastMiddleware.doBroadcast` as "no restriction": the transaction is broadcast to all workspace sessions, not to none.

## Связанные документы

- [architecture.md](architecture.md) - серверный pipeline и `BroadcastMiddleware`.
