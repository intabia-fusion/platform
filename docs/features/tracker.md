# Трекер

> Сверено с кодом: коммит 39ae47eb6f, 2026-09-23.

Issue-трекер платформы: проекты (`Project`), задачи (`Issue`) с иерархией подзадач, приоритетами, статусами, оценкой и учётом времени, компонентами и вехами (`Milestone`). Поверх задач работает общий движок типов задач и статусов (`task`), конечный автомат переходов статусов (`workflow`), представления list/kanban (`view`) и теги-метки (`tags`). Сущности: `Issue`, `Project`, `Component`, `Milestone`, `IssueTemplate`, `TimeSpendReport`, `TaskType`, `Workflow`.

## Где код

| Пакет | Путь | Роль |
| --- | --- | --- |
| model-tracker | `models/tracker/src` | Модель Issue/Project/Component/Milestone/IssueTemplate/TimeSpendReport, миграции, actions, viewlets, permissions |
| tracker | `plugins/tracker/src` | Типы/enum'ы, shared-хелпер `CreateIssue`, `duration.ts`, `splitReportedTime`/`reduceChildInfoTree` |
| tracker-resources | `plugins/tracker-resources/src` | UI: список/канбан задач, диалоги создания/редактирования, time tracking |
| tracker-assets | `plugins/tracker-assets/lang` | Локализация |
| server-tracker | `server-plugins/tracker/src` | Типы серверного плагина (презентеры, link-провайдеры) |
| server-tracker-resources | `server-plugins/tracker-resources/src` | Триггеры `OnIssueUpdate`/`OnComponentRemove`/`OnProjectRemove` |
| model-task | `models/task/src` | Базовый `Task`, `TaskType`, `TaskTypeDescriptor`, категории статусов |
| task | `plugins/task/src` | Типы + `transfer/` (экспорт/импорт TaskType) |
| task-resources | `plugins/task-resources/src` | UI: `StatusSelector`, диаграмма иерархии типов |
| task-assets | `plugins/task-assets/lang` | Локализация |
| server-task | `server-plugins/task/src` | `TaskMiddleware` (валидация `kind`) |
| server-task-resources | `server-plugins/task-resources/src` | Триггеры `OnStateUpdate`/`OnTaskTypeUpdate`/`OnTaskTypeRemove` |
| model-view | `models/view/src` | Viewlet-дескрипторы (Table/List/MasterDetail/Tree/Document/RelationshipTable), миксины Groupping/Aggregation/SortFuncs |
| view | `plugins/view/src` | Типы viewlet/filter-механики |
| view-resources | `plugins/view-resources/src` | UI-реализация списков/фильтров/сохранённых представлений |
| server-view | `server-plugins/view/src` | `ServerLinkIdProvider` |
| server-view-resources | `server-plugins/view-resources/src` | Триггер `OnCustomAttributeRemove` |
| model-workflow | `models/workflow/src` | `Workflow`/`WorkflowTransition`/`ProjectWorkflow`, 36 функций-трансформов |
| workflow | `plugins/workflow/src` | `schema/` (правила перехода), `transfer/` (экспорт/импорт конфигурации), `utils.ts` |
| workflow-resources | `plugins/workflow-resources/src` | UI редактора workflow, триггеры удаления (`WorkflowTrigger.ts`) |
| workflow-assets | `plugins/workflow-assets/lang` | Локализация |
| server-workflow | `server-plugins/workflow/src` | `WorkflowMiddleware` - валидация переходов статуса |
| server-workflow-resources | `server-plugins/workflow-resources/src` | Каскадное удаление (Workflow/TaskType/Status/Screen) |
| model-tags | `models/tags/src` | `TagCategory`/`TagElement`/`TagReference` (метки Issue) |
| tags, tags-resources, tags-assets | `plugins/tags*` | Типы и UI меток |
| server-tags, server-tags-resources | `server-plugins/tags*` | Триггеры на удаление тегов/ссылок |
| model-card, card, card-resources | `models/card`, `plugins/card*` | Отдельная generic-модель "карточек" (`Card`/`MasterTag`/`Tag`) - трекер её не импортирует |

## Модель данных

