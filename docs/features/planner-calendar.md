# Планировщик / Календарь

> Сверено с кодом: коммит 39ae47eb6f, 2026-09-23.

Планировщик (Time) - личные и проектные задачи (ToDo) с временными слотами (WorkSlot) в календаре; Team Planner - командный вид занятости коллег; Календарь (Calendar) - события, повторяемость RFC5545, бронируемые расписания, синхронизация с Google/CalDAV; Pulse - realtime-присутствие (кто смотрит документ, набор текста, кросс-воркспейс непрочитанное). Сущности: `ToDo`, `WorkSlot`, `Calendar`/`Event`, `BusySlot`.

## Где код

| Пакет | Путь | Роль |
| --- | --- | --- |
| model-time | `models/time` | Модель ToDo/WorkSlot/ProjectToDo, действия, миграции |
| time | `plugins/time` | Типы, ресурсы (ids/strings) плагина Планировщик |
| time-resources | `plugins/time-resources` | UI планировщика, Team Planner, drag/drop |
| time-assets | `plugins/time-assets` | Локализация планировщика |
| server-time | `server-plugins/time` | Типы серверного плагина (триггеры, ToDoFactory) |
| server-time-resources | `server-plugins/time-resources` | Серверные триггеры ToDo/WorkSlot/Issue |
| model-server-time | `models/server-time` | Регистрация серверных триггеров time в модели |
| model-calendar | `models/calendar` | Модель Calendar/Event/BusySlot/Schedule, миграции |
| calendar | `plugins/calendar` | Типы плагина, recurrence/busy-утилиты |
| calendar-resources | `plugins/calendar-resources` | UI календаря (DayCalendar, Schedule, CalDAV) |
| calendar-assets | `plugins/calendar-assets` | Локализация календаря |
| server-calendar-resources | `server-plugins/calendar-resources` | Триггеры Event, синк BusySlot, очередь Google |
| calendar (сервис) | `services/calendar/pod-calendar` | Синк с Google Calendar (IncomingSyncManager) |
| calendar-mailer | `services/calendar/pod-calendar-mailer` | Email-уведомления календаря |
| model-pulse | `models/pulse` | Модель DocumentPresence/TypingIndicator/WorkspacesNotification |
| pulse | `plugins/pulse` | Типы плагина Pulse |
| presence-resources | `plugins/presence-resources` | UI-потребитель presence/typing |

## Модель данных

| Класс/тип | Смысл | Файл |
| --- | --- | --- |
| `TToDo` | Личная/проектная задача, домен `DOMAIN_TIME` (`'time'`) | `models/time/src/index.ts` |
| `TProjectToDo` | ToDo проекта, `attachedSpace` обязателен (спейс `task.class.Project`) | `models/time/src/index.ts` |
| `TWorkSlot` | Слот ToDo как календарное событие (`extends TEvent`, `attachedTo: Ref<ToDo>`) | `models/time/src/index.ts` |
| `TTodoAutomationHelper` | `onDoneTester: Resource<TodoDoneTester>` - реализацию регистрирует только `server-github-model` (`services/github/server-github-model/src/index.ts`), вызовов в коде нет | `models/time/src/index.ts` |
| `ToDoPriority` | `High/Medium/Low/NoPriority/Urgent` | `plugins/time/src/index.ts` |
| `ToDo.reassignedTo` | `Ref<Person> \| null`, hidden - носитель tx при переназначении (FUSIO-38) | `models/time/src/index.ts` |
| `TCalendar` / `TExternalCalendar` | Календарь пользователя / внешний (Google/CalDAV), домен `DOMAIN_CALENDAR` (`'calendar'`) | `models/calendar/src/index.ts` |
| `TEvent` | Событие, домен `DOMAIN_EVENT` (`'event'`); `eventId` - ключ участник-копий | `models/calendar/src/index.ts` |
| `TReccuringEvent` / `TReccuringInstance` | Мастер серии (RFC5545 `rules`) / материализованное вхождение-оверрайд | `models/calendar/src/index.ts` |
| `TBusySlot` | Free/busy без содержимого, домен `DOMAIN_BUSY` (`'busy'`), индекс `{person, dueDate}` | `models/calendar/src/index.ts`, индекс |
| `TSchedule` | Бронируемое расписание (`meetingDuration`, `availability`, `timeZone`) | `models/calendar/src/index.ts` |
| `AccessLevel` | `FreeBusyReader/Reader/Writer/Owner` | `plugins/calendar/src/index.ts` |
| `Visibility` | `'public' \| 'freeBusy' \| 'private'` | `plugins/calendar/src/index.ts` |
| `TDocumentPresence` | Кто смотрит документ, TTL 10с | `models/pulse/src/index.ts` |
| `TTypingIndicator` | Индикатор набора, TTL 3с | `models/pulse/src/index.ts` |
| `TWorkspacesNotification` | Непрочитанное по аккаунту среди воркспейсов, TTL 300с | `models/pulse/src/index.ts` |

