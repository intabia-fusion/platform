# HR, подбор персонала (Recruit) и обучение (Training)

> Сверено с кодом: коммит 39ae47eb6f, 2026-09-23.

Три независимых приложения на общей платформе: HR - оргструктура компании (отделы, сотрудники) и заявки на отпуск/больничный/удалёнку; Recruit - воронка найма (вакансия -> кандидат -> отклик -> собеседование); Training - корпоративное обучение с тестами (курс -> назначение -> попытка). Сущности: `Department`/`Staff`/`Request` (HR), `Vacancy`/`Candidate`/`Applicant`/`Review` (Recruit), `Training`/`TrainingRequest`/`TrainingAttempt` (Training). HR и Training наследованы от hcengineering (Anticrm/Hardcore Engineering) практически без изменений; в Recruit поверх наследованной базы есть содержательные правки Intabia Fusion (иерархия типов задач, `models/recruit/src/index.ts`).

## Где код

| Пакет | Путь | Роль |
| --- | --- | --- |
| `@hcengineering/model-hr` | `models/hr` | Модель HR: `Department`, `Staff`, `Request`, `RequestType`, `PublicHoliday` |
| `@hcengineering/model-server-hr` | `models/server-hr` | Регистрация серверных триггеров/presenter'ов HR в модель (`Trigger`-документы) |
| `@hcengineering/hr` | `plugins/hr` | Типы, id действий/уведомлений, константы `RequestType` (без UI) |
| `@hcengineering/hr-resources` | `plugins/hr-resources` | Svelte UI: `Schedule`, `Structure`, формы Department/Request |
| `@hcengineering/hr-assets` | `plugins/hr-assets` | Иконки, переводы HR |
| `@hcengineering/server-hr` | `server-plugins/hr` | Объявление серверного плагина HR (заглушки `Resource`) |
| `@hcengineering/server-hr-resources` | `server-plugins/hr-resources` | Реализация триггеров `OnDepartmentStaff`/`OnDepartmentRemove`/`OnEmployee`/`OnEmployeeDeactivate` |
| `@hcengineering/model-recruit` | `models/recruit` | Модель воронки найма: `Vacancy`, `Candidate`, `Applicant`, `Review`, `Opinion`, статусы |
| `@hcengineering/model-server-recruit` | `models/server-recruit` | URL/Identifier/SearchPresenter, `LinkIdProvider`, триггер `OnRecruitUpdate` |
| `@hcengineering/recruit` | `plugins/recruit` | Типы, id действий, email-шаблоны, permission `ForbidCreateVacancy` |
| `@hcengineering/recruit-resources` | `plugins/recruit-resources` | Svelte UI: Vacancies/Talents/Applications/Reviews, `actionImpl.ts`, фильтры |
| `@hcengineering/recruit-assets` | `plugins/recruit-assets` | Иконки, переводы Recruit |
| `@hcengineering/server-recruit` | `server-plugins/recruit` | Объявление серверного плагина recruit (заглушки) |
| `@hcengineering/server-recruit-resources` | `server-plugins/recruit-resources` | Реализация `OnRecruitUpdate` и URL/Identifier-presenter'ов (формат `APP-{n}`/`VCN-{n}`) |
| `@hcengineering/model-training` | `models/training` | Модель `Training`, `TrainingRequest`, `TrainingAttempt`, роли QARA/Manager/QualifiedUser |
| `@hcengineering/model-server-training` | `models/server-training` | Wiring серверных функций Training в модель |
| `@hcengineering/training` | `plugins/training` | Типы (`TrainingAttemptState`), id, генерация кода `TR-{n}` |
| `@hcengineering/training-resources` | `plugins/training-resources` | Svelte UI (60+ компонентов), actions, routing, функции доступа (`can*`) |
| `@hcengineering/training-assets` | `plugins/training-assets` | Иконки, переводы Training |
| `@hcengineering/server-training` | `server-plugins/training` | Объявление серверного плагина (заглушки) |
| `@hcengineering/server-training-resources` | `server-plugins/training-resources` | Реализация `TrainingRequestNotificationTypeMatch`, Url/TitlePresenter |
| `@hcengineering/model-questions`, `@hcengineering/questions(-resources/-assets)` | `models/questions`, `plugins/questions*` | Отдельная модель вопросов/ответов (`Question`, `Answer`, `Assessment`); используется только Training |

## Модель данных

### HR (домен `DOMAIN_HR = 'hr'`, `models/hr/src/index.ts`)

