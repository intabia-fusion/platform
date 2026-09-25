# Planner ToDo <-> Issue

Область: [Планировщик / Календарь](../features/planner-calendar.md)

ToDo больше не управляет статусом Issue. Убрано в `server-plugins/time-resources/src/index.ts`:
- `IssueToDoDone` + миксин `serverTime.mixin.OnToDo` (закрытие ToDo двигало Issue на следующий статус), вместе с ним умерли `TodoAutomationHelper.onDoneTester`-геты - сам класс и регистрация в `services/github/server-github-model` остались, но их никто не вызывает;
- `OnToDoRemove` (удаление последнего ToDo откатывало Issue в UnStarted);
- ветка Won/Lost в `changeIssueStatusHandler` (закрытие Issue гасило ToDo);
- перевод Issue в Active при создании первого WorkSlot (`OnWorkSlotCreate`).

Осталась только связь Issue -> ToDo: назначение assignee и перевод в Active/ToDo создают ToDo.

## Время

`TimeSpendReport` теперь 1:1 с `WorkSlot` через новое поле `TimeSpendReport.workslot` (`plugins/tracker/src/index.ts`, `models/tracker/src/types.ts`, hidden). Триггеры `OnWorkSlotCreate/Update/Remove` создают, пересчитывают и удаляют отчёт; значение точное, `(dueDate - date)` в часах, без округления до 15 минут (`workSlotHours` в `server-plugins/time-resources/src/index.ts`).

- `reportedTime` у Issue считает `doTimeReportUpdate` в `server-plugins/tracker-resources`, поэтому update/remove отчёта обязаны идти через `createTxCollectionCUD` - иначе нет `attachedTo` и время не пересчитается.
- Удаление ToDo каскадом сносит WorkSlot'ы (коллекция `workslots`), те - отчёты.
- Бэкфила нет: у слотов, созданных до этой правки, отчёта не появится, старые суммарные отчёты остаются как есть.

## Split потрачено / запланировано

Граница "сейчас" двигается без транзакций, поэтому денормализовать split на Issue нельзя - считается только на чтении. Два хелпера:
- `splitReportedTime` в `plugins/tracker/src/index.ts` - по отчётам (конец слота восстанавливается как `date + value`), живёт в plugin-пакете, а не в `tracker-resources/utils.ts`: тот тянет presentation и не импортируется в jest.
- `splitEventsDuration` в `plugins/time-resources/src/utils.ts` - по самим слотам, поверх `calculateEventsDuration` (она схлопывает пересечения).

Показывается в: `ReportedTimeEditor` (боковая панель, доп. liveQuery по отчётам issue), `TimeSpendReports` (заголовок), `TimeSpendReportsList` (будущие строки приглушены), `ToDoDuration`/`Workslots`/`ToDoGroup` в планере (в `AccordionItem` есть слот `duration`, править ui-пакет не пришлось).

Крутилки (`EstimationProgressCircle`, `EstimationStatsPresenter`) сознательно остались на полном `issue.reportedTime` = факт + план.

## Переназначение и закрытие задачи

Переназначение (`changeIssueAssigneeHandler`): ToDo старого исполнителя НЕ закрывается - закрыть может решить только он сам. Вместо `doneOn` ставится `ToDo.reassignedTo` и режутся слоты по `now` (`trimWorkSlots`, общий с веткой `doneOn` в `OnToDoUpdate`): будущие удаляются, идущий обрезается, отчёты уменьшаются сами через `OnWorkSlotUpdate/Remove`. Новый ToDo не создаётся, если у нового исполнителя уже есть открытый на эту задачу (иначе A->B->A даёт дубль).

`reassignedTo` появилось не ради UI, а как носитель tx: уведомление доставляется по tx над объектом, а старый исполнитель в том же цикле выпадает из коллабораторов Issue (`createSyncCollaboratorsTxes`, removed), поэтому уведомление по tx над Issue до него не дойдёт. Коллаборатор ToDo - его `user`, он не меняется.

Закрытие задачи ToDo не гасит. Вместо этого:
- диалог `MessageBox` у того, кто закрыл: `time.function.SuggestCloseToDos` (реализация в `time-resources/utils.ts`, зовётся через `getResource` из `StatusEditor.svelte` и `task-resources/StatusSelector.svelte` - tracker-resources и task-resources не зависят от time-resources, только от `@hcengineering/time`). Канбан-drag и workflow-переходы идут мимо диалога;
- inbox `time.ids.IssueClosedToDo` - `TxNotificationType` по `field: 'status'` объекта Issue, `notifyAuthor: false` (инициатор не получает, за это отвечает `resolveNotifyProviders` в `services/notifications/src/utils/providers.ts`), `match`/`create` проверяют, что статус Won/Lost и у получателя есть открытый ToDo.

`TxNotificationType` обрабатывает отдельный сервис `services/notifications` (`isMatchedTxType` в `src/utils/providers.ts`), а не триггеры транзактора - в server-plugins потребителя нет.
