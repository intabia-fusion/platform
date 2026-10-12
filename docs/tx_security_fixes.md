# Исправления безопасности приёма транзакций

Две проблемы в том, как транзактор принимает транзакции (tx) от клиента. Найдены на ревью, были в `develop`, к конкретной фиче не относятся. Обе исправлены и покрыты unit-тестами.

| # | Проблема | Чем грозило | Где исправлено |
| --- | --- | --- | --- |
| 1 | Пути полей в tx могли вести в прототип объектов | Порча общего состояния процесса транзактора, вплоть до ослабления проверок доступа у всех его сессий | `objvalue.ts`, `normalizeTx.ts` |
| 2 | Признак «tx от триггера» брался из поля, которое задаёт клиент | Запись в пространства без членства, обход ограничений гостей и режима только для чтения | `spaceSecurity.ts`, `guestPermissions.ts`, `seatLimits.ts` |

## 1. Пути полей, ведущие в прототип объектов

### Проблема

Ключи `operations` у `TxUpdateDoc` и `attributes` у `TxMixin` - это пути полей через точку, их применяет `setObjectValue` (`foundations/core/packages/core/src/objvalue.ts`). Служебные сегменты `__proto__`, `constructor`, `prototype` не отсекались, поэтому запись по такому пути попадала не в документ, а в прототип, общий для всех объектов процесса. Это глобальное состояние транзактора: оно действует на все сессии и воркспейсы процесса до его перезапуска, в том числе на проверки доступа. Та же tx рассылается клиентам и применяется в их `LiveQuery`.

`NormalizeTxMiddleware` проверял только типы полей tx, ключи внутри `operations` и `attributes` никто не проверял.

### Решение

- `isUnsafeKey` (`objvalue.ts`) - путь, в котором есть сегмент `__proto__`, `constructor` или `prototype`. Сравнение по целому сегменту: `constructorName` или `my__proto__` безопасны.
- `setObjectValue` такой путь пропускает без записи. Это защита на всех путях применения tx, включая клиентский `LiveQuery`.
- `NormalizeTxMiddleware.sanitizePaths` на входе удаляет такие ключи из `attributes` (create, mixin), `operations` (update), из ключей внутри операторов, из целей `$rename` и из tx внутри `TxApplyIf`. Остальная часть tx применяется, в лог уходит предупреждение `unsafe field path removed from tx` с id tx, классом и аккаунтом.

Почему удаление, а не ошибка: в модели нет атрибутов с такими именами, легитимный клиент их не шлёт. Ошибка в `setObjectValue` ломала бы обработку потока tx у клиентов, а молчаливый пропуск - нет.

### Тесты

- `foundations/core/packages/core/src/__tests__/objvalue.test.ts`, блок `paths reaching Object.prototype`: `setObjectValue` и `TxProcessor` (update, mixin) применяют обычные поля и не трогают прототип; `isUnsafeKey` сравнивает целые сегменты.
- `foundations/server/packages/middleware/src/tests/normalizeTx.test.ts`, блок `field paths reaching Object.prototype`: удаление в update, операторах, mixin, create и `TxApplyIf`; обычные пути не меняются, предупреждения нет.

## 2. Признак tx от триггера из клиентского поля

### Проблема

Tx, которые порождают триггеры, проходят без проверок доступа: триггер действует от имени системы и пишет туда, куда сам пользователь не может. Распознавали их по `tx.space === core.space.DerivedTx`. Но `space` - поле самой tx, его задаёт клиент, а `NormalizeTxMiddleware` проверяет только, что это строка. Поэтому пропуск срабатывал и для клиентских tx:

- `SpaceSecurityMiddleware.checkWriteAccess` - проверка записи в пространство (членство в приватном);
- `GuestPermissionsMiddleware` - правила для гостей;
- `SeatLimitsMiddleware` - режим только для чтения для участника без места.

Для объектов класса `Space` это уже было исправлено раньше (FUSIO-1316): там решение принималось по флагу `derived`. Для остальных документов осталась проверка по `tx.space`, а тест `allows a trigger-derived tx regardless of membership` закреплял такое поведение для клиентского пути.

### Как на самом деле устроены tx триггеров

- Серверные derived-tx (триггеры, `ChunterMiddleware`, `NotificationMiddleware`) входят в пайплайн через `context.derived` - следующий после `MarkDerivedEntryMiddleware` (`server/server-pipeline/src/pipeline.ts`), то есть ниже трёх мидлварей выше. В их `tx()` они не попадают.
- В `SpaceSecurityMiddleware` они приходят через `handleBroadcast` с `derived = true`.
- На время их обработки сервер ставит `contextData.isTriggerCtx = true` (`enterTriggerCtx` в `triggers.ts`, `NotificationMiddleware`). `SessionData` создаётся заново на каждый запрос (`ClientSession.includeSessionContext`), клиент этот флаг выставить не может.
- Внешние сервисы, которые сами шлют `DerivedTx` (github, notifications, activity), подключаются под `systemAccountUuid` и проходят проверки как системный аккаунт.
- Из клиента `DerivedTx` шлёт только `EditTagElement.svelte`: при переименовании тега обновляет найденные `TagReference`. Такой запрос без `space` возвращает ссылки только из пространств, где пользователь участник, и из системных (`addSecurity`), а писать туда `canWriteSpace` разрешает, поэтому проверка записи этот сценарий не ломает. Гость и участник без места до ссылок не доходят: им запрещено уже обновление самого тега.

### Решение

Пропуск триггеров сохранён, но признак теперь серверный, `tx.space` не учитывается:

- `SpaceSecurityMiddleware.checkWriteAccess` пропускает tx при `derived` (пришла через `handleBroadcast`) или `isTriggerCtx === true`;
- `GuestPermissionsMiddleware` и `SeatLimitsMiddleware` пропускают tx при `isTriggerCtx === true`.

Клиентская tx с `DerivedTx` не отклоняется, а проверяется как обычная.

Оставлено как есть сознательно: tx с `DerivedTx` не пишется в журнал `DOMAIN_TX` (`txPush.ts`) и пропускается activity и вебхуками. Проверки доступа она теперь проходит как обычная, поэтому записать ею можно только то, что пользователь и так вправе записать.

### Тесты

- `foundations/server/packages/middleware/src/tests/spaceSecurity.test.ts`, блок `write access into non-space objects`: tx триггера проходит через `handleBroadcast`; клиентские create, update и remove с `DerivedTx` в чужое приватное пространство отклоняются; в контексте триггера tx проходит.
- `foundations/server/packages/middleware/src/tests/guestPermissions.test.ts`, блок `Guest`: запрет без уровня доступа для гостей, `DerivedTx` проверяется как обычная tx, в контексте триггера проходит.
- `foundations/server/packages/middleware/src/__tests__/seatLimits.test.ts`: участник без места остаётся только для чтения при `DerivedTx`, в контексте триггера его tx проходит.

На коде до исправления новые тесты на подделку падают.

## Как проверить

```bash
pnpm build:lint --to @hcengineering/middleware
```

```bash
cd foundations/core/packages/core && npx jest src/__tests__/objvalue.test.ts
```

```bash
cd foundations/server/packages/middleware && npx jest src/tests/normalizeTx.test.ts src/tests/spaceSecurity.test.ts src/tests/guestPermissions.test.ts src/__tests__/seatLimits.test.ts
```

Связанное: [space_security_broadcasts.md](space_security_broadcasts.md).
