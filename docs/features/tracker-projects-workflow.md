# Трекер: проекты, типы задач и workflow

> Сверено с кодом: коммит 39ae47eb6f, 2026-09-23.

Общая архитектура и пакеты: [tracker.md](tracker.md).

## Модель данных

| Класс | Смысл | Файл |
| --- | --- | --- |
| `TProject` | `identifier` (FullText, префикс `PROJECT-N`), `sequence`, `defaultIssueStatus`, `defaultAssignee`, `defaultTimeReportDay`, `relatedIssueTargets` | `models/tracker/src/types.ts` |
| `TComponent` | `label`, `description`, `lead`; агрегация по названию без учёта регистра | `models/tracker/src/types.ts` |
| `TMilestone` | `label`, `status: MilestoneStatus`, `targetDate` | `models/tracker/src/types.ts` |
| `TaskType` | `name`, `parent: Ref<ProjectType>`, `isRootTaskType`, `allowAnyParent`, `allowedAsChildOf`, `ofClass`, `targetClass`, `statuses`, `statusClass`, `statusCategories` | `models/task/src/index.ts` |
| `TaskTypeDescriptor` | `statusCategoriesFunc`, `defaultStatusesFunc`, `allowCreate` | `models/task/src/index.ts` |
| `Workflow`/`WorkflowTransition` | Конечный автомат статусов на пару "тип проекта + тип задачи"; переход: `from`/`to`/`rank`+ 3 вида правил | `models/workflow/src/index.ts` |

`MilestoneStatus` (`Planned/InProgress/Completed/Canceled`) - `plugins/tracker/src/index.ts`.

Классический тип задачи `tracker.taskTypes.Issue` ("Classic Issue", root, `allowAnyParent`) и статусы Backlog/Todo/In Progress/Done/Canceled (категории UnStarted/ToDo/Active/Won/Lost) заданы статически в `defineSpaceType` - `models/tracker/src/index.ts`, список статусов `classicIssueTaskStatuses`

## Как работает

### Переход статуса под workflow

- Любой CUD на `Task`/`Issue` проходит через `WorkflowMiddleware.tx` (`server-plugins/workflow/src/middleware.ts`): проверка `InitialStatusNotAllowed`/`ForbiddenTransition`/`SelfTransitionNotAllowed`/`TransitionConflict` (`hasSelfTransition`/`getTransitionConflict` - `plugins/workflow/src/utils.ts`), затем исполнение серверных валидаторов/пост-функций правила перехода.
- Ошибки задачи уходят со `StatusOptions.display = StatusDisplay.Notification` и заголовком `options.title` и показываются тостом на 10 с (`addStatusNotification` - `packages/ui/src/utils.ts`); сервер кладёт id задачи, статусов и подписи полей в `params.refs`, а тост `WorkflowErrorNotification` (`plugins/workflow-resources`) по коду ошибки собирает текст из своих строк и компонентов: статус с иконкой, номер задачи ссылкой, поле жирным.
- Серверный текст ошибки остаётся для статус-бара, когда тосты выключены.
- Повтор той же ошибки по той же задаче заменяет тост (`StatusOptions.group`).
- Ошибки настроек переходов остаются в статус-баре.

### Экспорт/импорт конфигурации workflow

`plugins/workflow/src/transfer/export.ts` сериализует статусы/переходы/правила в `WorkflowConfig` с токенами `$status:`/`$taskType:`/`$screen:`/`$attr:` (`resolver.ts`); `compatibility.ts` строит отчёт совместимости (матчинг статусов/атрибутов/ экранов); `import.ts` атомарно применяет конфиг к целевому проекту.

## Фичи

### Типы задач и статусы

#### Иерархия типов задач

`TaskType.allowedAsChildOf`/`allowAnyParent`/`isRootTaskType`; диаграмма `TaskTypesDiagram` в настройках проекта.

#### Редактор иерархии типа

Секция `TaskTypeHierarchySection`: цепочка чипов (предки только для чтения, редактируемая строка родителей с `x` и `+`, текущий тип, редактируемая строка дочерних типов: запись идёт в `allowedAsChildOf` дочернего типа; если `x` убирает последнего существующего родителя у не корневого дочернего типа, `MessageBox` сначала просит подтверждение), "Любой тип задачи" = `allowAnyParent` со всеми id; обход предков по уровням - `getAncestorLevels`, признак "тип нельзя создать нигде" (не корневой и нет существующего родителя, id удалённых типов в `allowedAsChildOf` не считаются) - `cannotBeCreated`, оба в `plugins/task-resources/src/hierarchy.ts`. - `plugins/task-resources/src/components/taskTypes/`.