## Как работает

1. **Создание личного ToDo.** Действие `time.action.CreateToDo`/`CreateToDoGlobal` открывает попап `CreateToDoPopup` -> `TToDo` пишется в `PersonSpace` владельца (без `attachedSpace`) -> `models/time/src/index.ts`.
2. **ToDo из Issue.** Назначение ассайни или перевод Issue в Active/ToDo создаёт `TProjectToDo` в спейсе проекта: `createIssueHandler`/`getCreateToDoTx` -> `server-plugins/time-resources/src/index.ts`. Обратной связи ToDo -> статус Issue больше нет (FUSIO-38, снято: `IssueToDoDone`, `OnToDoRemove`, ветка Won/Lost) - см. `docs/memory/planner-todo-issue-decoupling.md`.
3. **Переназначение Issue.** `changeIssueAssigneeHandler` (`server-plugins/time-resources/src/index.ts`) не закрывает ToDo старого исполнителя: ставит `reassignedTo = newAssignee`, режет будущие WorkSlot'ы через `trimWorkSlots` по текущему времени; новый ToDo не создаётся, если у нового исполнителя уже есть открытый.
4. **Закрытие задачи (Won/Lost).** Диалог `time.function.SuggestCloseToDos` (`plugins/time-resources/src/index.ts`, вызывается из `StatusEditor.svelte` и `StatusSelector.svelte` через `getResource`) предлагает закрыть свои открытые ToDo тому, кто закрыл задачу; drag в канбане и workflow-переходы идут мимо диалога - статус Issue ToDo не гасит.
5. **WorkSlot <-> TimeSpendReport.** `OnWorkSlotCreate/Update/Remove` (`server-plugins/time-resources/src/index.ts`) создают/пересчитывают/удаляют `TimeSpendReport` 1:1 через новое поле `TimeSpendReport.workslot` (`models/tracker/src/types.ts`); удаление ToDo каскадом сносит WorkSlot'ы (коллекция `workslots`), те - отчёты. Split "потрачено/запланировано" на чтении: `splitEventsDuration` (`plugins/time-resources/src/utils.ts`) по слотам, `splitReportedTime` (`plugins/tracker/src/index.ts`) по отчётам.
6. **Создание события календаря.** `onEventCreate` создаёт participant-copies события в `PersonSpace` каждого участника по общему `eventId`, ставит в очередь Google-синка `putEventToQueue`, синхронно синкает `BusySlot` (`syncBusySlot` -> `slotTxes`/`masterSlotTxes`, по одному слоту на участника, только у owner-копии); `onEventMixin` тем же путём реплицирует изменения mixin'ов на participant-copies - `server-plugins/calendar-resources/src/index.ts`.
7. **Синхронизация с Google Calendar.** `IncomingSyncManager` (`services/calendar/pod-calendar/src/sync.ts`) тянет внешние события, пишет их в персональный спейс через `getPersonSpace`/`resolvePersonSpace`, исходящие изменения уходят через очередь `putEventToQueue`.
8. **Pulse: набор текста.** ai-bot пишет `TypingIndicator` каждые `TYPING_REFRESH_MS=2000` мс (TTL 3с) - `services/ai-bot/pod-ai-bot/src/workspace/workspaceClient.ts`; `TransientMiddleware` истекает документ раз в секунду, если писать перестали (`foundations/server/packages/middleware/src/transient.ts`).
9. **Pulse: кросс-воркспейс непрочитанное.** account-service генерирует `WorkspacesNotification` из `accountWorkspaceBadgeStatus` (`server/account-service/src/presence.ts`), шлёт по online-TX-шине; `server-plugins/notification/src/middleware.ts` подменяет `objectSpace` на реальный `PersonSpace` получателя; клиент читает через `workspacesNotificationStore` (`plugins/workbench-resources/src/workbench.ts`).