| Класс | Смысл | Файл |
| --- | --- | --- |
| `TDepartment` | Иерархия отделов: `parent`, `name`, `description`, `teamLead`, `members[]`, `subscribers[]`, `managers[]`, каналы/вложения/комментарии | `models/hr/src/index.ts` |
| `TStaff` | Mixin на `contact.mixin.Employee`, добавляет `department: Ref<Department>` | `models/hr/src/index.ts` |
| `TRequest` | Заявка (AttachedDoc к Staff): `department`, `type: Ref<RequestType>`, `description`, `tzDate`/`tzDueDate` (тип `TzDate`: год/месяц/день/offset) | `models/hr/src/index.ts` |
| `TRequestType` | Встроенные типы (домен `DOMAIN_MODEL`): Vacation(-1), Sick(-1), PTO(-1), PTO2(-0.5), Overtime(+1), Overtime2(+0.5), Remote(0) | `models/hr/src/index.ts` |
| `TPublicHoliday` | Праздник: `title`, `description`, `date` (TzDate), `department` | `models/hr/src/index.ts` |

Числовое `value` типа заявки - множитель для расчёта дней отпуска/остатка, а не готовый баланс (см. "Как работает").

### Recruit (типовая воронка построена поверх `task`/`contact`)

| Класс | Смысл | Файл |
| --- | --- | --- |
| `TVacancy extends TProject` | Вакансия = проект трекера: `fullDescription` (коллаборативный документ, FullText), `attachments`, `dueTo`, `location`, `company: Ref<Organization>`, `comments`, `number`, `polls` | `models/recruit/src/types.ts` |
| `TCandidate` | Mixin на `contact.class.Person`: `title`, `applications`, `onsite`/`remote`, `source`, `skills` (Collection TagReference), `reviews`, `vacancyMatch`, `polls` | `models/recruit/src/types.ts` |
| `TVacancyList` | Mixin на `contact.class.Organization`, поле `vacancies` | `models/recruit/src/types.ts` |
| `TApplicant extends TTask` | Отклик: `attachedTo` = Candidate (readonly), `space` = Vacancy, `startDate`, `assignee` (рекрутер), `status` (собственный атрибут `recruit.attribute.State`), `polls` | `models/recruit/src/types.ts` |
| `TReview extends calendar.class.Event` | Собеседование: `number`, `verdict`, `application: Ref<Applicant>`, `company`, `opinions` | `models/recruit/src/types.ts` |
| `TOpinion` | AttachedDoc к Review: `number`, `description` (markup), `value`, `attachments`, `comments` | `models/recruit/src/types.ts` |
| `TApplicantTaskType` | Конкретный класс корневого task type Applicant (механизм "task type как класс") | `models/recruit/src/types.ts` |

Статусы воронки `defaultApplicantStatuses`: Backlog -> HR Interview -> Technical Interview -> Test task -> Offer -> Won/Lost (Offer - статус, не отдельная модель) - `models/recruit/src/spaceType.ts`.

### Training (домен `DOMAIN_TRAINING = 'training'`, `models/training/src/types.ts`)

| Класс | Смысл | Файл |
| --- | --- | --- |
| `TTraining` | Курс: `code` (`TR-{n}`), `revision`, `author`/`owner`, `state`, `passingScore` (Percentage, default 100), `releasedOn`/`releasedBy`, `questions` (Collection `questions.class.Question`), `requests` | `models/training/src/types.ts` |
| `TTrainingRequest` | Назначение (AttachedDoc к Training): `owner`, `trainees: Ref<Employee>[]`, `dueDate`, `maxAttempts`, `attempts`, `canceledOn`/`canceledBy` | `models/training/src/types.ts` |
| `TTrainingAttempt` | Попытка: `seqNumber`, `state` (`draft`/`failed`/`passed`, `plugins/training/src/types.ts`), `answers` (Collection `questions.class.Answer`), `score`, `assessmentsTotal`/`assessmentsPassed` | `models/training/src/types.ts` |
| `TQuestion`/`TAnswer`/`Assessment` (пакет `models/questions`) | Генерик-база вопросов/ответов (домен `questions`), 3 вида: SingleChoice/MultipleChoice/Ordering, каждый - обычный и "оцениваемый" (Assessment) вариант | `models/questions/src/doc-types/base.ts`, `models/questions/src/doc-types/questions/*.ts` |

Training не связан с задачами трекера: импорт `@hcengineering/model-tracker` используется только чтобы скрыть действие "создать связанный issue" через `view.mixin.IgnoreActions` (`models/training/src/index.ts`), а не для связывания.

## Как работает

