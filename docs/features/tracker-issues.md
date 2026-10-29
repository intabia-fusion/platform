# Трекер: задачи, время и представления

> Сверено с кодом: коммит 39ae47eb6f, 2026-09-23.

Общая архитектура и пакеты: [tracker.md](tracker.md).

## Модель данных

| Класс | Смысл | Файл |
| --- | --- | --- |
| `TIssue` | Задача, `extends TTask`; `title`/`description` (FullText), `status`, `priority`, `assignee`, `component`, `milestone`, `estimation`/`remainingTime`/`reportedTime`, `subIssues`/`parents`/`childInfo` (денормализованное дерево), `blockedBy`/`relations`, `labels: Collection<TagReference>`, `template?`, `todos` (hidden, коллекция `ToDo`) | `models/tracker/src/types.ts` |
| `TTask` (база) | `status`, `kind` (ReadOnly, ссылка на `TaskType`), `number`, `assignee`, `dueDate`, `rank` (lexorank), `labels`, `comments`, `attachments`, `isDone`, `identifier` | `models/task/src/index.ts` |
| `TIssueTemplate` | Шаблон задачи: поля `IssueTemplateData` + `children: IssueTemplateChild[]` (дерево) | `models/tracker/src/types.ts` |
| `TTimeSpendReport` | Запись времени: `attachedTo`, `employee`, `date`, `value`, `description`, `workslot?: Ref<WorkSlot>` (hidden, зеркалит слот планировщика) | `models/tracker/src/types.ts` |
| `TRelatedIssueTarget` | Маппинг проект-проект для связей issues: `rule: RelatedClassRule \| RelatedSpaceRule` | `models/tracker/src/types.ts` |
| `TTagCategory`/`TTagElement`/`TTagReference` | Категория меток / метка / привязка метки к документу (используется как `Issue.labels`) | `models/tags/src/index.ts` |

`IssuePriority` (`NoPriority/Urgent/High/Medium/Low`), `TimeReportDayType` (`CurrentWorkDay/PreviousWorkDay`), `IssuesGrouping`/`IssuesOrdering`

## Как работает

### Создание задачи

- Диалог `CreateIssue.svelte` (`tracker.component.CreateIssue`) собирает `IssueDraft` (`plugins/tracker/src/index.ts`, включает `assistConversation?: Ref<Doc>` - возврат к драфту восстанавливает диалог с AI-ассистентом).
- Общий хелпер `tracker.function.CreateIssue(client, project, NewIssue) -> CreatedIssue` (`plugins/tracker/src/index.ts`) создаёт задачи из других плагинов без зависимости от `tracker-resources`.

### Учёт времени: TimeSpendReport -> Issue.reportedTime

`OnIssueUpdate` (`server-plugins/tracker-resources/src/index.ts`) ловит CUD на `TimeSpendReport`, `doTimeReportUpdate` инкрементально пересчитывает `reportedTime`; `remainingTime` и суммарная оценка дерева считаются через `reduceChildInfoTree` (`plugins/tracker/src/index.ts`, bottom-up по `childInfo`, оценка родителя = max(своя, сумма по дереву), legacy flat-фоллбэк для старых данных без `parentId`).

### ToDo/WorkSlot <-> TimeSpendReport (FUSIO-38)

- Назначение исполнителя или перевод Issue в Active/ToDo создаёт `ToDo` планировщика (`createIssueHandler`/`getCreateToDoTx`, `server-plugins/time-resources/src/index.ts`); обратной связи "закрыл ToDo -> сдвинулся статус Issue" нет.
- `OnWorkSlotCreate/Update/Remove` создают/пересчитывают/удаляют `TimeSpendReport` 1:1 через поле `TimeSpendReport.workslot`.
- Подробности переезда/переназначения - `docs/memory/planner-todo-issue-decoupling.md` и `../features/planner-calendar.md`.

### Kanban: группировка и drag/drop