| Класс | Смысл | Файл |
| --- | --- | --- |
| `TIssue` | Задача, `extends TTask`; `title`/`description` (FullText), `status`, `priority`, `assignee`, `component`, `milestone`, `estimation`/`remainingTime`/`reportedTime`, `subIssues`/`parents`/`childInfo` (денормализованное дерево), `blockedBy`/`relations`, `labels: Collection<TagReference>`, `template?`, `todos` (hidden, коллекция `ToDo`) | `models/tracker/src/types.ts` |
| `TTask` (база) | `status`, `kind` (ReadOnly, ссылка на `TaskType`), `number`, `assignee`, `dueDate`, `rank` (lexorank), `labels`, `comments`, `attachments`, `isDone`, `identifier` | `models/task/src/index.ts` |
| `TProject` | `identifier` (FullText, префикс `PROJECT-N`), `sequence`, `defaultIssueStatus`, `defaultAssignee`, `defaultTimeReportDay`, `relatedIssueTargets` | `models/tracker/src/types.ts` |
| `TComponent` | `label`, `description`, `lead`; агрегация по лидеру | `models/tracker/src/types.ts` |
| `TMilestone` | `label`, `status: MilestoneStatus`, `targetDate` | `models/tracker/src/types.ts` |
| `TIssueTemplate` | Шаблон задачи: поля `IssueTemplateData` + `children: IssueTemplateChild[]` (дерево) | `models/tracker/src/types.ts` |
| `TTimeSpendReport` | Запись времени: `attachedTo`, `employee`, `date`, `value`, `description`, `workslot?: Ref<WorkSlot>` (hidden, зеркалит слот планировщика) | `models/tracker/src/types.ts` |
| `TRelatedIssueTarget` | Маппинг проект-проект для связей issues: `rule: RelatedClassRule \| RelatedSpaceRule` | `models/tracker/src/types.ts` |
| `TaskType` | `name`, `parent: Ref<ProjectType>`, `isRootTaskType`, `allowAnyParent`, `allowedAsChildOf`, `ofClass`, `targetClass`, `statuses`, `statusClass`, `statusCategories` | `models/task/src/index.ts` |
| `TaskTypeDescriptor` | `statusCategoriesFunc`, `defaultStatusesFunc`, `allowCreate` | `models/task/src/index.ts` |
| `Workflow`/`WorkflowTransition` | Конечный автомат статусов на пару "тип проекта + тип задачи"; переход: `from`/`to`/`rank`+ 3 вида правил | `models/workflow/src/index.ts` |
| `TTagCategory`/`TTagElement`/`TTagReference` | Категория меток / метка / привязка метки к документу (используется как `Issue.labels`) | `models/tags/src/index.ts` |

`IssuePriority` (`NoPriority/Urgent/High/Medium/Low`), `MilestoneStatus` (`Planned/InProgress/Completed/Canceled`), `TimeReportDayType` (`CurrentWorkDay/PreviousWorkDay`), `IssuesGrouping`/`IssuesOrdering` - `plugins/tracker/src/index.ts`.

Классический тип задачи `tracker.taskTypes.Issue` ("Classic Issue", root, `allowAnyParent`) и статусы Backlog/Todo/In Progress/Done/Canceled (категории UnStarted/ToDo/Active/Won/Lost) заданы статически в `defineSpaceType` - `models/tracker/src/index.ts`, список статусов `classicIssueTaskStatuses` - `models/tracker/src/index.ts`.

## Как работает