1. **Приём в отдел (HR).** Person получает mixin `contact.mixin.Employee` -> триггер `OnEmployee` (`server-plugins/hr-resources/src/index.ts`) автоматически навешивает `hr.mixin.Staff` с `department = hr.ids.Head` (корневой отдел "Organization", создаётся миграцией `create-defaults-v2`, `models/hr/src/migration.ts`), если сотрудник активен и не GUEST.
2. **Перевод сотрудника между отделами.** Изменение `Staff.department` -> `TxMixin` ловит триггер `OnDepartmentStaff` (`server-plugins/hr-resources/src/index.ts`), который поднимается по цепочке `parent` (`buildHierarchy`) и добавляет/убирает сотрудника в `members[]` каждого отдела-предка - членство денормализовано по всей ветке дерева, не только в прямом отделе.
3. **Заявка на отпуск.** `CreateRequest.svelte` создаёт `TRequest` с `type` и датами, проверяя только пересечение с уже поданными заявками (`getRequests`); расчёт дней форма не делает. Итоговое число дней и остаток считают `getRequestDays`/`getTotal` (`plugins/hr-resources/src/utils.ts`) в компонентах графика (`MonthTableView.svelte`/`YearView.svelte`): умножают число дней на `RequestType.value`; для отрицательных типов (отпуск/больничный) считаются только будние дни (с учётом `PublicHoliday`), для положительных (Overtime) - все дни. Уведомления по заявкам в модели закомментированы (`models/hr/src/index.ts`, все четыре блока `// TODO: FIXME LATER`) - реально не отправляются.
4. **Отклик на вакансию (Recruit).** Кандидат = `contact.class.Person` + mixin `Candidate`. Экшен `CreateApplication`/`CreateGlobalApplication` (`models/recruit/src/index.ts`) создаёт `Applicant` (task) в `space` = Vacancy со статусом Backlog из `defaultApplicantStatuses`. Смена статуса внутри вакансии - `SelectStatus`; перенос отклика в другую вакансию делает `MoveApplicant` (`models/recruit/src/index.ts`), который меняет `space` и выбирает стартовый статус в новой вакансии - отдельного workflow-движка нет.
5. **Собеседование.** `CreateReview` на карточке кандидата (`models/recruit/src/review.ts`) создаёт `Review extends calendar.class.Event` - собеседование одновременно попадает в календарь и в таблицу Reviews; участники позже добавляют `Opinion` через `CreateOpinion` (`models/recruit/src/review.ts`).
6. **Назначение обучения (Training).** `TrainingRequestCreator.svelte` создаёт `TrainingRequest` с `trainees[]`/`dueDate`/`maxAttempts`; сотрудник проходит `TrainingAttempt` (answers -> `questions` плагин, состояние `draft`->`passed`/`failed` по `passingScore`). Уведомление "SentYouATrainingRequest" (`plugins/training/src/index.ts`) реализовано через `MessageNotificationType` `training.notification.TrainingRequest` (`models/training/src/index.ts`), в отличие от HR - работает.

## Фичи

### HR
- **Оргструктура.** Дерево отделов с руководителем и списком участников на каждом уровне. - `TDepartment`, `models/hr/src/index.ts`.
- **Автозачисление в отдел.** Новый Employee автоматически получает Staff-mixin и попадает в корневой отдел. - `OnEmployee`, `server-plugins/hr-resources/src/index.ts`.
- **Каскадное удаление отдела.** `ArchiveDepartment` разрешён только если `members.length == 0` и это не корневой Head-отдел; `OnDepartmentRemove` каскадно удаляет дочерние отделы (на один уровень) и снимает Staff-mixin с бывших членов. - `models/hr/src/index.ts`, `server-plugins/hr-resources/src/index.ts`.
- **График отпусков.** `Schedule.svelte` показывает заявки сотрудников по месяцам/году через дочерний `ScheduleView.svelte`, учитывает `PublicHoliday`. - `plugins/hr-resources/src/components/schedule/`.
- **Типы заявок с весом.** 7 предустановленных типов с числовым `value` для расчёта остатка дней; значение непосредственно не редактируется через UI, только смена типа внутри своей "полярности". - `plugins/hr-resources/src/components/EditRequestType.svelte`.

