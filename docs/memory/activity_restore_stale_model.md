# Activity застревает после backup-restore

- `services/activity` держит модель workspace в памяти (`Worker.workspaces`), а restore переписывает модель прямо в БД, без tx. Поэтому tx по классу, которого нет в кэшированной модели, падает на `hierarchy.getDomain` с `domain not found`.
- Kafka consumer повторяет упавшее сообщение бесконечно (`foundations/server/packages/kafka/src/index.ts:494-521`), и вся партиция встаёт.
- Кэш сбрасывается по событиям `Restored`/`Upgraded`/`Deleted` из `QueueTopic.Workspace`. У каждого процесса своя consumer group, как у транзактора.
- Загрузка, начатая до события, закэшировала бы старую модель, поэтому `dropWorkspace` сначала ждёт `loadingWorkspaces`. Тест: `services/activity/src/__tests__/worker.test.ts`.
