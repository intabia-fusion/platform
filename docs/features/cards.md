# Карточки

> Сверено с кодом: коммит 20d792f19d, 2026-10-21.

Generic-модель для произвольных структурированных данных: `Card` — документ, `MasterTag` — его тип (динамический класс, создаётся и меняется через UI, а не только в коде модели), `Tag` — миксин-метка, применяемая к части карточек типа. Карточки группируются в `CardSpace` (пространство с ограничением набора типов), образуют дерево parent/children, имеют настраиваемые разделы и виды. Над карточками работает визуальный движок `Process` (состояния, переходы по триггерам, методы-шаги, `Execution`/`ApproveRequest`/`ProcessToDo`) — конфигурируемый workflow без кода. Отдельно, без привязки к модели `Card`, в этой области лежат текстовые шаблоны (`MessageTemplate`) — переиспользуемые куски текста с полями-подстановками для писем/сообщений/задач.

## Где код

| Пакет | Путь | Роль |
| --- | --- | --- |
| model-card | models/card/src | Модель: `Card`/`CardSpace`/`MasterTag`/`Tag`/`Role`/`CardViewDefaults`/`CreateCardExtension`/`DuplicateSetting`/`FavoriteCard`/`FavoriteType`; `actions.ts` (действия), `permissions.ts` (права на карточки и теги), `migration.ts` |
| card | plugins/card/src | ID плагина, интерфейсы (`Card`, `MasterTag`, `Tag`, `CardSpace`, `CardSection`, `CardViewDefaults`, `CreateCardExtension`, `DuplicateSetting`) |
| card-resources | plugins/card-resources/src | UI: `EditCard`, `ManageMasterTagsContent/Tools`, разделы редактора типа, `CardFeedView`/`CardGridView`, `CreateCardButton/Popup`, `MyCards`, `DuplicateCard`, `utils.ts` (`getSpaceAccessPublicLink` и др.) |
| card-assets | plugins/card-assets/src | Иконки и переводы |
| model-server-card | models/server-card/src | Регистрация серверных триггеров (`OnAttribute`, `OnMasterTagCreate`, `OnCardCreate` и др.) |
| server-card | server-plugins/card/src | ID серверного плагина, `Resource<TriggerFunc>` для триггеров карточки |
| server-card-resources | server-plugins/card-resources/src | Реализация триггеров: синхронизация модели при изменении типов/атрибутов, обновление `parentInfo`, коллабораторов |
| model-process | models/process/src | Модель Process: `Process`/`Trigger`/`Transition`/`State`/`Execution`/`ExecutionLog`/`ProcessToDo`/`ApproveRequest`/`Method`/`ProcessCustomEvent`/`EventButton`/`ProcessFunction`; `actions.ts` (методы), `triggers.ts`, `functions.ts`, `permission.ts` |
| process | plugins/process/src | ID плагина, интерфейсы шагов/триггеров/контекста |
| process-resources | plugins/process-resources/src | UI редактора процессов, карточные разделы `ProcessesExtension`/`RequestsExtension` |
| server-process | server-plugins/process/src | `MethodImpl`/`TriggerImpl`/`FuncImpl` — контракт реализации шагов/триггеров/функций |
| server-process-resources | server-plugins/process-resources/src | Реализация методов, триггеров, `rollback.ts`, `functions.ts`/`transform.ts` |
| services/process | services/process/src | Процессинг-сервис (подробнее — [integrations.md](integrations.md)) |
| model-templates | models/templates/src | Модель: `MessageTemplate`/`TemplateCategory`/`TemplateFieldCategory`/`TemplateField`, категория настроек "Текстовые шаблоны", действия Copy/Move/Open |
| templates | plugins/templates/src | Интерфейсы, `TemplateDataProvider`, `templateFieldRegexp` |
| templates-resources | plugins/templates-resources/src | UI: `Templates`, `TemplatePopup`, `EditorTemplatePopup`, `getTemplateDataProvider` |
| templates-assets | plugins/templates-assets/src | Иконки и переводы |
| server-templates | server-plugins/templates/src | `ServerTemplateField`/`TemplateFieldServerFunc` — серверные поля-подстановки |