1. **Создание задачи.** Диалог `CreateIssue.svelte` (`tracker.component.CreateIssue`) собирает `IssueDraft` (`plugins/tracker/src/index.ts`, включает `assistConversation?: Ref<Doc>` - возврат к незавершённому драфту восстанавливает и диалог с AI-ассистентом). Общий хелпер `tracker.function.CreateIssue(client, project, NewIssue) -> CreatedIssue` (`plugins/tracker/src/index.ts`) даёт другим плагинам создавать issues без зависимости от `tracker-resources`.
2. **Переход статуса под workflow.** Любой CUD на `Task`/`Issue` проходит через `WorkflowMiddleware.tx` (`server-plugins/workflow/src/middleware.ts`): проверка `InitialStatusNotAllowed`/`ForbiddenTransition`/`SelfTransitionNotAllowed`/`TransitionConflict` (`hasSelfTransition`/`getTransitionConflict` - `plugins/workflow/src/utils.ts`), затем исполнение серверных валидаторов/пост-функций правила перехода.
3. **Учёт времени: TimeSpendReport -> Issue.reportedTime.** `OnIssueUpdate` (`server-plugins/tracker-resources/src/index.ts`) ловит CUD на `TimeSpendReport`, `doTimeReportUpdate` инкрементально пересчитывает `reportedTime`; `remainingTime` и суммарная оценка дерева считаются через `reduceChildInfoTree` (`plugins/tracker/src/index.ts`, bottom-up по `childInfo`, оценка родителя = max(своя, сумма по дереву), legacy flat-фоллбэк для старых данных без `parentId`).
4. **ToDo/WorkSlot <-> TimeSpendReport (FUSIO-38).** Назначение исполнителя или перевод Issue в Active/ToDo создаёт `ToDo` планировщика (`createIssueHandler`/`getCreateToDoTx`, `server-plugins/time-resources/src/index.ts`); обратной связи "закрыл ToDo -> сдвинулся статус Issue" больше нет. `OnWorkSlotCreate/Update/Remove` создают/пересчитывают/удаляют `TimeSpendReport` 1:1 через поле `TimeSpendReport.workslot`. Подробности переезда/переназначения - `docs/memory/planner-todo-issue-decoupling.md` и `../features/planner-calendar.md`.
5. **Kanban: группировка и drag/drop.** `KanbanView.svelte` (`plugins/tracker-resources/src/components/issues/KanbanView.svelte`) рендерит `IssueKanban` viewlet (`tracker.viewlet.Kanban` - `models/tracker/src/viewlets.ts`); `swimLaneBy` (none/assignee/priority/component/milestone/status/attachedTo/space) и `compactMode` - опции `issuesOptions(true)` (`models/tracker/src/viewlets.ts`); перетаскивание меняет `rank` (lexorank) карточки.
6. **Экспорт/импорт конфигурации workflow.** `plugins/workflow/src/transfer/export.ts` сериализует статусы/переходы/правила в `WorkflowConfig` с токенами `$status:`/`$taskType:`/`$screen:`/`$attr:` (`resolver.ts`); `compatibility.ts` строит отчёт совместимости (матчинг статусов/атрибутов/ экранов); `import.ts` атомарно применяет конфиг к целевому проекту.

## Фичи

### Issue и связи
- **Дерево подзадач.** `subIssues`/`parents`/`childInfo` денормализованы инкрементальными `$push`/`$pull`, без полного пересчёта дерева при каждом изменении. - `models/tracker/src/types.ts`.
- **Связи между issues.** `blockedBy`/`relations` (Blocks/Blocked by/Related to), кросс-проектная настройка целей через `RelatedIssueTarget` и действие `EditRelatedTargets`. - `models/tracker/src/types.ts`, `models/tracker/src/actions.ts`.
- **AI-ассистент при создании.** Расширения `CreateIssueAssist`/`CreateIssueHeaderActions` в шапке диалога создания; `IssueDraft.assistConversation` хранит корень диалога. - `plugins/tracker/src/index.ts`.
- **Шаблоны задач.** `IssueTemplate` с деревом `children: IssueTemplateChild[]`; создание задачи из шаблона перезаписывает поля значениями шаблона. - `models/tracker/src/types.ts`.

### Time tracking
- **Оценка/факт/остаток.** `estimation` (ручная), `reportedTime` (авто, триггер), `remainingTime` (readOnly, `reduceChildInfoTree`). - `plugins/tracker/src/index.ts`.
- **Разбивка "потрачено/запланировано".** `splitReportedTime` - конец слота-отчёта восстанавливается как `date + value`, идущий слот делится пропорционально; для самих слотов планировщика есть аналог `splitEventsDuration` в `plugins/time-resources/src/utils.ts`. - `plugins/tracker/src/index.ts`.
- **Диалог отчёта.** `TimeSpendReportPopup` (действие `T`), быстрые кнопки часов, выбор сотрудника, `TimeReportDayType` (Current/Previous Work Day). - `plugins/tracker-resources/src/components/issues/timereport/`.
- **UI оценки.** `EstimationEditor`/`EstimationPopup`/`EstimationStatsPresenter`/ `SubIssuesEstimations`/`TimeSpendReportList`/`ReportedTimeEditor` - круговой прогресс, список отчётов по саб-issues, календарь "люди x дни". - `plugins/tracker-resources/src/components/issues/timereport/`.
- **Формат длительности.** `parseDuration`/`formatDuration`/`formatDurationCompact` (алиасы единиц по языку m/h/d/w), `durationFormatHint`. - `plugins/tracker/src/duration.ts`.