#### Тип задачи по умолчанию

- `ProjectTypeDescriptor.defaultTaskType` (`{ descriptor, name }`, у трекера - `tracker.descriptors.Issue`, "Classic Issue"): `CreateProjectType` создаёт в новом типе проекта такой тип задачи через `createDefaultTaskType` с базовыми статусами дескриптора (`defaultStatusesFunc`), как кнопка "+" в настройках.
- Проект без типов задач показывает `BlankView` со ссылкой в настройки, `TaskKindSelector` - кнопку "Нет типов задач" с пояснением; ссылка `ProjectTypeSettingsLink` (task-resources) только для owner/maintainer. - `plugins/task/src/utils.ts`, `plugins/task-resources/src/components/projectTypes/CreateProjectType.svelte`, `plugins/tracker-resources/src/components/issues/IssuesView.svelte`.

#### 5 категорий статусов

UnStarted/ToDo/Active/Won/Lost, классические статусы Issue Backlog/ Todo/In Progress/Done/Canceled.

#### Смена типа задачи

Действие `ChangeTaskType`; освобождает переход workflow при смене `kind` (см. `server-plugins/workflow/src/middleware.ts`). История активности неизменяема: запись о создании и другие старые записи сохраняют тип на момент события, документ ищется по родительскому классу (см. `../memory/activity-history-class.md`).

#### Экспорт/импорт TaskType

Режимы `single`/`hierarchy` (`getConnectedTaskTypes` - связная компонента по `allowedAsChildOf`), дедуп enum'ов, ремап parent-child.

### Workflow

#### Уникальность статусов в типе проекта

- Ключ `statusKey` (атрибут + имя без пробелов по краям, без регистра); `resolveStatusReuse` решает при создании/переименовании: тот же ключ и категория - переиспользуется существующий `Status`, другая категория - отказ с именем и категорией существующего статуса (`CreateStatePopup`), иначе новый документ.
- Переименование обновляет `Status.name` на месте, если статус не определён моделью (id без `:`, у модельных вида `tracker:status:Backlog`) и другие типы проектов его не используют (`canRenameStatusInPlace`); иначе (`renameStatusByMerge`, `plugins/task-resources/src/statusRename.ts`) новый статус ставится сразу после старого в нужных типах задач (`placeStatusAfter`; `createStatusAtomic` с `exclude` не даёт старому статусу совпасть с собой по имени, поэтому смена одного регистра тоже даёт новый статус), и серверное слияние старого в новый (`statusMergeDomain`, область `taskTypes` - эти типы задач) переносит задачи, переходы и правила workflow, умолчание проекта и порядок; отказ слияния, которое ничего не записало, убирает размещение и созданный статус, конфликты показываются в панели статуса.
- Переиспользование существующего статуса при наличии задач блокируется (`getStatusNameBlock`): вместо него кнопка слияния.
- Тем же правилом пользуются `createProjectType`/`updateProjectType`/`createDefaultTaskType` и `CreateTaskType` (`createProjectTypeStates`); при конфликте категории импорт добавляет к имени название категории.
- Раздел "Statuses" в настройках типа проекта (`ProjectTypeStatusesSectionEditor.svelte`) строится на `StatesProjectEditor.svelte`: статусы по категориям, перетаскивание внутри категории пишет `ProjectType.statusOrder`, справа числа задач (один запрос, до 5000 задач) и воркфлоу, дубли одной категории с кнопкой "Объединить", кнопка "+" создаёт статус без типа задачи.
- Клик открывает `CreateStatePopup` в режиме типа проекта (без `taskType`): таблицы типов задач с числом задач и воркфлоу, где статус участвует (`StatusUsageTables.svelte`; числа задач Maintainer и выше берёт из запроса `statusUsageDomain` по всем пространствам, остальные - запросом на тип задач по видимым); при имени существующего статуса той же категории показывается подсказка о переиспользовании.
- Блок "Не привязаны к типам проектов" - `Status` того же атрибута, которого нет ни в `ProjectType.statuses`, ни в `TaskType.statuses` (`getOrphanStatuses`): добавить в тип проекта (при совпадении имени - объединение) или удалить (у статуса модели, id с `:`, кнопки удаления нет: его документ не удаляется).