## Фичи

### Планировщик
- **CRUD ToDo.** `CreateToDo`/`CreateToDoGlobal`/`EditToDo`/`DeleteToDo` (Meta+Backspace) + навигация `GotoTimePlaning`/`GotoTimeTeamPlaning`. - `models/time/src/index.ts`.
- **ToDo к чужим сущностям.** Mixin `time.mixin.ItemPresenter` на `tracker.Issue`/`document.Document`/ `lead.Lead`/`recruit.Applicant`. - `models/time/src/index.ts`.
- **Приложение "Планировщик".** `time.app.Me` -> `Me.svelte` -> `PlanView.svelte`, три панели (навигатор/план/календарь). - `models/time/src/index.ts`.
- **Drag/drop ToDo.** Store `dragging` + `ToDoDraggable.svelte`, режимы `ToDosMode`. - `plugins/time-resources/src/dragging.ts`, `plugins/time-resources/src/index.ts`.
- **Переназначение/закрытие ToDo при работе с Issue (FUSIO-38).** См. "Как работает" п.3-5. - `server-plugins/time-resources/src/index.ts`, `docs/memory/planner-todo-issue-decoupling.md`.
- **Миграция слотов.** `moveWorkSlotsToTargetSpace` переносит WorkSlot из общего Calendar-спейса в спейс ToDo пачками по 500. - `models/time/src/migration.ts`.

### Team Planner (FUSIO-1308)
- **Группировка занятости по людям.** `groupTeamData` строит `EventPersonMapping` (слоты + события + busy) с `calcOverlap`; `createDayGroups`/`groupsForDay` - кэш на день. - `plugins/time-resources/src/components/team/utils.ts`.
- **Режимы вида.** `PlannerViewSwitch` переключает `PlannerCalendarMode = 'personal'|'team-calendar'|'team'`; `TeamContent.svelte` - строгие фильтры по проекту+человеку. - `plugins/time-resources/src/index.ts`, `plugins/time-resources/src/components/PlannerViewSwitch.svelte`.
- **Годовая сетка занятости.** `YearCalendar.svelte` (год x люди на BusySlot), `DayCell.svelte` (рабочий день 8-20), `BusyElement.svelte`. - `plugins/time-resources/src/components/team/calendar/`.
- **PersonDayWidget.** Виджет воркбенча - день конкретного человека из ячейки командного календаря. - `models/time/src/index.ts`, `plugins/time-resources/src/components/team/PersonDayWidget.svelte`.
- **Демо-данные.** CLI `generate-planner-data` (dev/tool) заполняет воркспейс проектами/issues/ToDo/ слотами/событиями по тем же правилам размещения слотов. - `dev/tool/src/plannerData.ts`, `docs/memory/planner-demo-data-tool.md`.