### Task types и статусы
- **Иерархия типов задач.** `TaskType.allowedAsChildOf`/`allowAnyParent`/`isRootTaskType`; диаграмма `TaskTypesDiagram` в настройках проекта. - `models/task/src/index.ts`.
- **5 категорий статусов.** UnStarted/ToDo/Active/Won/Lost, классические статусы Issue Backlog/ Todo/In Progress/Done/Canceled. - `models/task/src/index.ts`, `models/tracker/src/index.ts`.
- **Смена типа задачи.** Действие `ChangeTaskType`; освобождает переход workflow при смене `kind` (см. `server-plugins/workflow/src/middleware.ts`). - `models/tracker/src/actions.ts`.
- **Экспорт/импорт TaskType.** Режимы `single`/`hierarchy` (`getConnectedTaskTypes` - связная компонента по `allowedAsChildOf`), дедуп enum'ов, ремап parent-child. - `plugins/task/src/transfer/`.

### Workflow
- **Правила перехода.** Validators (`FieldRequired`, `SubtaskStatus`, `ParentStatus`), Requests (`ScreenRequest`), Post-functions (`UpdateFieldValue`, `ClearFieldValue`) - единая форма `WorkflowRuleConfig`. - `plugins/workflow/src/schema/`.
- **36 функций-трансформов значений** (строковые/числовые/даты/конверсии/агрегаты) для `UpdateFieldValue`. - `models/workflow/src/functions.ts`.
- **Конфликты переходов.** `findTransitionConflict`/`hasSelfTransition`/`getTransitionConflict`. - `plugins/workflow/src/utils.ts`.
- **Каскадное удаление.** `OnWorkflowDelete`/`OnTaskTypeDelete`/`OnStatusDelete`/`OnScreenDelete`. - `server-plugins/workflow-resources/src/WorkflowTrigger.ts`.
- **Экспорт/импорт workflow-конфигурации.** Токены `$status:`/`$taskType:`/`$screen:`/`$attr:`, `NameResolver` (минимальный ref при коллизии имён), отчёт совместимости статусов/атрибутов/экранов. - `plugins/workflow/src/transfer/` (7 файлов: `export.ts`, `import.ts`, `compatibility.ts`, `resolver.ts`, `utils.ts`, `types.ts`, `index.ts`).

### Views (list/kanban)
- **Viewlet'ы трекера.** `IssueList` (список с priority/identifier/status/kind/title/labels/ Milestone/Component/dueDate/reportedTime/estimation/assignee), `IssueKanban`, `SubIssues`/`ParentIssues`, `MilestoneIssuesList`, `ComponentIssuesList`. - `models/tracker/src/viewlets.ts`.
- **Группировка/сортировка.** `issuesOptions(kanban)`: groupBy status/kind/assignee/priority/space/ component/milestone/attachedTo/createdBy/modifiedBy/estimation/remainingTime/reportedTime; для kanban - `swimLaneBy` (8 значений) + `compactMode`. - `models/tracker/src/viewlets.ts`.
- **Опции показа.** `shouldShowSubIssues`, `shouldShowAll`, `hideArchived`. - `models/tracker/src/viewlets.ts`.

### Проекты, компоненты, вехи
- **Дефолтный проект.** `tracker.project.DefaultProject` (`identifier: 'TSK'`, `autoJoin: true`) создаётся миграцией `create-defaults`, только если не удалён пользователем. - `models/tracker/src/migration.ts`.
- **Запрет создания проектов.** Permission `ForbidCreateProject` - `forbid`-правило на `TxCreateDoc`/`Project` уровня workspace. - `models/tracker/src/permissions.ts`.
- **Компоненты.** Агрегация/группировка по `lead` (`CreateComponentAggregationManager`, `GrouppingComponentManager`). - `models/tracker/src/index.ts`.
- **Вехи.** `SetMilestone` (`S+P`), `DeleteMilestone` (`Meta+Backspace`, с переносом задач). - `models/tracker/src/actions.ts`.

## Куда смотреть, если нужно...