- `KanbanView.svelte` (`plugins/tracker-resources/src/components/issues/KanbanView.svelte`) рендерит `IssueKanban` viewlet (`tracker.viewlet.IssueKanban` - `models/tracker/src/viewlets.ts`); `swimLaneBy` (none/assignee/priority/component/milestone/status/attachedTo/space) и `compactMode` - опции `issuesOptions(true)` (`models/tracker/src/viewlets.ts`); перетаскивание меняет `rank` (lexorank) карточки.
- Порядок дорожек: пустая дорожка первой, дальше функция сортировки поля через `sortSwimLaneValues` (`plugins/tracker-resources/src/utils.ts`: статусы, приоритеты, вехи, исполнитель по имени - `personSort` в `plugins/contact-resources/src/utils.ts`), без неё - `orderSwimLanes` (`plugins/tracker-resources/src/swimLanes.ts`) по метке компонента, имени сотрудника или id.

#### Загрузка карточек.

Группы строятся по запросам с проекцией (`docsQuery`, `docsQuerySlow` - `KanbanView.svelte`), а полные карточки грузит один живой запрос на дорожку (без дорожек - на колонку) только за теми карточками, которые ячейка показывает в пределах лимита, дальше - кнопка "Показать больше". Лимиты (`SWIM_CELL_LIMIT`, `COLUMN_LIMIT`) и состав id запроса задаёт `collectVisibleGroups` (`packages/kanban/src/visibleGroups.ts`), сами запросы ведёт `syncLaneQueries` (`packages/kanban/src/components/Kanban.svelte`). Дорожка шлёт запрос, когда подходит к области просмотра (`lazyObserver`, `seenLanes`); свёрнутая колонка не грузит ничего.

#### Сворачивание колонок.

Кнопка в заголовке ("Свернуть колонку") убирает колонку в стопку в конце доски (`toggleColumn` - `Kanban.svelte`), клик по заголовку свёрнутой колонки возвращает её. Карточку можно бросить на колонку в стопке, колонка остаётся свёрнутой.

#### Объединение колонок.

Несколько статусов объединяются в одну колонку кнопкой "Объединить колонки" в заголовке: во всплывающем списке клик добавляет колонку или убирает (`showMergePopup` - `KanbanView.svelte`, `buildColumns`/`toggleMerge` - `packages/kanban/src/board.ts`). Настройка влияет только на вид. Объединённая колонка не принимает карточки, но карточку из неё перетащить можно (`isBlocked`, `cardState` - `Kanban.svelte`). В заголовке видны два статуса, остальные - `+N` (`MERGED_NAMES` - `KanbanView.svelte`).

#### Меню "..." в шапке вида задач

(`menuItems` - `IssuesView.svelte`). "Объединить колонки по категориям" (при группировке по статусу) собирает статусы одной категории в одну колонку; пункт виден, только если на доске есть категория с несколькими статусами, которые ещё не объединены так же (`canMergeByGroup` - `Kanban.svelte`). "Сбросить объединение колонок" (когда есть объединённые колонки) снимает объединение. Раскрытый список статусов в заголовке объединённой колонки растёт до `min(20rem, 40vh)` и дальше прокручивается, не заходя на карточки. Доска отдаёт эти действия через `columnControlStore` (`packages/kanban/src/swimlane.ts`).

#### Хранение.

Свёрнутые и объединённые колонки лежат в `localStorage` на viewlet и группировку (`kanban-column-collapsed-*`, `kanban-column-merged-*`; `loadCollapsed`/`loadMerged` - `packages/kanban/src/board.ts`). Viewlet `tracker.viewlet.IssueKanban` - один документ модели на все проекты, поэтому настройка общая для проектов.

## Фичи

### Задачи и связи

#### Дерево подзадач

`subIssues`/`parents`/`childInfo` денормализованы инкрементальными `$push`/`$pull`, без полного пересчёта дерева при каждом изменении.

#### Связи между issues

`blockedBy`/`relations` (Blocks/Blocked by/Related to), кросс-проектная настройка целей через `RelatedIssueTarget` и действие `EditRelatedTargets`.

#### AI-ассистент при создании

Расширения `CreateIssueAssist`/`CreateIssueHeaderActions` в шапке диалога создания; `IssueDraft.assistConversation` хранит корень диалога.

#### Шаблоны задач

`IssueTemplate` с деревом `children: IssueTemplateChild[]`; создание задачи из шаблона перезаписывает поля значениями шаблона.

#### Копирование ID, названия, ссылки и описания задачи

