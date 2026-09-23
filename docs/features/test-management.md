# Тест-менеджмент (test-management)

> Сверено с кодом: коммит 39ae47eb6f, 2026-09-23.

Продуктовое приложение для ручного QA: тест-кейсы, объединённые в иерархические сьюты, тестовые планы (наборы кейсов для конкретного цикла) и прогоны (runs), в которых по каждому кейсу фиксируется результат (`TestResult`) со статусом Untested/Blocked/Passed/Failed. Вся логика клиентская (CRUD через presentation-клиент), серверного пакета нет.

## Где код

| Пакет | Путь | Роль |
| --- | --- | --- |
| `@hcengineering/model-test-management` | `models/test-management/src` | билдер модели: классы `Doc`, миксины, viewlet'ы, приложение workbench |
| `@hcengineering/test-management` | `plugins/test-management/src` | публичные типы/интерфейсы, реестр plugin ID (`testManagementPlugin`), enum аналитики |
| `@hcengineering/test-management-resources` | `plugins/test-management-resources/src` | Svelte-компоненты, actions, navigation, utils |
| `@hcengineering/test-management-assets` | `plugins/test-management-assets` | локали (12 языков в `lang/`) |

Серверных триггеров у подсистемы нет.

## Модель данных

| Класс | Суть | Файл |
| --- | --- | --- |
| `TTestProject` (`TestProject`) | `TypedSpace`-проект тестирования, `fullDescription` (full-text) | `models/test-management/src/types.ts` |
| `TTestSuite` (`TestSuite`) | `Doc`, иерархия через `parent: Ref<TestSuite>`, коллекция `testCases` | `models/test-management/src/types.ts` |
| `TTestCase` (`TestCase`) | `AttachedDoc` к `TestSuite` (collection `'testCases'`): `name`, collaborative `description`, `type`/`priority`/`status` (read-only после создания), `assignee`, `attachments`, `comments` | `models/test-management/src/types.ts` |
| `TTestRun` (`TestRun`) | `Doc`: `name`, `description`, `dueDate`, коллекция `results` (`TestResult`) | `models/test-management/src/types.ts` |
| `TTestResult` (`TestResult`) | `AttachedDoc` к `TestRun` (collection `'results'`): `testCase`, опц. `testSuite`, `status` (`TestRunStatus`), `assignee` | `models/test-management/src/types.ts` |
| `TTestPlan` (`TestPlan`) | `Doc` с коллекцией позиций плана | `models/test-management/src/types.ts` |
| `TTestPlanItem` (`TestPlanItem`) | `AttachedDoc` к `TestPlan` (collection `'items'`): `testCase`, опц. `testSuite`, `assignee` | `models/test-management/src/types.ts` |
| `TestRunStatus` | enum `Untested \| Blocked \| Passed \| Failed` | `plugins/test-management/src/types.ts` |
| `TestCaseType` / `TestCasePriority` / `TestCaseStatus` | справочные enum'ы (Functional..Usability / Low..Urgent / Draft..Rejected) + `TTypeTestCaseType/Priority/Status` | `plugins/test-management/src/types.ts`, `models/test-management/src/types.ts` |

Известная особенность: у `TTestPlan` поле коллекции названо `results` (`models/test-management/src/types.ts`), а публичный интерфейс `TestPlan` объявляет его как `items` (`plugins/test-management/src/types.ts`) - имена не совпадают; runtime `collection` у `TTestPlanItem` при этом строго `'items'` (`types.ts`). Ни один компонент в `test-management-resources` не обращается к `plan.items`/`plan.results` напрямую: позиции плана запрашиваются как `TestPlanItem` по `attachedTo` - `createQuery().query(testManagement.class.TestPlanItem, { attachedTo: testPlan }, ...)` (`components/test-run/NewTestRunPanel.svelte`), поэтому несовпадение имён не проявляется в UI.

Домен `DOMAIN_TEST_MANAGEMENT = 'test-management'`, `DomainIndexConfiguration` отключает 15 индексов (`space`, `attachedToClass`, `status`, `project`, `priority`, `assignee`, `sprint`, `component`, `category`, `modifiedOn`, `modifiedBy`, `createdBy`, `relations`, `milestone`, `createdOn`) - `models/test-management/src/index.ts`.

`SpaceType` по умолчанию: дескриптор `testManagement.descriptors.ProjectType` + `testManagement.spaceType.DefaultProject` (`roles: 0`, без дополнительных ролей) - `models/test-management/src/index.ts`. На всех сущностях (Project/Suite/Case/Run/Result/Plan) подмешан миксин `activity.mixin.ActivityDoc` + `ActivityExtension` с `chunter.component.ChatMessageInput` для активности/чат-комментариев.

## Как работает