### Календарь
- **Recurrence RFC5545.** `generateRecurringValues` (DAILY/WEEKLY/MONTHLY/YEARLY) + `getAllEvents` собирают базовые/развёрнутые/переопределённые события в окно. - `plugins/calendar/src/utils.ts`.
- **Удаление вхождения серии.** `calendar.action.DeleteRecEvent`. - `models/calendar/src/index.ts`.
- **Бронируемое расписание.** `TSchedule` + публичная ссылка `PublicScheduleURL`, `ScheduleEditor.svelte`/ `ScheduleNavSection.svelte`. - `models/calendar/src/index.ts`, `plugins/calendar/src/index.ts`.
- **Google Calendar.** `calendarIntegrationKind = 'google-calendar'`, `services/calendar/pod-calendar` (`IncomingSyncManager`). - `plugins/calendar/src/index.ts`, `services/calendar/pod-calendar/src/sync.ts`.
- **CalDAV.** `caldavIntegrationKind = 'caldav'`, `CalDavAccess.svelte` (сервер/аккаунт/пароль). - `plugins/calendar/src/index.ts`, `plugins/calendar-resources/src/components/CalDavAccess.svelte`.
- **Настройки.** Виджет `calendar.ids.CalendarWidget` (`models/calendar/src/index.ts`), категория `calendar.ids.Settings`.
- **HULY -> Default.** Миграция `fillCalendarUserAndAccess` переименовывает личный календарь (FUSIO-112). - `models/calendar/src/migration.ts`.

### Busy-модель (FUSIO-1308)
- **BusySlot.** Free/busy без содержимого (`title` только для public), домен `DOMAIN_BUSY`. - `models/calendar/src/index.ts`.
- **busySlotData / getBusyIntervals.** Единая форма записи слота (сервер-триггер и миграция общие) + развёртка в интервалы с мержем перекрытий по человеку. - `plugins/calendar/src/utils.ts`.
- **Server-триггер синка.** `syncBusySlot`/`slotTxes`/`masterSlotTxes`, `masterOverrides` для переопределённых вхождений серии. - `server-plugins/calendar-resources/src/index.ts`.
- **Миграция бэкфила.** `fillBusySlots`. - `models/calendar/src/migration.ts`.
- **DayCalendar.** Календарь на день с read-only busy-подложкой коллег (тонкие полосы на пересечениях). - `plugins/calendar-resources/src/components/DayCalendar.svelte`.
- **layout.ts.** `LaidOutSpan`/`layoutColumns` - раскладка перекрывающихся событий по колонкам. - `plugins/calendar-resources/src/layout.ts`.

### Pulse (`@hcengineering/pulse`)
- **DocumentPresence.** Кто сейчас смотрит документ (TTL 10с), потребитель - `presence-resources/src/presence.ts`.
- **TypingIndicator.** Индикатор набора (TTL 3с); пишет ai-bot. - `services/ai-bot/pod-ai-bot/src/workspace/workspaceClient.ts`.
- **WorkspacesNotification.** Кросс-воркспейс unread по аккаунту (TTL 300с), генерирует account-service, доставка по online-TX-шине, store `workspacesNotificationStore`. - `server/account-service/src/presence.ts`, `plugins/workbench-resources/src/workbench.ts`.
- **Исключение из activity.** `services/activity/src/worker.ts` пропускает pulse-классы при генерации activity-сообщений.

## Куда смотреть, если нужно...