Подменю "Копировать" действий над задачей: `CopyIssueId` (`textProvider: tracker.function.GetIssueId`), `CopyIssueTitle` (`GetIssueTitle`), `CopyIssueLink` (label `tracker.string.CopyIssueUrl`, оверрайдит `view.action.CopyLink`), `CopyIssueMarkdown` (копирует поле `description` в markdown через общий `view.actionImpl.CopyDocumentMarkdown`); для выборки нескольких задач отдельное действие `CopyAsMarkdownTable` (`view.actionImpl.CopyAsMarkdownTable`, `input: 'selection'`).

#### Шапка и меню открытой задачи

- `watchTitle` сокращает заголовок при нехватке места: сворачивает цепочку родителей, затем скрывает проект и всю цепочку.
- Шапка: ИИ, реакции, ссылка, "В сайдбар" (`view.icon.Sidebar`, та же контурная иконка в меню, документе и `EditDoc`), "Ещё", панель "Свойства".
- `mobileAdaptive`: только номер, "Ещё", свойства. Расширения шапки скрыты; действия `header` открывают меню (`withHeaderActions` у `showMenu`).
- Общая раскладка панели, списка и канбана: `view.mixin.ActionMenu` на `tracker.class.Issue`, `defineIssueMenu` в models/tracker/src/actions.ts. View `Menu` берёт её по классу, если вызов не задаёт `layout`.

| Группа | Действия |
| --- | --- |
| Открытие | Открыть, новая вкладка, боковая панель; в панели "Открыть" исключено |
| Работа | "Изменить", время |
| Структура | Подзадача, "Родительская задача", "Связи" с "Новой связанной задачей" |
| Поделиться | "Копировать", публичная ссылка, печать |
| Настройки типа задачи | Ссылка `link` + `opensPage` в ui `Menu`; cmd-клик открывает новую вкладку |
| `remove` | Перенос в проект, дубль, затем удаление |

- Подменю раскрывают "Изменить", "Родительская задача", "Связи", "Копировать". Неописанные в `layout` действия идут после перечисленных в своей группе; группы разделены.
- Ширина текста: постоянная кнопка справа от первой строки (`maxWidthToggle="gutter"` у `Panel`), без сдвига при смене режима.
- Атрибуты: все примеси класса, без переключателя дополнительных свойств. Кнопки боковой панели отделены разделителем ui `Panel`.

Файлы: plugins/tracker-resources/src/components/issues/edit/EditIssue.svelte, `ControlPanel.svelte`; plugins/view-resources/src/components/Menu.svelte; plugins/tracker-resources/src/components/RelationsPopup.svelte; packages/panel/src/components/MaxWidthToggle.svelte; models/tracker/src/actions.ts.

### Учёт времени

#### Оценка/факт/остаток

`estimation` (ручная), `reportedTime` (авто, триггер), `remainingTime` (readOnly, `reduceChildInfoTree`).

#### Разбивка "потрачено/запланировано"

`splitReportedTime` - конец слота-отчёта восстанавливается как `date + value`, идущий слот делится пропорционально; для самих слотов планировщика есть аналог `splitEventsDuration` в `plugins/time-resources/src/utils.ts`.

#### Диалог отчёта

`TimeSpendReportPopup` (действие `T`), быстрые кнопки часов, выбор сотрудника, `TimeReportDayType` (Current/Previous Work Day). - `plugins/tracker-resources/src/components/issues/timereport/`.

#### UI оценки

`EstimationEditor`/`EstimationPopup`/`EstimationStatsPresenter`/ `SubIssuesEstimations`/`TimeSpendReportList`/`ReportedTimeEditor` - круговой прогресс, список отчётов по саб-issues, календарь "люди x дни".

#### Формат длительности

`parseDuration`/`formatDuration`/`formatDurationCompact` (алиасы единиц по языку m/h/d/w), `durationFormatHint`; ноль показывается как `0h`.

### Представления списка и канбана

#### Навигатор "Мои задачи" / "Все задачи"

Два специала верхнего уровня трекера: "Мои задачи" (`tracker.string.MyIssues`, `tracker.component.MyIssues`) с вкладками `assigned`/`active`/`backlog`/`created`/`subscribed`, и "Все задачи" (`tracker.string.AllIssues`, `tracker.component.Issues`) с вкладками `all`/`active`/`backlog`. - `models/tracker/src/index.ts` (специалы `opt.myIssuesId`/`opt.allIssuesId`, их `componentProps.config`).

#### Viewlet'ы трекера