## Модель данных

| Класс | Смысл | Файл |
| --- | --- | --- |
| `Card` | документ: `space` (CardSpace), `_class` (MasterTag), `title`, `content` (MarkupBlobRef), `parent`/`children`/`parentInfo`, `rank`, `todos`, `attachments`, `comments`, `icon`/`color`, `readonly` | models/card/src/index.ts:115 |
| `CardSpace` | пространство, `types: Ref<MasterTag>[]` ограничивает типы карточек внутри | models/card/src/index.ts:169 |
| `MasterTag` | тип карточки = динамический `Class<Card>`: `color`/`background`/`removed`/`singleColumn`/`baseType` | models/card/src/index.ts:94 |
| `Tag` | метка-миксин (`Mixin<Card>`): `color`/`background` | models/card/src/index.ts:107 |
| `Role` | роль в пространстве карточек, extends `BaseRole` | models/card/src/index.ts:198 |
| `CardViewDefaults` | миксин типа: раздел/навигация по умолчанию | models/card/src/index.ts:192 |
| `CreateCardExtension` | миксин типа: кастомный компонент создания | models/card/src/index.ts:219 |
| `DuplicateSetting` | миксин типа: что исключать при дублировании | models/card/src/index.ts:230 |
| `FavoriteCard`/`FavoriteType` | избранная карточка/тип (`Preference`) | models/card/src/index.ts:203, 209 |
| `Process` | описание workflow: `masterTag`, `initState`, `autoStart`, `automationOnly`, `requiredSlots`, `bindings`, `context` | models/process/src/index.ts:88 |
| `Trigger` | описание триггера перехода: `checkFunction`, `requiredParams`, `auto` | models/process/src/index.ts:120 |
| `Transition` | переход `from`/`to` c `actions` (шагами) и `trigger` | models/process/src/index.ts:139 |
| `State` | состояние процесса | models/process/src/index.ts:259 |
| `Execution` | запущенный экземпляр на карточке: `currentState`, `rollback: Tx[][]`, `context`, `status` | models/process/src/index.ts:181 |
| `ExecutionLog` | журнал шагов исполнения | models/process/src/index.ts:163 |
| `ProcessToDo` | задача процесса (extends `ToDo`): `execution`, `withRollback` | models/process/src/index.ts:210 |
| `ApproveRequest` | запрос согласования (extends `ProcessToDo`): `approved`, `reason`, `actionType` | models/process/src/index.ts:223 |
| `Method` | реализация шага: `objectClass`, `requiredParams`/`defaultParams`, `createdContext` | models/process/src/index.ts:240 |
| `ProcessCustomEvent` | пользовательское событие на карточке: `eventType`, `execution`, `card` | models/process/src/index.ts:273 |
| `EventButton` | кнопка в карточке, бросающая `ProcessCustomEvent` | models/process/src/index.ts:284 |
| `MessageTemplate` | текстовый шаблон: `title`, `message` (Markup) | models/templates/src/index.ts:39 |
| `TemplateCategory` | пространство шаблонов (extends `Space`) | models/templates/src/index.ts:51 |
| `TemplateField`/`TemplateFieldCategory` | поле-подстановка `${name}` и его категория; `func`/`serverFunc` вычисляют значение | models/templates/src/index.ts:55, 60 |

## Как работает