1. **Создание тест-кейса.** Кнопка создания в библиотеке (`FoldersBrowser` по `TestSuite`) -> `showCreateTestCasePopup` (`plugins/test-management-resources/src/utils.ts`) -> `CreateTestCase.svelte` -> `op.addCollection(TestCase, ...)` c `status: TestCaseStatus.Draft` (`plugins/test-management-resources/src/components/test-case/CreateTestCase.svelte`).

2. **Запуск выбранных тестов.** Выделение кейсов в списке -> экшен `RunSelectedTests` (target `TestCase`, `input: 'selection'`, `models/test-management/src/index.ts`) -> `RunSelectedTestsAction` (`plugins/test-management-resources/src/utils.ts`) -> `showCreateTestRunPanel({ testCases })` (`utils.ts`) -> `NewTestRunPanel.svelte`: одна `client.apply()`-транзакция создаёт `TestRun` и по `addCollection` - `TestResult` (`status: TestRunStatus.Untested`) на каждый кейс, затем `Analytics.handleEvent(TestManagementEvents.TestRunCreated)` (`plugins/test-management-resources/src/components/test-run/NewTestRunPanel.svelte`).

3. **Тестовый план -> прогон.** `CreateTestPlanButton` -> `showCreateTestPlanPanel` (`utils.ts`) -> `NewTestPlanPanel.svelte` создаёт `TestPlan` + `TestPlanItem` на кейс, шлёт `TestPlanCreated` (`.../test-plan/NewTestPlanPanel.svelte`). `RunTestPlanButton.svelte` вызывает `showCreateTestRunPanel({ testPlanId })`; `NewTestRunPanel` подгружает `TestPlanItem` плана (lookup `testCase`), переносит `assignee` из позиции плана в кейс и создаёт `TestRun`/`TestResult` так же, как в сценарии 2 (`NewTestRunPanel.svelte`).

4. **Прохождение прогона (Test Runner).** Из шапки прогона -> `showTestRunnerPanel` (`utils.ts`) инициализирует `testResultIteratorProvider` (`ObjectIteratorProvider`) по `TestResult` текущего запроса/space (`store/testIteratorStore.ts`), открывает панель `TestRunner`. `TestRunner.svelte` берёт первый элемент через `iterator.next()`, показывает `TestCaseDetails`; кнопка "Go to next test" вызывает `goToNextItem()` (`components/test-result/TestRunner.svelte`). Статус результата меняется инлайн через `TestResultStatusEditor`/`StatusEditor` (`components/test-result/TestResultStatusEditor.svelte`). Прогресс считает `getTestRunStats` - выборка `TestResult` по каждому статусу, `done% = (total - untested) * 100 / total` (`testRunUtils.ts`), рисует `TestRunStats.svelte`.

5. **Режим "Все тесты / Мои тесты".** `TestResultModeSelector.svelte` в шапке прогона вызывает `onModeChanged`, который добавляет/убирает `assignee: currentEmployee` в query location (`navigation.ts`); `FoldersBrowser`/список результатов реагирует на смену query.

## Фичи

### Библиотека и сьюты
- **Иерархические сьюты.** `FoldersBrowser` по `TestSuite` с деревом через `parent`, создание - `CreateTestSuite` (`models/test-management/src/index.ts`), дочерний сьют - экшен `CreateChildTestSuite` (`models/test-management/src/index.ts`).
- **Запуск из библиотеки.** Кнопка `RunButton` в шапке библиотеки открывает создание прогона по выбранным кейсам. - `plugins/test-management-resources/src/components/test-case/RunButton.svelte`.

### Тест-кейсы
- **Атрибуты кейса.** `type`/`priority`/`status` - read-only после создания (`@ReadOnly()`), меняются точечно через `StatusEditor`. - `models/test-management/src/types.ts`.
- **Массовый выбор для прогона.** `SelectTestCasesModal` позволяет добрать кейсы в создаваемый прогон/план. - `plugins/test-management-resources/src/components/test-case/SelectTestCasesModal.svelte`.

### Планы и прогоны
- **Тестовые планы.** Раздел `testPlans`, создание `NewTestPlanPanel`, запуск плана `RunTestPlanButton`. - `models/test-management/src/index.ts`.
- **Статистика прогона.** `getTestRunStats` (done/untested/blocked/completed/failed) + `TestRunStats.svelte` с `ProgressCircle`. - `plugins/test-management-resources/src/testRunUtils.ts`.
- **Последовательное прохождение.** Панель `TestRunner` + `testResultIteratorProvider`, переход к следующему - `goToNextItem()` (`components/test-result/TestRunner.svelte`) - см. сценарий 4.