`IssueList` (список с priority/identifier/status/kind/title/labels/ Milestone/Component/dueDate/reportedTime/estimation/assignee), `IssueKanban`, `SubIssues`/`ParentIssues`, `MilestoneIssuesList`, `ComponentIssuesList`.

#### Группировка/сортировка

`issuesOptions(kanban)`: groupBy status/kind/assignee/priority/space/ component/milestone/attachedTo/createdBy/modifiedBy/estimation/remainingTime/reportedTime; для kanban - `swimLaneBy` (8 значений) + `compactMode`.

#### Порядок групп по статусу

`issueStatusSort` (`plugins/tracker-resources/src/utils.ts`): категория (`listIssueStatusOrder` для списка, `listIssueKanbanStatusOrder` для kanban) -> порядок типа проекта: `ProjectType.statusOrder`, если задан, затем слитый порядок типов задач (`mergeStatusOrder`: порядок `TaskType.statuses` каждого типа сохраняется, общий статус идёт после всех своих предшественников; типы в порядке экрана настроек, по имени, `getOrderedTaskTypes`; ранги собирает `getProjectStatusRank`) -> имя; компаратор `statusOrderComparator` - `plugins/task/src/utils.ts`.

#### Опции показа

`shouldShowSubIssues`, `shouldShowAll`, `hideArchived`.

#### Пустой список задач

`IssuesView` передаёт `emptyState` (`BlankViewProps`) через `ViewletContentView`; `ListView` и `KanbanView` трекера показывают `BlankView`, когда документы загружены и групп нет (`empty` из `ListCategories`/`List`): "No issues yet" или "Nothing found" при фильтре/поиске. - `plugins/tracker-resources/src/components/issues/IssuesView.svelte`, `plugins/view-resources/src/components/list/ListView.svelte`, `plugins/tracker-resources/src/components/issues/KanbanView.svelte`.

#### Поиск в списке задач

- Строка поиска `IssuesView` ищет только по заголовку, идентификатору и описанию: `$searchIn: ['title', 'identifier', 'content']`, где описание - `contentField` поисковика `Issue` (`models/server-tracker/src/index.ts`).
- Метки, комментарии и вложения не ищутся, для них есть фильтры.
- Поиск отбирает задачи с сохранением сортировки вида.
- Откат - убрать `$searchIn` в `IssuesView`. - `plugins/tracker-resources/src/components/issues/IssuesView.svelte`, `foundations/server/packages/elastic/src/adapter.ts` (`searchTargetFields`).

#### Фильтр по статусу

- `StatusFilter` внутри проекта предлагает статусы всех типов задач его типа проекта (`getProjectType`), без проекта - типов проектов, где пользователь участник.
- Попап статуса задачи показывает только статусы её типа, доступные по workflow, поэтому списки не совпадают. - `plugins/task-resources/src/components/StatusFilter.svelte`, `plugins/task-resources/src/index.ts`.

#### Сохранённые представления и их порядок

- «Save as» создаёт `FilteredView` (`attachedTo` - alias приложения); блок «Фильтрованные отображения» показывает только те, где `users` содержит текущего пользователя.
- Личный порядок хранит `FilteredViewPreference` (`attachedTo` - alias, `views` - массив id): `DOMAIN_PREFERENCE` приватный, перетаскивание не меняет чужой список.
- Перетаскивание - `SortableList`, новые представления встают в конец. - `plugins/view-resources/src/components/filter/FilterSave.svelte`, `plugins/workbench-resources/src/components/SavedView.svelte`, `plugins/view-resources/src/savedViews.ts`, `models/view/src/index.ts`.

#### Фильтр по типу задачи

- Строки попапа рисует `TaskTypeFilterItem`: сначала имя типа задачи, затем серым (`--theme-dark-color`) через `·` имя типа проекта иконкой - вместо общей подписи "тип проекта / тип задачи".
- Префикс - `ProjectType.name` (`TaskType.parent`), а не имя проекта: один тип проекта обслуживает несколько проектов.
- Попап шире прочих объектных фильтров (`.selectPopup.max-width-24`).
- Компонент попапа подставлен через `view.mixin.AttributeFilter` на `task.class.TaskType`, поэтому так выглядят все фильтры по `Ref<TaskType>`; общий `TaskTypePresenter` и подпись выбранных значений не меняются. - `models/task/src/index.ts`, `plugins/task-resources/src/components/taskTypes/TaskTypeFilter.svelte`, `TaskTypeFilterItem.svelte`.