#### Статус без типа задачи

- `ProjectStatus.taskType` необязателен: запись без него - статус типа проекта, который не использует ни один тип задач.
- `calculateStatuses` сохраняет такие записи и переводит в них статус, вышедший из последнего типа задач; `OnTaskTypeRemove` вычёркивает удалённый тип из `ProjectType.tasks` и пересчитывает `statuses` тем же `calculateStatuses`.
- Добавление такого статуса: `createStatusAtomic` без размещений (`projectOnly`).

#### Удаление статуса из типа проекта

- `deleteProjectTypeStatus` (`plugins/task-resources/src/statusDelete.ts`) решает по запросу `statusUsageDomain` (`getStatusUsage`; сервер считает все пространства, клиентский `findAll` не видит архивные и чужие): задачи типа проекта (сумма `byKind`), проекты с этим статусом по умолчанию (`projects`) и workflow, где он начальный, участвует в переходе или перечислен в правилах `SubtaskStatus`/`ParentStatus` (`loadWorkflowUsage`).
- Ничего нет - подтверждение и `removeStatusFromType` (запись типа проекта, `statusOrder`, типы задач; документ `Status` остаётся, если его определяет модель, его используют другие типы проектов или задач, workflow этого типа проекта, или есть задачи в любом пространстве); иначе `DeleteStateConfirmationPopup` (с числами сервера) просит статус-приёмник, затем `MergeStatusesConfirm` и серверное слияние `statusMergeDomain` с `transfer: true`: другая категория и источник вне типа проекта допустимы.
- Удаление статуса из одного типа задач (`CreateStatePopup`) - то же слияние с `taskTypes: [этот тип задач]`. - `plugins/task/src/statusMerge.ts`, `server-plugins/task/src/statusMergeOps.ts`.
- `plugins/task/src/utils.ts`, `plugins/task-resources/src/components/state/CreateStatePopup.svelte`.

#### Правила перехода

Validators (`FieldRequired`, `SubtaskStatus`, `ParentStatus`), Requests (`ScreenRequest`), Post-functions (`UpdateFieldValue`, `ClearFieldValue`) - единая форма `WorkflowRuleConfig`.

#### Статусы подзадач/родителя

`SubtaskStatus`/`ParentStatus` задают по каждому типу задачи разрешённые статусы и/или категории статусов (`TaskStatusesProps`: `statuses`, `categories`); тип без своей настройки, в том числе добавленный позже, проверяется по `defaultCategories`. - `plugins/workflow/src/validators.ts`, экспорт/импорт - `plugins/workflow/src/transfer/statusRules.ts`: строка ищется по имени типа задачи только в целевом типе проекта, статус - по имени среди статусов своего типа, отсутствующий заменяется категорией из `WorkflowConfig.ruleStatuses`, если у типа есть статусы этой категории, а строка типа задачи самого workflow следует сопоставлению статусов мастера, всё потерянное мастер импорта показывает предупреждениями.

#### 36 функций-трансформов значений

(строковые/числовые/даты/конверсии/агрегаты) для `UpdateFieldValue`.

#### Конфликты переходов

`findTransitionConflict`/`hasSelfTransition`/`getTransitionConflict`.

#### Каскадное удаление

- `OnWorkflowDelete`/`OnTaskTypeDelete`/`OnStatusDelete`/`OnScreenDelete`/`OnAttributeDelete`. - `server-plugins/workflow-resources/src/WorkflowTrigger.ts`.
- `OnAttributeDelete` снимает удалённый атрибут с экранов (`ScreenField`) и вычищает его из `props.fields` правил переходов, правило без полей удаляется (`stripAttributeFromRules` - `plugins/workflow/src/utils.ts`).
- Попап удаления атрибута заранее показывает затронутые экраны и workflow с переходами - `plugins/workflow-resources/src/components/AttributeUsages.svelte`, зарегистрирован как `setting.class.AttributeUsageProvider` в `models/workflow/src/index.ts`.

#### Создание workflow и его экранов перехода