1. **Создание карточки от типа.** `CreateCardButton`/`CreateCardPopup` вызывают `client.createDoc(type as Ref<Class<Card>>, space, data)` — `type` (MasterTag/Tag) и есть целевой класс, картотека создаётся как документ динамического класса. Серверный `OnCardCreate` (models/server-card, реализация в server-plugins/card-resources/src/index.ts) синхронизирует коллабораторов и `parentInfo`.
2. **Типы и теги как динамические классы.** При создании `MasterTag`/`Tag` триггер `OnMasterTagCreate` регистрирует класс/миксин в иерархии; добавление/удаление свойства типа ловит `OnAttribute`/`OnAttributeRemove` и пересобирает вьюлеты (`OnViewletUpdate`); `removed: true` у `MasterTag` (`OnMasterTagRemove`) и удаление `Tag` (`OnTagRemove`) чистят связанные тег-отношения (`removeTagRelations`). — server-plugins/card-resources/src/index.ts.
3. **Иерархия родитель/потомок.** Действие `CreateChild` (card.actionImpl.CreateChild) создаёт карточку с `parent` = текущая; `SetParent`/`UnsetParent` меняют родителя через popup/`UpdateDocument`; счётчики `children`/`parentInfo` поддерживает `OnCardUpdate`/`OnCardCreate`/`OnCardRemove`. — models/card/src/actions.ts; server-plugins/card-resources/src/index.ts.
4. **Процесс подписывается на событие карточки и выполняет переход.** `Trigger` (например `OnCardUpdate`/"WhenCardMatches", `WhenFieldChanges`, или `ProcessCustomEvent` - сейчас его создаёт только кнопка "Откат") проверяется серверной check-функцией; совпадение запускает/продвигает `Execution` по `Transition`, выполняется `Method` шага, применённые транзакции складываются в `execution.rollback` для возможного отката. Движок, таймеры (`QueueTopic.TimeMachine`) и откат разобраны в [integrations.md](integrations.md) — здесь это сторона карточки: раздел `CardProcesses`/`CardApproveRequest`, действия "Запустить процесс"/"Продолжить". — models/process/src/{index,triggers,actions}.ts; server-plugins/process-resources/src/{functions,rollback}.ts.
5. **Применение текстового шаблона.** `TemplatePopup` берёт `MessageTemplate.message`, `TemplateDataProvider.fillTemplate` заменяет `${name}` (`templateFieldRegexp`) на значения зарегистрированных `TemplateField.func` (клиент) или `ServerTemplateField.serverFunc` (сервер) по текущему контексту (например данные письма/задачи). Шаблоны не привязаны к модели `Card` — ими пользуются contact/gmail/telegram-resources и настройки рабочего пространства. — plugins/templates-resources/src/utils.ts; plugins/templates/src/index.ts:63,74; server-plugins/templates/src/index.ts.
6. **Публичный доступ.** `card.action.PublicLink` (через `model-guest`'s `createPublicLinkAction`) открывает попап создания персональной ссылки на карточку. Для целого пространства (`CardSpace`) действие `GetIndividualPublicLink` создаёт и копирует в буфер гостевую ссылку уровня аккаунта через `getSpaceAccessPublicLink` (`accountClient.createAccessLink(Guest, { spaces: [space] })`). — models/card/src/actions.ts:42; plugins/card-resources/src/utils.ts:797.

## Фичи

### Карточки: CRUD и иерархия

- **Базовая модель карточки.** `Card`: `title`/`content` (rich text в MarkupBlobRef), `icon`/`color`, `readonly`, счётчики `attachments`/`comments`/`children`. - `models/card/src/index.ts:115`.
- **Иерархия родитель/потомок.** `parent`/`parentInfo`, действия `CreateChild`/`SetParent`/`UnsetParent`. - `models/card/src/actions.ts`.
- **Действия редактирования и экспорта.** `CopyDocumentMarkdown`, `CopyAsMarkdownTable`, `Duplicate` (с учётом `DuplicateSetting`), `move`, удаление. - `models/card/src/actions.ts`.
- **Избранные карточки и типы.** `FavoriteCard`/`FavoriteType` (`Preference`), `FavoriteCardPresenter`. - `models/card/src/index.ts:203,209`; `plugins/card-resources/src/index.ts`.
- **"Мои карточки".** Спецраздел навигатора приложения Card с видами Assigned/Created/Subscribed. - `MyCards`, `models/card/src/index.ts` (`id: 'my-cards'`); `plugins/card-resources/src/components/navigator/MyCards.svelte`.

### Типы и теги

- **MasterTag — тип карточки как динамический класс.** Создание/удаление типа (`CreateMasterTag`/`DeleteMasterTag`) синхронизируется с иерархией сервером (`OnMasterTagCreate`/`OnMasterTagRemove`); `baseType` помечает тип, предпочитающий создание через производные подтипы (`isBaseTypeWithSubtypes`). Отдельно: смена типа у самой карточки - действие `ChangeType` на `card.class.Card` (попап `ChangeType`), не редактирование типа. - `models/card/src/actions.ts`; `server-plugins/card-resources/src/index.ts`; `plugins/card-resources/src/utils.ts:610-620`.
- **Tag — метка-миксин на карточках.** `CreateTag`/`DeleteMasterTag` на `Tag`, очистка связей при удалении (`OnTagRemove`/`removeTagRelations`). - `models/card/src/{actions,index}.ts`; `server-plugins/card-resources/src/index.ts`.
- **Редактор типа.** Разделы General/Properties/Tags/MasterTags(childs)/Relations/Roles/Views (`MasterTagEditorSection`). - `models/card/src/index.ts:1013-1054`.
- **Роли в пространстве карточек.** `Role extends BaseRole`, `RolesSection`/`EditRole`/`CreateRolePopup`. - `models/card/src/index.ts:198`; `plugins/card-resources/src/index.ts`.
- **Настройки отображения и создания по умолчанию.** Миксины `CardViewDefaults` (раздел/навигация по умолчанию) и `CreateCardExtension` (кастомный компонент создания) на `MasterTag`. - `models/card/src/index.ts:192,219`.
- **Права на карточки и теги.** Разрешения `AddTag`/`RemoveTag`/`CreateCard`/`UpdateCard`/`RemoveCard` и их запрещающие пары `ForbidAddTag`/`ForbidRemoveTag`/`ForbidCreateCard`/`ForbidUpdateCard`/`ForbidRemoveCard`, плюс `LockSection`/`UnlockSection` (scope: space). - `models/card/src/permissions.ts`.

### Пространства карточек (CardSpace)

- **CardSpace — пространство с ограничением типов.** `types: Ref<MasterTag>[]` задаёт, какие типы доступны в пространстве; создание через `CreateSpace`, навигатор группирует по `spaces`. - `models/card/src/index.ts:169`; `plugins/card-resources/src/index.ts`.

### Виды и разделы карточки

- **Виды списков карточек.** Вьюлеты `CardTable`/`CardList`/`CardChildList`(variant child)/`CardFeed`/`CardRelationshipTable`/`CardGrid`. - `models/card/src/index.ts:702-860`.
- **Разделы карточки.** `Properties`/`Content`/`Children`/`Attachments`/`OldMessages` (раздел `Relations` — отдельный пункт ниже). - `models/card/src/index.ts:1080-1153`.
- **Связи между карточками (Relations).** Раздел `Relations` карточки и раздел `relations` редактора типа (`RelationsSection`, `models/card/src/index.ts:1038-1042`); категория настроек воркспейса "Связи тегов" (`RelationSetting`) - это общий редактор связей (Association) между всеми потомками `Card` и `contact.class.Contact`, не специфичен для `Tag`. Связи используются и методом процесса `AddRelation`. - `models/card/src/index.ts:1134`; `plugins/card-resources/src/components/settings/RelationSetting.svelte:12-25`.

### Публичный доступ

- **Персональная публичная ссылка на карточку.** `card.action.PublicLink` (попап создания, через `model-guest`) открывает попап создания персональной ссылки на карточку. - `models/card/src/index.ts:1077`.
- **Публичный доступ к пространству карточек.** Действие `GetIndividualPublicLink` (на `CardSpace`) создаёт и копирует в буфер гостевую ссылку уровня аккаунта через `getSpaceAccessPublicLink`/`canGetSpaceAccessPublicLink`. - `models/card/src/actions.ts:37-48`; `plugins/card-resources/src/utils.ts:797,815`.

### Процессы над карточками

- **Визуальный процесс как раздел карточки.** Разделы `CardProcesses`/`CardApproveRequest`, расширения `ProcessesExtension`/`RequestsExtension`/`ProcessesHeaderExtension`, настройка процессов типа (`ProcessesSettingSection`), вьюлеты `Card Requests`/`Card Executions`/`Executions List`/`Execution Log List`, действия "Запустить процесс" (`RunProcess` на `Card`) и "Продолжить" (`ContinueExecution` на `Execution`). Движок выполнения (откат, TimeMachine, ~70 функций преобразования контекста, сервис `services/process`) — в [integrations.md](integrations.md). - `models/process/src/index.ts:410-767`.
- **Методы процесса.** Шаги, которые может выполнить переход: `RunSubProcess`/`RequestApproval`/`CreateToDo`/`UpdateCard`/`CreateCard`/`AddRelation`/`AddTag`/`CancelToDo`/`CancelSubProcess`/`LockCard`/`LockSection`/`UnlockCard`/`UnlockSection`/`LockField`/`UnlockField`. - `models/process/src/actions.ts`; `server-plugins/process-resources/src/{functions,rollback}.ts`.
- **Триггеры перехода.** `OnApproveRequestApproved`/`OnApproveRequestRejected`/`OnToDoClose`/`OnToDoRemove`/`OnExecutionStart`/`OnCardUpdate`("WhenCardMatches")/`WhenFieldChanges`/`WhenRequiredFieldsFilled`/`OnSubProcessesDone`/`OnSubProcessMatch`/`OnTime`("WaitUntil"). - `models/process/src/triggers.ts`.
- **Откат шага процесса.** У выполнения, где есть шаг для отката (`Execution.rollback`), в шапке карточки появляется кнопка "Откат"; она создаёт `ProcessCustomEvent` с `eventType: 'rollback'`, сервис процессов откатывает выполнение. - `plugins/process-resources/src/components/ProcessesHeaderExtension.svelte` (`performRollback`), `services/process/src/main.ts` (`isRollback`).

### Текстовые шаблоны

Не привязаны к модели `Card`, пользовательские фичи и строки карты - в [utilities.md](utilities.md#templates).

## Пользовательская документация

| Фича | ru | en | Статус | Сверено | Расхождение |
| --- | --- | --- | --- | --- | --- |
| Базовая модель карточки | cards/cards-overview, cards/cards-vs-documents, cards/use-cases | cards/cards-overview, cards/cards-vs-documents, cards/use-cases | off | - | выключено в продукте |
| Иерархия родитель/потомок | cards/parent-child-cards | cards/parent-child-cards | off | - | выключено в продукте |
| Действия редактирования и экспорта | - | - | off | - | не документируем |
| Избранные карточки и типы | - | - | off | - | не документируем |
| "Мои карточки" | - | - | off | - | не документируем |
| MasterTag — тип карточки как динамический класс | cards/types/types-overview, cards/types/creating-types, cards/types/file-types | cards/types/types-overview, cards/types/creating-types, cards/types/file-types | off | - | выключено в продукте |
| Tag — метка-миксин на карточках | cards/tags/tags-overview, cards/tags/creating-tags, cards/tags/applying-tags | cards/tags/tags-overview, cards/tags/creating-tags, cards/tags/applying-tags | off | - | выключено в продукте |
| Редактор типа | cards/types/creating-types | cards/types/creating-types | off | - | выключено в продукте |
| Роли в пространстве карточек | cards/cards-vs-documents | cards/cards-vs-documents | off | - | выключено в продукте |
| Настройки отображения и создания по умолчанию | - | - | off | - | не документируем |
| Права на карточки и теги | - | - | off | - | не документируем |
| CardSpace — пространство с ограничением типов | cards/creating-cards | cards/creating-cards | off | - | выключено в продукте |
| Виды списков карточек | cards/view-sort-filter-cards | cards/view-sort-filter-cards | off | - | выключено в продукте |
| Разделы карточки | - | - | off | - | не документируем |
| Связи между карточками (Relations) | cards/relations/relations-overview, cards/relations/defining-relations, cards/relations/relating-cards, cards/relations/relations-vs-references | cards/relations/relations-overview, cards/relations/defining-relations, cards/relations/relating-cards, cards/relations/relations-vs-references | off | - | выключено в продукте |
| Персональная публичная ссылка на карточку | - | - | off | - | не документируем |
| Публичный доступ к пространству карточек | - | - | off | - | не документируем |
| Визуальный процесс как раздел карточки | - | - | off | - | не документируем |
| Методы процесса | - | - | off | - | не документируем |
| Триггеры перехода | - | - | off | - | не документируем |
| Откат шага процесса | - | - | off | - | не документируем |

## Куда смотреть, если нужно...

- Добавить свойство типа карточки / изменить синхронизацию модели -> `OnAttribute`/`OnAttributeRemove`, server-plugins/card-resources/src/index.ts.
- Добавить действие над карточкой/типом/тегом -> models/card/src/actions.ts.
- Поменять разделы карточки или редактора типа -> `defineTabs`/`MasterTagEditorSection`, models/card/src/index.ts.
- Добавить вид (viewlet) карточек -> models/card/src/index.ts (`card.viewlet.*`), card-resources/src (presenter-компоненты).
- Изменить правила публичного доступа к карточке/пространству -> models/card/src/index.ts (`PublicLink`), models/card/src/actions.ts (`GetIndividualPublicLink`), plugins/card-resources/src/utils.ts (`getSpaceAccessPublicLink`).
- Добавить новый шаг (Method) или триггер процесса -> models/process/src/{actions,triggers}.ts + server-plugins/process-resources/src/{functions,index}.ts (детали движка - [integrations.md](integrations.md)).
- Добавить раздел/вьюлет процесса на карточке -> models/process/src/index.ts (`CardProcesses`/`CardApproveRequest`/вьюлеты).
- Добавить поле-подстановку в текстовый шаблон -> plugins/templates/src/index.ts (`TemplateField`) + server-plugins/templates/src/index.ts (`ServerTemplateField`) + реализация в plugins/templates-resources/src/utils.ts.

## Тесты

- Unit: plugins/card-resources/src/__tests__/{cardTableFormatter,markupCellRoundTrip,tagFormatter}.test.ts; plugins/card-assets/src/__tests__/lang.test.ts; server-plugins/card-resources/src/__tests__/{onCardUpdateTitle,oncardremove}.test.ts.
- Unit: plugins/process/src/__tests__/dslContext.test.ts; plugins/process-resources/src/__tests__/{detectSlotsRefined,integration}.test.ts; server-plugins/process-resources/src/__tests__/{runSubProcess,runSubProcessRollback,transform}.test.ts.
- Unit: plugins/templates-assets/src/__tests__/lang.test.ts.
- У models/card, models/process, models/templates, models/tags, plugins/tags{,-resources} отдельных `__tests__` не найдено.

## Связанные документы

- [integrations.md](integrations.md) - Process как интеграционный движок: сервис `services/process`, таймеры `QueueTopic.TimeMachine`, откат (`execution.rollback`/`rollback.ts`), каталог ~70 функций преобразования контекста (`functions.ts`), права запуска/отмены процесса (`permission.ts`). Здесь, в cards.md, Process описан со стороны карточки (разделы, вьюлеты, действия); не дублируй список методов/триггеров - сверяй оба файла при изменении `models/process`.
