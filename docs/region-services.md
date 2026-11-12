# Регионы сервисов и Kafka

Регионы используют общий Kafka. Имя топика: `${region}.<topic><postfix>`; для пустого региона префикса нет.
`REGION`/`QUEUE_REGION` определяют регион очереди, postfix из `QUEUE_CONFIG` разделяет окружения.
В staging и production регион `pg`, postfix соответственно `-staging` и `-prod`.

## Маршрутизация

| Сервис | Читает | Пишет |
| --- | --- | --- |
| Account | `users` всех настроенных регионов | `workspace`, `fulltext`, `online-user-tx`, `workspace-wakeup` в регион пространства |
| Payment | `workspace` всех настроенных регионов; `subscription` своего региона очереди | `subscription`, `payment-operation`, `workspace`, `notifications` своего региона очереди |
| Workspace-service | `workspace-wakeup` своего региона, отдельная группа на worker | `workspace` своего региона |
| Остальные региональные обработчики | Топики своего региона | Топики своего региона |

Account получает список регионов из region-config, payment - через `getRegionInfo` при запуске.
Account использует одну очередь: `getProducer(ctx, topic, region)` выбирает регион пространства.
Presence отправляется один раз на регион пользователя; maintenance рассылается во все настроенные регионы.
Глобальные пары `notifications`, `crm`, `subscription`, `payment-operation`, `tbank-webhook` сохраняют домашний регион очереди.

## Consumer groups

- Без `options.regions` или с пустым списком: `${topicId}-${groupId}`, где `topicId` уже содержит регион и postfix.
- С непустым `options.regions`: один consumer читает перечисленные региональные топики; группа `${topic}-${groupId}${postfix}`.
- Postfix сохраняется в обоих вариантах: подписка на несколько регионов не объединяет staging и production.
- Переход между схемами меняет группу и не переносит offsets. Условия первого выката: [memory/workspace-wakeup-queue.md](memory/workspace-wakeup-queue.md).