- Добавить поле в Issue -> `models/tracker/src/types.ts` (`TIssue`) + интерфейс `Issue` в `plugins/tracker/src/index.ts`.
- Изменить пересчёт `reportedTime`/`remainingTime` -> `server-plugins/tracker-resources/src/index.ts` (`OnIssueUpdate`, `doTimeReportUpdate`) и `reduceChildInfoTree` (`plugins/tracker/src/index.ts`).
- Поменять разбивку "потрачено/запланировано" -> `splitReportedTime` (`plugins/tracker/src/index.ts`).
- Добавить/поменять правило workflow (validator/request/post-function) -> `plugins/workflow/src/schema/` + сервер `server-plugins/workflow/src/middleware.ts`.
- Добавить функцию-трансформ значения для `UpdateFieldValue` -> `models/workflow/src/functions.ts`.
- Изменить статусы по умолчанию классического Issue -> `classicIssueTaskStatuses` (`models/tracker/src/index.ts`) + `defineSpaceType`.
- Добавить действие над Issue (хоткей/попап) -> `models/tracker/src/actions.ts`.
- Изменить viewlet/колонки списка/канбана -> `models/tracker/src/viewlets.ts`.
- Поменять группировку/сортировку/swim lanes -> `issuesOptions` (`models/tracker/src/viewlets.ts`).
- Изменить экспорт/импорт конфигурации workflow -> `plugins/workflow/src/transfer/` (`export.ts`/`import.ts`/`compatibility.ts`).
- Изменить иерархию/наследование типов задач -> `models/task/src/index.ts` (`TTaskType`) + `plugins/task/src/transfer/` (перенос между проектами).
- Поправить формат длительности (`2h 30m`) -> `plugins/tracker/src/duration.ts`.

## Настройки и конфигурация

- Permission `tracker.permission.ForbidCreateProject` - запрет создания проектов на уровне workspace (`models/tracker/src/permissions.ts`).
- Мод. `core.mixin.TxAccessLevel: Maintainer` на `Workflow`/`WorkflowTransition` - редактировать workflow может только Maintainer+ (`models/workflow/src/index.ts`).
- `Project.defaultTimeReportDay` (`CurrentWorkDay`/`PreviousWorkDay`) - настройка проекта, влияет на диалог `TimeSpendReportPopup`.

## Тесты

- Unit (jest): `plugins/tracker/src/__tests__/duration.test.ts`, `childInfoTree.test.ts`, `splitReportedTime.test.ts`; `plugins/tracker-resources/src/__tests__/taskTypeChange.test.ts`; `server-plugins/tracker-resources/src/__tests__/trigger.test.ts`; `server-plugins/time-resources/src/__tests__/{reassign,workslotReport,statusDecoupling}.test.ts`.
- Workflow: `plugins/workflow/src/__tests__/{utils,validators}.test.ts` + `__tests__/transfer/{compatibility,export,import,resolver,utils}.test.ts`; `plugins/task/src/__tests__/transfer/{attributes,export,hierarchy,import}.test.ts`; `server-plugins/workflow/src/__tests__/middleware.test.ts`.
- Sanity (Playwright): `tests/sanity/tests/tracker/` (`tracker.spec.ts`, `kanban.spec.ts`, `filter.spec.ts`, `subissues.spec.ts`, `template.spec.ts`, `milestone.spec.ts`, `related-issues.spec.ts`, `relations.spec.ts`, `labels.spec.ts`, `component.spec.ts`, `projects.spec.ts`, и др.), page-объекты в `tests/sanity/tests/model/tracker/`.

## Связанные документы

- [../time-tracking.md](../time-tracking.md) - модель данных и UI учёта времени на Issue (estimation/reportedTime/remainingTime, childInfo-агрегация).
- [../time-tracking-examples.md](../time-tracking-examples.md) - разбор кейсов агрегации дерева оценок.
- [../workflow.md](../workflow.md) - покрытие тестами фичи Workflow (jest/Playwright/ручные сценарии).
- [../memory/workflow-tests.md](../memory/workflow-tests.md) - заметки по тестам workflow.
- [../memory/planner-todo-issue-decoupling.md](../memory/planner-todo-issue-decoupling.md) - FUSIO-38, развязка ToDo/Issue, переназначение исполнителя, `TimeSpendReport.workslot`.
- [planner-calendar.md](planner-calendar.md) - Планировщик (`ToDo`/`WorkSlot`), Team Planner, календарь - смежная система, откуда приходят time-report'ы по слотам.