### Проект и статусы
- **Проект тестирования.** `CreateProject.svelte` создаёт `TestProject` (`client.createDoc`, тип пространства `DefaultProjectTypeData`) и миксин с назначением ролей; правка - экшен `EditProject` (`input: 'focus'`, только при `view.function.CanEditSpace`). - `plugins/test-management-resources/src/components/project/CreateProject.svelte`, `models/test-management/src/index.ts`.
- **Статус-иконка кейса.** Миксин `ObjectIcon` на `TestCase` рисует `TestCaseStatusPresenter`/`StatusEditor` (Draft/ReadyForReview/FixReviewComments/Approved/Rejected) прямо в списке. - `models/test-management/src/index.ts`, `plugins/test-management-resources/src/components/test-case/TestCaseStatusPresenter.svelte`.
- **Активность и комментарии.** На `TestProject`/`TestSuite`/`TestCase`/`TestRun`/`TestResult`/`TestPlan` подмешан `activity.mixin.ActivityDoc` с `chunter.component.ChatMessageInput` - лента и комментарии работают одинаково на всех сущностях. - `models/test-management/src/index.ts` и аналогичные блоки `defineTestSuite`/`defineTestCase`/`defineTestRun`/`defineTestResult`/`defineTestPlan`.

### Навигация и вьюлеты
- **Вьюлеты.** `ListTestCase`/`TableTestCase` (фильтры `priority`/`status`) - `models/test-management/src/index.ts`; `TestResultList`/`TableTestResult` (фильтры `assignee`/`status`/`testSuite`), `TestPlanItemsList`/`TableTestPlanItems` - `index.ts`.
- **Навигация по URL.** `resolveLocation` резолвит `testManagement/<project>` в `library`, `getAttachedObjectLink`/`getTestRunIdFromLocation`/`getProjectFromLocation`. - `plugins/test-management-resources/src/navigation.ts`.

### Аналитика
- **События аналитики.** `TestRunCreated` и `TestPlanCreated`. - `plugins/test-management/src/analytics.ts` (enum `TestManagementEvents`), вызовы в `NewTestRunPanel.svelte` и `NewTestPlanPanel.svelte`.

### Прикрепления
- **Вложения на кейсе и результате.** `TestCase`/`TestResult` несут коллекцию `attachment.class.Attachment` (`AttachmentPresenter`/`AttachmentStyledBox`), редактируются прямо в `EditTestCase`/`EditTestResult`/`CreateTestCase`. - `models/test-management/src/types.ts`, `plugins/test-management-resources/src/components/test-case/CreateTestCase.svelte`.
- **Due date прогона.** `NewTestRunAside` даёт выставить `dueDate` до сохранения панели (`bind:dueDate={object.dueDate}`). - `plugins/test-management-resources/src/components/test-run/NewTestRunPanel.svelte`.
- **Дефолтный assignee плана.** `NewTestPlanAside` даёт выставить `defaultAssignee`, который проставляется в `assignee` каждой создаваемой `TestPlanItem`. - `plugins/test-management-resources/src/components/test-plan/NewTestPlanPanel.svelte`.

## Куда смотреть, если нужно...

- Добавить/изменить поле кейса, прогона, плана -> `models/test-management/src/types.ts`.
- Поменять список/вид (viewlet, фильтры, группировку) -> `models/test-management/src/index.ts` (`defineTestCase`/`defineTestRun`/`defineTestPlan`).
- Изменить попап/панель создания -> `plugins/test-management-resources/src/utils.ts` + соответствующий `*.svelte` в `components/test-run|test-plan|test-suite|test-case`.
- Изменить расчёт статистики прогона -> `plugins/test-management-resources/src/testRunUtils.ts`.
- Изменить логику "Go to next test" / порядок прохождения -> `components/test-result/store/testIteratorStore.ts`, `TestRunner.svelte`.
- Добавить новое аналитическое событие -> `plugins/test-management/src/analytics.ts` + вызов `Analytics.handleEvent` в нужном компоненте.
- Изменить URL/резолвинг ссылок -> `plugins/test-management-resources/src/navigation.ts`.
- Добавить новый статус/тип/приоритет кейса -> enum'ы в `plugins/test-management/src/types.ts` + presenter/иконки в `plugins/test-management-resources/src/types.ts`.
- Добавить локаль/строку -> `plugins/test-management/src/plugin.ts` (`string:`) + все файлы `plugins/test-management-assets/lang/*.json`.

## Настройки и конфигурация

- `DISABLED_FEATURES` (env var сервиса front) со значением `testManagement` полностью отключает приложение для всех воркспейсов инсталляции. - `docs/disableFeatures.md`.

## Тесты

- Юнит-тест только на полноту локалей: `plugins/test-management-assets/src/__tests__/lang.test.ts`.
- Sanity (Playwright) и ws-tests/qms-tests покрытия для test-management в репозитории нет.

## Связанные документы

- `../disableFeatures.md` - список `DISABLED_FEATURES`, включая `testManagement`.