#### Пустые группы/колонки статусов

`showEmptyGroups` передаёт `space` вида в `GetAllValuesFunc`; `getAllStates` берёт статусы только типов задач этого типа проекта и пересчитывает группы при изменении этих типов задач (`watchTaskTypes`; пересчёт ждёт, пока `taskTypeStore`/`statusStore` получат то же изменение, иначе показывалось предыдущее состояние). - `plugins/view-resources/src/viewOptions.ts`, `plugins/task-resources/src/index.ts`.

### Метки

#### Раздел "Метки" в навигаторе

Специал `labelsId` (`tracker.component.LabelsView`) оборачивает `tags.component.TagsView` и показывает все `TagElement` класса `Issue` по всему workspace, с созданием новой метки (`createItemLabel: tracker.string.AddLabel`); клик по метке (`onTag`) переходит в "Все задачи" и ставит фильтр по этой метке (`setFilterTag`). - `models/tracker/src/index.ts` (специал `opt.labelsId`), `plugins/tracker-resources/src/components/LabelsView.svelte`.

## Пользовательская документация

| Фича | ru | en | Статус | Сверено | Расхождение |
| --- | --- | --- | --- | --- | --- |
| Дерево подзадач | task-tracking/creating-issues | task-tracking/creating-issues | partial | 0.8.60 | не описано создание подзадачи из уже существующей (действие «Добавить подзадачу»), только указание родителя при создании |
| Связи между issues | task-tracking/related-issues, people-contacts/connecting-tasks | task-tracking/related-issues, people-contacts/connecting-tasks | ok | 0.8.60 | |
| AI-ассистент при создании | - | - | plan | - | |
| Шаблоны задач | task-tracking/issue-templates | task-tracking/issue-templates | ok | 0.8.60 | |
| Копирование ID, названия, ссылки и описания задачи | - | - | plan | - | |
| Шапка и меню открытой задачи | - | - | plan | - | |
| Оценка/факт/остаток | task-tracking/creating-issues | task-tracking/creating-issues | partial | 0.8.60 | описана только «Оценка» (estimation), факт (reportedTime) и остаток (remainingTime) не упомянуты |
| Разбивка "потрачено/запланировано" | task-tracking/time-reports | - | partial | 0.8.60 | механика splitReportedTime (разбивка часов слота-отчёта) на странице не описана |
| Диалог отчёта | task-tracking/time-reports, task-tracking/task-management | - | partial | 0.8.60 | не описан выбор сотрудника и быстрые кнопки часов (например «До 8ч») в форме списания |
| UI оценки | task-tracking/time-reports | - | partial | 0.8.60 | страница описывает только список отчётов (TimeSpendReportList, вид «Отчеты по времени») и только период «Неделя» (без «2 недели»/«Месяц»); EstimationEditor/EstimationPopup/SubIssuesEstimations (оценка в карточке задачи) не описаны |
| Формат длительности | task-tracking/time-reports | - | partial | 0.8.60 | показан только пример «4ч», без недель/дней/минут и составных значений вида «2ч 30м» |
| Навигатор "Мои задачи" / "Все задачи" | task-tracking/issue-collaborators | task-tracking/issue-collaborators | partial | 0.8.60 | описана только вкладка «Отслеживаемые» в «Моих задачах»; остальные вкладки и отдельный раздел «Все задачи» с его вкладками не раскрыты |
| Viewlet'ы трекера | task-tracking/viewing-issues | task-tracking/viewing-issues | stale | 0.8.60 | канбан теперь работает и по доске (колонки, дорожки, цвета рамки), в описании - обычный канбан; карточка канбана в виде дизайн-кита (атрибуты пилюлями, строка «Оценка» внизу, без счётчика комментариев родителя); описаны только список и канбан, остальные viewlet'ы (подзадачи, этапы, компоненты, отчёты по времени) не упомянуты; в шапке задач проекта вместо подписи «Задачи» - доски, добавленные пользователем на панель, и меню всех досок проекта (добавить/убрать с панели, создать, настройки); доска открывается на месте вида задач проекта, выбор вида в переключателе закрывает её |
| Группировка/сортировка | task-tracking/viewing-issues | task-tracking/viewing-issues | ok | 0.8.60 | |
| Порядок групп по статусу | - | - | plan | - | |
| Опции показа | task-tracking/viewing-issues | task-tracking/viewing-issues | stale | 0.8.60 | вместо переключателя «Компактно» - «Плотность карточек» из 4 вариантов |
| Пустой список задач | - | - | plan | - | |
| Поиск в списке задач | task-tracking/viewing-issues | task-tracking/viewing-issues | partial | 0.8.60 | не указано, что поиск ищет только по заголовку/идентификатору/описанию, а не по меткам и комментариям |
| Фильтр по статусу | task-tracking/viewing-issues | task-tracking/viewing-issues | partial | 0.8.60 | не описано, что список статусов в фильтре (все статусы типа проекта) может отличаться от списка в попапе статуса конкретной задачи |
| Сохранённые представления и их порядок | - | - | plan | - | |
| Пустые группы/колонки статусов | - | - | plan | - | |
| Раздел "Метки" в навигаторе | task-tracking/labels | task-tracking/labels | ok | 0.8.60 | |

