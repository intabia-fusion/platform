# Трекер

> Сверено с кодом: коммит 39ae47eb6f, 2026-09-23.

Проекты (`Project`) объединяют задачи (`Issue`), компоненты (`Component`) и вехи (`Milestone`). `task` задаёт типы задач и статусы, `workflow` проверяет переходы, `view` строит представления, `tags` связывает метки с задачами.


## Подробные карты

| Документ | Содержание |
| --- | --- |
| [Задачи, время и представления](tracker-issues.md) | Issue, подзадачи, связи, шаблоны, отчёты времени, списки, канбан, поиск, фильтры и метки |
| [Доски задач](tracker-boards.md) | Board, колонки, дорожки, карточки, настройки, доступ, навигация и создание |
| [Проекты, типы задач и workflow](tracker-projects-workflow.md) | Создание и настройки проектов, компоненты, вехи, TaskType, статусы, правила переходов и импорт |

## Общая архитектура

- `Issue` наследует `Task`; `Project` определяет пространство задач и значения по умолчанию.
- Модели регистрируют классы, представления и действия; resources-пакеты реализуют UI, серверные пакеты проверяют транзакции и пересчитывают данные.
- `WorkflowMiddleware` проверяет переходы статуса; `BoardMiddleware` после него проверяет запись досок.
- `OnIssueUpdate` обновляет учёт времени, `reduceChildInfoTree` агрегирует дерево подзадач.
- Назначение исполнителя или Active/ToDo у Issue создаёт `ToDo`; `WorkSlot` зеркалится в `TimeSpendReport`. Закрытие `ToDo` не меняет статус Issue.

## Где код

| Пакет | Путь | Роль |
| --- | --- | --- |
| model-tracker | `models/tracker/src` | Модель Issue/Project/Component/Milestone/IssueTemplate/TimeSpendReport, миграции, actions, viewlets, permissions |
| tracker | `plugins/tracker/src` | Типы/enum'ы, shared-хелпер `CreateIssue`, `duration.ts`, `splitReportedTime`/`reduceChildInfoTree` |
| tracker-resources | `plugins/tracker-resources/src` | UI: список/канбан задач, диалоги создания/редактирования, time tracking |
| tracker-assets | `plugins/tracker-assets/lang` | Локализация |
| server-tracker | `server-plugins/tracker/src` | Типы серверного плагина (презентеры, link-провайдеры), `BoardMiddleware` (права на запись досок) |
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
| server-workflow-resources | `server-plugins/workflow-resources/src` | Каскадное удаление (Workflow/TaskType/Status/Screen/Attribute) |
| model-tags | `models/tags/src` | `TagCategory`/`TagElement`/`TagReference` (метки Issue) |
| tags, tags-resources, tags-assets | `plugins/tags*` | Типы и UI меток |
| server-tags, server-tags-resources | `server-plugins/tags*` | Триггеры на удаление тегов/ссылок |
| model-card, card, card-resources | `models/card`, `plugins/card*` | Отдельная generic-модель "карточек" (`Card`/`MasterTag`/`Tag`) - трекер её не импортирует; основной текст карточки в поиске - `content` (`contentField`, `models/server-card`) |

## Связанные документы

- [../architecture.md](../architecture.md) - слои плагина и путь запроса.
- [planner-calendar.md](planner-calendar.md) - планировщик и календарь.
- [cards.md](cards.md) - отдельная generic-модель Card, которую трекер не импортирует.
