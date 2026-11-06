# Класс в истории активности

Область: [Трекер](../features/tracker.md), [Чат и уведомления](../features/chat.md)

- `DocUpdateMessage.objectClass` — класс, с которым произошло событие, и он неизменяем: смена типа задачи меняет `_class` документа, но не старые сообщения. `OnDocClassChanged` (`server-plugins/activity-resources/src/index.ts`) переносит `attachedToClass`, а у `ActivityReference` также `srcDocClass`/`attachedDocClass`: это указатели на текущие объекты, а не исторический тип.
- Документ сообщения может быть уже другого класса, поэтому клиент ищет его по `getParentClass(message.objectClass)` (`getMessageObjectQueryClass`, `plugins/activity-resources/src/activityMessagesUtils.ts`): все target-классы типов задачи лежат в одном домене (`task`), и верхний класс находит и новый. Если класс удалён (тип задачи удалили, `OnTaskTypeRemove`), за точку отсчёта берётся `attachedToClass` и от него тоже поднимаются до верхнего класса домена: у записи коллекции («добавлена подзадача») контейнер и объект - разные классы, и одного `attachedToClass` мало.
- Иконка и имя исторического типа — это живой `core:class:Class`: переименование или смена иконки типа отражается в старых записях. Это ожидаемо.
- Заморозить текст записи о создании можно только по `intlParamsNotLocalized.object` (его пишет сервис активности для уведомлений), но класса, иконки и цвета там нет: записи, перезаписанные до фикса, остаются с новым типом.

- Обратная ссылка хранится у цели (`attachedTo`), а источник записан в `srcDocId`: запрос активности только по `attachedTo=источник` её не находит. После удаления старого `TaskType.targetClass` запрос по оставшемуся `srcDocClass` даёт `ancestors not found` в `AggregationMiddleware.findAll` (`plugins/view-resources/src/middleware.ts`); пустой результат ошибки кэшируется в `LiveQuery`, поэтому уведомление может не повторяться до сброса кэша.