### Recruit
- **Вакансия на движке проектов.** Vacancy = `task.class.Project`, воронка настраивается через `ProjectTypeDescriptor VacancyType` + `TaskTypeDescriptor Application`. - `models/recruit/src/spaceType.ts`.
- **Кандидат как mixin контакта.** Одна и та же персона может быть кандидатом на несколько вакансий (`applications` = коллекция Applicant). - `TCandidate`, `models/recruit/src/types.ts`.
- **Запрет создания вакансий по permission.** `ForbidCreateVacancy` - настраиваемое в ролях ограничение на `TxCreateDoc` для Vacancy. - `models/recruit/src/permissions.ts`.
- **Собственная нумерация.** Identifier отклика (`APP-{n}`) пишется в персистентное поле миграцией (`models/recruit/src/migration.ts`, вместе с sequences); идентификатор вакансии (`VCN-{n}`) в БД не хранится, а вычисляется на лету presenter'ом (`getSequenceId`, `server-plugins/recruit-resources/src/index.ts`).
- **Таксономия навыков.** Категории тегов кандидата подгружаются из `@anticrm/skillset` при инициализации воркспейса. - `models/recruit/src/migration.ts`.
- **Письмо кандидату.** Экшен `WriteEmail` открывает Gmail-композер, виден только если у Applicant есть email-канал (`ApplicantHasEmail`). - `models/recruit/src/index.ts`.
- **Короткие ссылки.** `LinkIdProvider` (deep-link, человекочитаемый URL) для Vacancy/Applicant/Opinion/Review; `SearchPresenter` (full-text поиск) только для Vacancy/Applicant. - `models/server-recruit/src/index.ts`.

### Training
- **Версионируемый курс.** `revision`/`state`/`releasedOn` - курс можно редактировать в черновике и выпускать новую редакцию. - `models/training/src/types.ts`.
- **Тест с проходным баллом.** Вопросы - отдельная сущность (`questions.class.Question`), попытка считает `assessmentsPassed`/`assessmentsTotal` и сравнивает со `passingScore`. - `models/training/src/types.ts`, пакет `models/questions`.
- **Ролевая модель QARA/Manager/QualifiedUser.** 8 отдельных permission на "чужие" курсы/заявки (не свои же). - `models/training/src/roles.ts`.
- **Ограниченный доступ для прохождения теста.** Создание `Answer` разрешено с `AccountRole.Guest` через `core.mixin.TxAccessLevel` - сотруднику не нужна повышенная роль, чтобы пройти тест. - `models/questions/src/index.ts`.
- **Связь с Controlled Documents (QMS).** UI Training показывает привязанный контролируемый документ (`TrainingPanelOverview.svelte`), но это только презентационная связь - поля в схеме нет.

## Куда смотреть, если нужно...

- Добавить новый тип отпуска/заявки - `models/hr/src/index.ts` (RequestType docs) + переводы `plugins/hr-assets`.
- Изменить логику расчёта дней/остатка отпуска - `plugins/hr-resources/src/utils.ts` (`getRequestDays`, `getTotal`).
- Изменить поведение при увольнении/деактивации - `OnEmployeeDeactivate`, `server-plugins/hr-resources/src/index.ts`.
- Добавить/поменять статус воронки найма - `models/recruit/src/spaceType.ts` (`defaultApplicantStatuses`).
- Добавить действие над кандидатом/вакансией - `models/recruit/src/index.ts` (блок actions, ~1023-1580) + `plugins/recruit-resources/src/actionImpl.ts`.
- Изменить вопросы/варианты ответа в тестах - `models/questions/src/doc-types` (не в training, общий пакет).
- Поменять права ролей Training (QARA/Manager/QualifiedUser) - `models/training/src/roles.ts`.
- Добавить presenter/уведомление для TrainingRequest - `server-plugins/training-resources/src/functions`.
- Полностью отключить модуль на self-hosted инсталляции - env `DISABLED_FEATURES` (см. ниже); для HR такого флага нет.

## Настройки и конфигурация

`DISABLED_FEATURES` - env-переменная front-сервиса (`pods/front/src/__start.ts`), список через запятую. Поддерживает `recruit` и `training` (полностью прячут приложение из workbench) - `docs/disableFeatures.md`. Для HR аналогичного флага нет - модуль отключить нельзя.

## Тесты

- Sanity Recruit: `tests/sanity/tests/recruiting/{vacancies,talents,applications,reviews,skills, companies,interview}.spec.ts`, page objects в `tests/sanity/tests/model/recruiting/`.
- Sanity Training: отдельных тестов не найдено.
- Unit (`__tests__`, только переводы i18n): `plugins/hr-assets/src/__tests__/lang.test.ts`, `plugins/recruit-assets/src/__tests__/lang.test.ts`, `plugins/training-assets/src/__tests__/lang.test.ts`.
- `qms-tests/sanity-ws-qms/` содержит бэкап-снэпшоты с данными hr/training (для интеграционных тестов backup/restore), отдельных spec-файлов по HR/Training там нет.

## Связанные документы

- [../architecture.md](../architecture.md) - как плагин/модель/server-plugin связаны на уровне платформы.
- [../disableFeatures.md](../disableFeatures.md) - полный список `DISABLED_FEATURES`.
- [../workflow.md](../workflow.md) - отдельный движок переходов статусов задач (Recruit его не использует, статусы воронки - обычные task-статусы).
