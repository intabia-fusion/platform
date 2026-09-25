# calendar.class.BusySlot API tests

Область: [Планировщик / Календарь](../features/planner-calendar.md)

`api-tests/api/src/__tests__/calendar-busy.test.ts` covers the FUSIO-1308 BusySlot trigger (`server-plugins/calendar-resources/src/index.ts` `syncBusySlot`/`removeBusySlot`, invoked from `OnEvent`).

## Non-obvious facts

- `api-tests` workspace membership is fixed to `user1`+`user2` only (`dev/test-base/src/stands.ts`) - no third account available. The isolation test does not need a third account: it creates an event where `participants: [user1Person._id]` only, so `user2` (a real workspace member, but not a participant) is the "non-participant" case.
- Default per-user Calendar id is deterministic: `` `${accountUuid}_calendar` `` - fallback branch of `getPrimaryCalendar` in `plugins/calendar/src/utils.ts`, matching `createCalendar` in `server-plugins/calendar-resources/src/index.ts` - no need to query for it, just build the ref.
- `calendar.space.Calendar` is a `core.class.SystemSpace`; `SpaceSecurityMiddleware` treats every `SystemSpace` as readable by any non-guest account regardless of `members`/`private` (`systemSpaces` bucket in `foundations/server/packages/middleware/src/spaceSecurity.ts`) - this is what makes `BusySlot` world-readable, not a BusySlot-specific rule. `contact.class.PersonSpace` is a plain private `Space` (`TPersonSpace extends TSpace` in `models/contact/src/index.ts`), so Event copies there get normal per-space filtering - a non-participant's `findAll` on `calendar.class.Event` silently returns `[]`, no error.
- `RestClient.addCollection`/`updateDoc`/`removeDoc` accept `calendar.class.Event` (an `AttachedDoc`) directly - server routes to the collection variant based on class hierarchy, matching the pattern in `CreateEvent.svelte` (`attachedTo: calendar.ids.NoAttached`, `attachedToClass: calendar.class.Event`, `collection: 'events'`).

## Переопределённое вхождение серии и BusySlot

`getInstance` (`plugins/calendar/src/utils.ts`) строит инстанс через `...event`, поэтому сохранённое переопределение вхождения несёт `rules` мастера. В слот их переносить нельзя - иначе одно перенесённое вхождение блокирует всю серию.

Мастер гасит переопределённое вхождение только на клиенте: `getAllEvents` сравнивает `originalStartTime` инстансов. У `BusySlot` такого механизма нет, есть только `exdate` - поэтому `syncBusySlot`/`masterOverrides` (`server-plugins/calendar-resources/src/index.ts`) дописывает `originalStartTime` всех переопределений (включая `isCancelled`) в `exdate` слота мастера и пересчитывает мастер при любом create/update/remove инстанса.

`rules` у слота инстанса именно отсутствует, не `[]`: клиент делит слоты через `rules: { $exists: ... }`.