- `CreateWorkflow.svelte` создаёт workflow (`createWorkflow(client, type._id, taskTypeId, name)`) для выбранного типа задачи в типе проекта; `ProjectTypeWorkflowsSectionEditor.svelte` - раздел настроек типа проекта со списком его workflow и импортом конфигурации (`ImportWorkflowPopup`).
- `ProjectTypeScreensSectionEditor.svelte` - раздел со списком "экранов" (класс `Screen`/`TScreen` - `models/workflow/src/types.ts`), создаются через `CreateScreen.svelte`: экран - форма валидации перед переходом, привязанная к типу задачи (`targetClass`) внутри типа проекта.
- UI над правил `WorkflowRuleConfig`/`ScreenRequest`. - `plugins/workflow-resources/src/components/{CreateWorkflow.svelte,ProjectTypeWorkflowsSectionEditor.svelte,ProjectTypeScreensSectionEditor.svelte}`.

#### Экспорт/импорт workflow-конфигурации

Токены `$status:`/`$taskType:`/`$screen:`/`$attr:`, `NameResolver` (минимальный ref при коллизии имён), отчёт совместимости статусов/атрибутов/экранов. - `plugins/workflow/src/transfer/` (`export.ts`, `import.ts`, `compatibility.ts`, `resolver.ts`, `statusRules.ts`, `validation.ts`, `utils.ts`, `types.ts`, `index.ts`).

### Проекты, компоненты и вехи

#### Управление проектом: создание, настройки, архивирование, удаление

Создание: `tracker.component.CreateProject`, `createComponent` спейса `projects`. Входы: `+`, `addSpaceLabel: tracker.string.CreateProject`, `NewIssueHeader`. Мастер `WizardDialog` из `@hcengineering/ui/kit`, позиция `top`.

| Шаг | Содержание |
| --- | --- |
| Основное | `SegmentedControl` "Пустой проект / На основе проекта", тип проекта, название, идентификатор, описание, иконка |
| Участники и доступ | Создатель всегда участник и владелец; его строка заблокирована |
| Задачи | Исполнитель и статус по умолчанию |
| Workflow | Привязка workflow к типам задач; без типов - `Callout`. Вместо ссылок - текст о месте настройки |
| Сводка | Только чтение: иконка, название, идентификатор, "Владельцы (N)", "Участники (N)" |

На основе проекта:

- `ProjectBasePopup`: kit `Menu` с поиском; активные проекты и архивные за переключателем "Показывать архивные".
- Тип проекта наследуется без изменения; описание и иконка подставляются.
- Дополнительный шаг "Что взять из основы": участники и роли, приватность, исполнитель и статус по умолчанию, workflow типов задач; шаблоны по одному, компоненты и этапы. Недоступное выключено с пояснением `Callout`.
- Выбор заполняет шаги участников, задач и workflow; сводка показывает основу.
- После создания проекта и миксинов `apply('copy-project-content')` копирует компоненты, этапы и выбранные шаблоны одной транзакцией. Ссылки шаблонов переводятся на копии или очищаются. При ошибке проект остаётся, `MessageBox` сообщает о нескопированном содержимом.
- Задачи, комментарии, история и метки не копируются. Логика: `projectCopyLogic.ts` (`settingsFromBase`, `keepAssignee`, `copyTemplate`, `translateRef`).

Мастер:

- "Назад"/"Далее" слева, "Создать" справа на каждом шаге (`earlySubmit`); невалидный шаг блокирует "Далее".
- Постоянная высота, внутренняя прокрутка. До создания состояние хранит мастер.
- Общие с настройками компоненты: `ProjectMembersTable` (`lockedAccount`), `ProjectAssigneeSelect`, `ProjectStatusSelect`, `ProjectWorkflowSelect`, `ProjectIconTile` (`components/projects/settings`). Роли типа сохраняются и у пустого проекта.

Настройки: `tracker.component.ProjectSettings`, special `projectSettingsId` = `project-settings` в `specials` спейса `projects`. Адрес: `.../tracker/<проект>/project-settings?section=<раздел>`. Из дерева скрыты (`ProjectSpacePresenter`).

- Вход: шестерёнка `IssuesView` по `canEditSpace`; действие `EditProject` по `view.function.CanEditSpace`, `editProject` -> `openProjectSettings`.
- Выход: "К проекту" или крестик (`closeProjectSettings`). Без права редактирования адрес перенаправляет на задачи проекта.
- Сохранение сразу, без кнопки "Сохранить". Загрузка по id с `showArchived: true` позволяет настраивать архивные проекты. Архивирование открытого активного проекта возвращает к списку.