- Добавить поле в ToDo -> `models/time/src/index.ts` (класс `TToDo`) + `plugins/time/src/index.ts` (интерфейс `ToDo`).
- Изменить, где живёт слот проектного ToDo -> `getWorkSlotSpace`, `plugins/time-resources/src/utils.ts`.
- Поменять логику переназначения/закрытия ToDo при смене Issue -> `server-plugins/time-resources/src/index.ts` (`changeIssueAssigneeHandler`, `changeIssueStatusHandler`, `trimWorkSlots`).
- Поправить пересчёт TimeSpendReport по слоту -> `server-plugins/time-resources/src/index.ts` (`OnWorkSlotCreate/Update/Remove`).
- Изменить разбивку "потрачено/запланировано" -> `plugins/time-resources/src/utils.ts` (`splitEventsDuration`) и `plugins/tracker/src/index.ts` (`splitReportedTime`).
- Добавить режим Team Planner -> `PlannerCalendarMode`, `plugins/time-resources/src/index.ts`, `TeamContent.svelte`.
- Изменить правило повторяемости событий -> `plugins/calendar/src/utils.ts` (`generateRecurringValues`, `getAllEvents`); в быстрой ветке `generateMonthlyValues`/`generateYearlyValues` `byMonthDay` по умолчанию берётся из локального `getDate()`, а сама дата собирается через `Date.UTC` с UTC-геттерами - в не-UTC поясе может разойтись на день.
- Изменить синк BusySlot -> `server-plugins/calendar-resources/src/index.ts` (`syncBusySlot`, `slotTxes`) + миграция `fillBusySlots` (`models/calendar/src/migration.ts`).
- Добавить интеграцию внешнего календаря -> `plugins/calendar/src/index.ts` (`IntegrationKind`), `services/calendar/pod-calendar/src/sync.ts` (`IncomingSyncManager`).
- Изменить TTL/поведение presence -> `models/pulse/src/index.ts` (`core.mixin.TransientTTL`).
- Найти, кто читает WorkspacesNotification -> `plugins/workbench-resources/src/workbench.ts` (`workspacesNotificationStore`), `server-plugins/notification/src/middleware.ts`.

## Настройки и конфигурация

- `calendar.metadata.CalDavServerURL` - адрес CalDAV-сервера по умолчанию (`plugins/calendar/src/index.ts`).
- `calendar.metadata.PublicScheduleURL` - базовый URL публичных ссылок расписания (`plugins/calendar/src/index.ts`).
- Категория настроек `calendar.ids.Settings` (группа `settings-account`) - подключение/отключение Google/CalDAV, дефолтный календарь.
- `TransientTTL` пакета pulse (10с / 3с / 300с) задаётся в модели, не через env.

## Тесты

- Unit (jest): `plugins/calendar/src/__tests__/busy-slot-data.test.ts`, `busy.test.ts`; `plugins/calendar-resources/src/__tests__/layout.test.ts`; `plugins/time-resources/src/__tests__/queries.test.ts`, `splitEventsDuration.test.ts`; `plugins/time-resources/src/components/team/__tests__/dayGroups.test.ts`, `utils.test.ts`.
- Sanity (Playwright): `tests/sanity/tests/planning/team-planner.spec.ts`, `todos.spec.ts`, `plan.spec.ts`; `tests/sanity/tests/calendar/calendar-recurring.spec.ts`, `calendar-participants.spec.ts`, `calendar.spec.ts`.
- ws-tests (API): `ws-tests/api-tests/src/__tests__/calendar-busy.test.ts`, `planner-spaces.test.ts`, `planner.fixtures.ts`.

## Связанные документы

- [../pulse.md](../pulse.md) - архитектурное решение Pulse (transient docs вместо отдельного WS-сервиса).
- [../new-pulse.md](../new-pulse.md) - исходный план миграции с `foundations/hulypulse`.
- [../time-tracking.md](../time-tracking.md) - оценка/учёт времени на Issue (TimeSpendReport, remainingTime).
- [../memory/planner-todo-issue-decoupling.md](../memory/planner-todo-issue-decoupling.md) - FUSIO-38, развязка ToDo/Issue, переназначение, split потрачено/запланировано.
- [../memory/team-planner-filters.md](../memory/team-planner-filters.md) - ClassFilters на `time.class.ToDo`.
- [../memory/calendar-busy-slot-api-tests.md](../memory/calendar-busy-slot-api-tests.md) - API-тесты BusySlot.
- [../memory/planner-spaces-api-tests.md](../memory/planner-spaces-api-tests.md) - тесты владения спейсами слотов.
- [../memory/planner-demo-data-tool.md](../memory/planner-demo-data-tool.md) - CLI `generate-planner-data`.
- [../memory/presence-fanout.md](../memory/presence-fanout.md) - Presence: логин и кросс-воркспейс непрочитанное