## Куда смотреть, если нужно...

- Добавить поле в Issue -> `models/tracker/src/types.ts` (`TIssue`) + интерфейс `Issue` в `plugins/tracker/src/index.ts`.
- Изменить пересчёт `reportedTime`/`remainingTime` -> `server-plugins/tracker-resources/src/index.ts` (`OnIssueUpdate`, `doTimeReportUpdate`) и `reduceChildInfoTree` (`plugins/tracker/src/index.ts`).
- Поменять разбивку "потрачено/запланировано" -> `splitReportedTime` (`plugins/tracker/src/index.ts`).
- Добавить действие над Issue (хоткей/попап) -> `models/tracker/src/actions.ts`.
- Изменить viewlet/колонки списка/канбана -> `models/tracker/src/viewlets.ts`.
- Поменять группировку/сортировку/swim lanes -> `issuesOptions` (`models/tracker/src/viewlets.ts`).
- Поменять, по чему ищет строка поиска задач -> `$searchIn` в `IssuesView.svelte`; поля индекса за каждым значением -> `searchTargetFields` (`foundations/server/packages/elastic/src/adapter.ts`), основной текст класса -> `contentField` его `SearchPresenter`.
- Поправить формат длительности (`2h 30m`) -> `plugins/tracker/src/duration.ts`.

## Настройки

- `Project.defaultTimeReportDay` (`CurrentWorkDay`/`PreviousWorkDay`) - настройка проекта, влияет на диалог `TimeSpendReportPopup`.

## Тесты

- Unit (jest): `plugins/tracker/src/__tests__/duration.test.ts`, `childInfoTree.test.ts`, `splitReportedTime.test.ts`; `plugins/tracker-resources/src/__tests__/taskTypeChange.test.ts`; `server-plugins/tracker-resources/src/__tests__/trigger.test.ts`; `server-plugins/time-resources/src/__tests__/{reassign,workslotReport,statusDecoupling}.test.ts`.
- Sanity (Playwright): `tests/sanity/tests/tracker/` (`tracker.spec.ts`, `kanban.spec.ts`, `filter.spec.ts`, `subissues.spec.ts`, `template.spec.ts`, `milestone.spec.ts`, `related-issues.spec.ts`, `relations.spec.ts`, `labels.spec.ts`, `component.spec.ts`, `projects.spec.ts`, и др.), page-объекты в `tests/sanity/tests/model/tracker/`.

## Связанные документы

- [tracker-boards.md](tracker-boards.md) - доски поверх канбана.
- [../time-tracking.md](../time-tracking.md) - модель и UI учёта времени, агрегация childInfo.
- [../time-tracking-examples.md](../time-tracking-examples.md) - кейсы агрегации дерева оценок.
- [../status-order.md](../status-order.md) - порядок групп статусов.
- [../memory/fulltext_search_fields.md](../memory/fulltext_search_fields.md) - индекс, `$searchIn`, `$filter`.
- [../memory/planner-todo-issue-decoupling.md](../memory/planner-todo-issue-decoupling.md) - FUSIO-38, ToDo/Issue, переназначение исполнителя, `TimeSpendReport.workslot`.
- [planner-calendar.md](planner-calendar.md) - ToDo/WorkSlot, Team Planner, календарь, источник отчётов времени.