| Раздел (`components/projects/settings`) | Содержание |
| --- | --- |
| Основное | Тип только для чтения со ссылкой в настройки типа; название; идентификатор только для чтения с подсказкой "следующий номер"; описание, иконка |
| Участники и доступ | Приватность, владельцы, участники, роли типа; `isAccessValid` отклоняет недопустимое изменение с подсказкой |
| Задачи | Исполнитель и статус по умолчанию, ссылка на шаблоны |
| Статусы и workflow | Статусы типа проекта по категориям только для чтения; ссылки в тип проекта и Workflow; привязка workflow к типам задач через `ProjectWorkflow` |
| Архив | `deleteProject` из `projectActions.ts` |

- Поля: `SettingRow kind="column"`, `SelectButton field`, `TextInput`, `TextArea`, `Toggle`; архивная плашка - `Callout`. Раздел открывает попапы исполнителя, статуса, ролей и workflow.
- Owner/maintainer видят "Настроить workflow" (`workflows`, `openProjectType(type, 'workflows')`) и открытие редактора выбранного workflow (`openProjectTypeWorkflow`).
- Оба действия удаления используют `actionImpl.DeleteProject`, но разные `query`/`visibilityTester`: `DeleteProject` - архивирование (`workbench.string.Archive`, `archived: false`, `CanArchiveSpace`); `DeleteProjectClean` - удаление архивного (`workbench.string.Delete`, `archived: true`, `CanDeleteSpace`).

Файлы: `models/tracker/src/actions.ts`, `models/tracker/src/index.ts`, `plugins/tracker-resources/src/{projectSettings.ts,projectSettingsLogic.ts,projectCopyLogic.ts,projectActions.ts}`, `components/projects/{CreateProject,ProjectBasePopup,ProjectBaseItem}.svelte`.

#### Дефолтный проект

`tracker.project.DefaultProject` (`identifier: 'TSK'`, `autoJoin: true`) создаётся миграцией `create-defaults`, только если не удалён пользователем. - `models/tracker/src/migration.ts`.

#### Запрет создания проектов

Permission `ForbidCreateProject` - `forbid`-правило на `TxCreateDoc`/`Project` уровня workspace.

#### Компоненты

Агрегация/группировка по названию компонента без учёта регистра (`label.toLowerCase().trim()`; одноимённые компоненты разных проектов объединяются в одну группу), `lead` в агрегации не используется. - `plugins/tracker-resources/src/component.ts` (`CreateComponentAggregationManager`, `GrouppingComponentManager`), `models/tracker/src/index.ts`.

#### Вехи

`SetMilestone` (`S+P`), `DeleteMilestone` (`Meta+Backspace`, с переносом задач).

## Пользовательская документация

| Фича | ru | en | Статус | Сверено | Расхождение |
| --- | --- | --- | --- | --- | --- |
| Иерархия типов задач | - | - | plan | - | |
| Редактор иерархии типа | - | - | plan | - | |
| Тип задачи по умолчанию | advanced-settings/task-types | advanced-settings/task-types | ok | 0.8.61 | |
| 5 категорий статусов | advanced-settings/task-types, workflow/create-statuses | advanced-settings/task-types | ok | 0.8.61 | |
| Смена типа задачи | - | - | plan | - | |
| Экспорт/импорт TaskType | - | - | plan | - | |
| Уникальность статусов в типе проекта | - | - | internal | - | |
| Статус без типа задачи | - | - | internal | - | |
| Удаление статуса из типа проекта | workflow/create-statuses | - | partial | 0.8.60 | описано только простое удаление (иконки удалить/копировать), не показан сценарий с проверкой использования и слиянием статусов |
| Правила перехода | workflow/create-rules-transitions | - | no-en | 0.8.60 | |
| Статусы подзадач/родителя | workflow/create-rules-transitions | - | partial | 0.8.60 | не упомянут выбор по категории статуса, только по конкретному статусу для каждого типа задачи |
| 36 функций-трансформов значений | - | - | plan | - | |
| Конфликты переходов | workflow/create-rules-transitions | - | no-en | 0.8.60 | |
| Каскадное удаление | - | - | plan | - | |
| Экспорт/импорт workflow-конфигурации | workflow/create-rules-transitions | - | partial | 0.8.60 | импорт упомянут (раздел "Воркфлоу" типа проекта, из файла или буфера обмена), сам процесс (выбор файла, проверка совместимости) не раскрыт |
| Создание workflow и его экранов перехода | workflow/create-workflow, workflow/create-screens, workflow/add-workflow, workflow/defining-workflow | - | no-en | 0.8.61 | |
| Управление проектом: создание, настройки, архивирование, удаление | task-tracking/creating-projects | task-tracking/creating-projects | stale | 0.8.60 | редактирование проекта переехало из окна на страницу настроек с разделами (вход шестерёнкой из шапки), не описаны архивирование и удаление проекта; создание проекта стало мастером из пяти шагов (основное, участники и доступ, задачи, workflow, сводка); не описано создание проекта на основе другого (выбор основы, шаг «Что взять из основы») |
| Дефолтный проект | - | - | plan | - | |
| Запрет создания проектов | - | - | plan | - | |
| Компоненты | task-tracking/components | task-tracking/components | partial | 0.8.60 | не описано объединение одноимённых компонентов разных проектов при группировке/фильтре (агрегация идёт по названию компонента без учёта регистра, а не по руководителю) |
| Вехи | task-tracking/milestones | task-tracking/milestones | ok | 0.8.60 | |

## Куда смотреть, если нужно...

- Добавить/поменять правило workflow (validator/request/post-function) -> `plugins/workflow/src/schema/` + сервер `server-plugins/workflow/src/middleware.ts`.
- Добавить функцию-трансформ значения для `UpdateFieldValue` -> `models/workflow/src/functions.ts`.
- Какие поля можно выбрать источником значения `UpdateFieldValue` -> `isAttributeCompatible` / `SOURCE_ONLY_FIELDS` в `plugins/workflow-resources/src/components/postFunctions/editors/update-field/utils.ts`; приведение значения к типу поля на сервере -> `resolveValue` в `server-plugins/workflow-resources/src/post-functions/evaluator.ts`.
- Изменить статусы по умолчанию классического Issue -> `classicIssueTaskStatuses` (`models/tracker/src/index.ts`) + `defineSpaceType`.
- Изменить экспорт/импорт конфигурации workflow -> `plugins/workflow/src/transfer/` (`export.ts`/`import.ts`/`compatibility.ts`).
- Добавить в правило новое место, где хранится ссылка на атрибут -> `stripAttributeFromRules` (`plugins/workflow/src/utils.ts`): по ней триггер `OnAttributeDelete` чистит правила, а попап удаления атрибута ищет затронутые workflow.
- Изменить иерархию/наследование типов задач -> `models/task/src/index.ts` (`TTaskType`) + `plugins/task/src/transfer/` (перенос между проектами).

## Настройки и конфигурация

- Permission `tracker.permission.ForbidCreateProject` - запрет создания проектов на уровне workspace (`models/tracker/src/permissions.ts`).
- Мод. `core.mixin.TxAccessLevel: Maintainer` на `Workflow`/`WorkflowTransition` - редактировать workflow может только Maintainer+ (`models/workflow/src/index.ts`).

## Тесты

- Workflow: `plugins/workflow/src/__tests__/{utils,validators}.test.ts` + `__tests__/transfer/{compatibility,export,import,resolver,utils}.test.ts`; `plugins/task/src/__tests__/transfer/{attributes,export,hierarchy,import}.test.ts`; `server-plugins/workflow/src/__tests__/middleware.test.ts`.
- Sanity (Playwright): `tests/sanity/tests/tracker/` (`tracker.spec.ts`, `kanban.spec.ts`, `filter.spec.ts`, `subissues.spec.ts`, `template.spec.ts`, `milestone.spec.ts`, `related-issues.spec.ts`, `relations.spec.ts`, `labels.spec.ts`, `component.spec.ts`, `projects.spec.ts`, и др.), page-объекты в `tests/sanity/tests/model/tracker/`.

## Связанные документы

- [../workflow.md](../workflow.md) - покрытие workflow тестами (Jest, Playwright, ручные сценарии).
- [../memory/workflow-tests.md](../memory/workflow-tests.md) - заметки по тестам workflow.
- [../status-order.md](../status-order.md) - порядок статусов и слияние порядков типов задач.

- [../memory/activity-history-class.md](../memory/activity-history-class.md) - класс записи активности неизменяем: смена типа задачи не переписывает историю, документ ищется по родительскому классу.
