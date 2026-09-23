# CRM / Контакты (Contact, Lead)

> Сверено с кодом: коммит 39ae47eb6f, 2026-09-23.

Базовая подсистема платформы: люди (Person), организации (Organization), сотрудники (Employee), каналы связи (Channel) и подтверждённые соц-идентичности (SocialIdentity), на которых строится вход в систему, упоминания, назначения и уведомления. Модуль `lead` (воронка продаж) - надстройка поверх Contact/Task, ведёт Customer (миксин на контакте) через стадии Funnel до Won/Lost.

## Где код

| Пакет | Путь | Роль |
| --- | --- | --- |
| models/contact | models/contact/src | модель Contact/Person/Organization/Employee/Channel/SocialIdentity, статический билд-модель |
| models/server-contact | models/server-contact/src | регистрация серверных триггеров/презентеров contact в билд-модели |
| plugins/contact | plugins/contact/src | типы, утилиты (ensureEmployee, поиск, аватары), клиентский кэш персон |
| plugins/contact-resources | plugins/contact-resources/src | Svelte-компоненты, фильтры, resolvers, сторы (employeeByIdStore и т.п.) |
| plugins/contact-assets | plugins/contact-assets/lang | переводы UI contact (12 языков) |
| server-plugins/contact | server-plugins/contact/src | id триггеров/функций (декларации) + серверные утилиты (getPerson, getAccountBySocialId...) |
| server-plugins/contact-resources | server-plugins/contact-resources/src | реализация триггеров (OnEmployeeCreate, OnPersonCreate, OnContactDelete...) |
| models/lead | models/lead/src | модель Funnel/Lead/Customer, стадии воронки |
| models/server-lead | models/server-lead/src | регистрация серверных презентеров lead |
| plugins/lead | plugins/lead/src | типы Funnel/Lead/Customer |
| plugins/lead-resources | plugins/lead-resources/src | UI воронки (Kanban/List/Table, создание лида) |
| plugins/lead-assets | plugins/lead-assets/lang | переводы UI lead (12 языков) |
| server-plugins/lead | server-plugins/lead/src | id серверных presenter-функций |
| server-plugins/lead-resources | server-plugins/lead-resources/src | реализация presenter-функций (URL/идентификатор лида) |

## Модель данных

| Класс | Смысл | Файл |
| --- | --- | --- |
| `TContact` | база: `name` (FullText), скрытые `avatarType`/`avatar`/`avatarProps`, коллекции `channels`/`attachments`/`comments`, `city` (FullText) | `models/contact/src/index.ts` |
| `TChannel` (AttachedDoc) | канал связи: `provider`, `value` (FullText), `items`, `lastMessage` | `models/contact/src/index.ts` |
| `TSocialIdentity` (AttachedDoc к Person) | подтверждённая идентичность: `key`/`type`/`value`(FullText)/`verifiedOn`/`isDeleted`; `_id` совпадает с `PersonId` | `models/contact/src/index.ts` |
| `TPerson extends TContact` | `personUuid` (связь с глобальным аккаунтом), `birthday`, `socialIds`, `profile` (карточка UserProfile) | `models/contact/src/index.ts` |
| `TMember` (AttachedDoc) | привязка произвольного `Contact` к организации | `models/contact/src/index.ts` |
| `TOrganization extends TContact` | `description` (Markup), `members` | `models/contact/src/index.ts` |
| `TStatus` (AttachedDoc к Employee) | статус сотрудника: `name`, `dueDate` | `models/contact/src/index.ts` |
| `TEmployee` (миксин на Person) | `active`, `role: USER \| GUEST`, `statuses`, `position`, `timezone` | `models/contact/src/index.ts` |
| `TPersonSpace` | личное пространство: `person` + `account` (AccountUuid) | `models/contact/src/index.ts` |
| `TTranslation` (Preference на Employee) | настройки автоперевода: `enabled`, `translateTo`, `dontTranslate` | `models/contact/src/index.ts` |
| `TRecentlyUsedPersonsPreference` | недавно использованные назначаемые (`assignees`) | `models/contact/src/index.ts` |
| `TFunnel extends TProject` | воронка: `fullDescription` (FullText) | `models/lead/src/types.ts` |
| `TLead extends TTask` | `attachedTo: Ref<Customer>` (ReadOnly), `startDate`, `title` (FullText), `assignee`, `status`, `space: Ref<Funnel>` | `models/lead/src/types.ts` |
| `TCustomer` (миксин на Contact) | `leads`, `customerDescription`, `website`, `industry`, `labels` | `models/lead/src/types.ts` |

Каналы связи (провайдеры): Phone, LinkedIn, Twitter, GitHub, Facebook, Homepage, Whatsapp, Profile, Viber - `models/contact/src/index.ts`. Провайдеры соц-идентичностей (используются для входа): Email, Huly, Phone, Google, GitHub, Telegram - `models/contact/src/index.ts`.

## Как работает

1. **Вход в систему -> Person/Employee/PersonSpace.** Клиент логинится -> вызывается `ensureEmployee`/`ensureEmployeeForPerson`, `plugins/contact/src/utils.ts` (реализация): по `personUuid` или подтверждённой `SocialIdentity` находится либо атомарно создаётся `Person` (через `TxApplyIf`, чтобы конкурентные логины не создали дубликат), подтягиваются/создаются `SocialIdentity`-записи, затем ставится миксин `Employee`. Присвоение миксина (`TxMixin(Employee, active=true)`) триггерит `OnEmployeeCreate`, `server-plugins/contact-resources/src/index.ts`, который под `control.withScope` создаёт личный `PersonSpace` (`createPersonSpace`, если его ещё нет) и добавляет аккаунт в пространства с `autoJoin: true` (для GUEST - в read-only guest пространства).
2. **Создание Person -> карточка UserProfile.** `TxCreateDoc(Person)` триггерит `OnPersonCreate`, `server-plugins/contact-resources/src/index.ts`: создаётся `card.class.UserProfile` и `Person.profile` проставляется на неё.
3. **Удаление контакта.** `TxRemoveDoc(Contact)` -> `OnContactDelete`, `server-plugins/contact-resources/src/index.ts`, удаляет связанные `Member`-записи в организациях.
4. **Обновление канала -> подписка на уведомления.** `TxUpdateDoc(Channel, $inc.items)` -> `OnChannelUpdate`, `server-plugins/contact-resources/src/index.ts`, создаёт `Collaborator` для отправившего аккаунта.
5. **Мерж дублирующихся персон.** Действие `contact.action.MergePersons`, `models/contact/src/index.ts`, открывает `plugins/contact-resources/src/components/MergePersons.svelte`; `merge()` переносит выбранные поля/каналы/соц-идентичности/миксины на `targetPerson`, `updateAllRefs` переписывает ссылки на исходную персону во всех классах, `accountClient.mergeSpecifiedPersons` мержит персоны на уровне глобального account-сервиса, после чего `sourcePerson` удаляется.
6. **Lead в воронке.** Создание `Lead` (`CreateLead`) привязывает его к `Customer`-миксину на контакте и к `Funnel` (`space`); статус берётся из `defaultLeadStatuses`, `models/lead/src/spaceType.ts` (Backlog -> Incoming -> Negotiation -> OfferPreparing -> MakeADecision -> ContractConclusion -> Won/Lost). Табличное/канбан/списочное представления - `models/lead/src/index.ts` (см. ниже).

## Фичи

### Contact

- **Race-safe создание Person/Employee при логине.** `ensureEmployeeForPerson` параллелит поиск персоны/соц-идентичностей в один round-trip и использует `TxApplyIf`, чтобы конкурентные вызовы не создавали дубликаты Person/SocialIdentity/Employee. - `ensureEmployeeForPerson`, `plugins/contact/src/utils.ts`.
- **Клиентский кэш персон.** Синхронные геттеры персон/соц-идентичностей по `PersonId`/`Ref<Person>` с подгрузкой в фоне. - `ContactCache`, `plugins/contact/src/cache.ts`; обёртки `plugins/contact/src/utils.ts`.
- **Мерж дублирующихся персон.** См. сценарий 5. - `MergePersons.svelte`, `plugins/contact-resources/src/components/MergePersons.svelte`.
- **Фильтры по каналам связи.** "Есть в", "Нет в", "Есть сообщения", "Есть новые сообщения" - фильтрация контактов по факту/новизне переписки в канале. - `filterChannelHasMessagesResult`, `filterChannelHasNewMessagesResult`, `plugins/contact-resources/src/utils.ts` (регистрация - `models/contact/src/index.ts`).
- **Личное пространство (PersonSpace).** Создаётся автоматически при первой активации `Employee`. - `createPersonSpace`, `server-plugins/contact-resources/src/index.ts`.
- **Автоперевод сообщений.** Настройка per-employee: включение, целевой язык, список исключённых языков. - `TTranslation`, `models/contact/src/index.ts`; UI-стор `plugins/contact-resources/src/translation.ts`.
- **Автосинхронизация таймзоны браузера.** При смене таймзоны устройства обновляет `Employee.timezone`; пишет только если сменилась таймзона именно этого устройства (иначе несколько сессий в разных зонах бесконечно перетирали друг друга, FUSIO-1344). - `syncMyEmployeeTimezone`, `plugins/contact-resources/src/timezone.ts`.
- **Скрытие отдельных каналов по региону.** Флагом `hide-ru-banned-channels` из UI-списка провайдеров убираются LinkedIn/Twitter/Facebook/Viber/Whatsapp. - `BANNED_CHANNEL_PROVIDERS`, `plugins/contact-resources/src/utils.ts`.
- **Seat-лимиты при создании Employee.** Форма создания сотрудника проверяет `planLimits.usersLimit` из billing и блокирует создание при исчерпании мест. - `plugins/contact-resources/src/components/CreateEmployee.svelte`.

### Lead

- **Воронка с 8 стадиями по умолчанию.** Backlog, Incoming, Negotiation, Offer preparing, Make a decision, Contract conclusion, Won, Lost. - `defaultLeadStatuses`, `models/lead/src/spaceType.ts`.
- **Lead как задача, привязанная к Customer.** `TLead extends TTask`, `attachedTo: Ref<Customer>` read-only после создания. - `models/lead/src/types.ts`.
- **Customer - миксин на любом Contact.** Любую персону/организацию можно пометить `Customer` (website/industry/labels/leads). - `models/lead/src/types.ts`.
- **Представления воронки.** Table/List/Kanban/Dashboard для Lead, Table для Funnel/Customer. - `lead.viewlet.TableFunnel` (`models/lead/src/index.ts`), `TableCustomer`, `TableLead`, `ListLead`, `KanbanLead`, `DashboardLead`.
- **Запрет создания новой воронки.** Право `ForbidCreateFunnel` на `Funnel`. - `models/lead/src/permissions.ts`.

### Прочее

- Fulltext-поиск в фильтрах контакта/атрибутов (`fullTextSummary: true`). - `models/contact/src/index.ts`.
- Presenter соц-идентичности. - `SocialIdentityPresenter.svelte`.
- Скрытие запрещённых каналов связи по региону (`hide-ru-banned-channels`, FUSIO-927) - см. выше.
- Race-safe `ensureEmployeeForPerson` + автосинхронизация таймзоны - PR "Parallelize login handshake queries" (#462) и "Stability fixes" (#444), FUSIO-1344.

## Куда смотреть, если нужно...

- добавить канал связи (мессенджер и т.п.) -> `contact.channelProvider.*`, `models/contact/src/index.ts` + переводы в `plugins/contact-assets/lang`
- добавить провайдера входа по соц-идентичности -> `contact.socialIdentityProvider.*`, `models/contact/src/index.ts`
- изменить логику создания Person/Employee при логине -> `ensureEmployeeForPerson`, `plugins/contact/src/utils.ts`
- изменить, что происходит при активации сотрудника (автовступление в пространства, PersonSpace) -> `OnEmployeeCreate`, `server-plugins/contact-resources/src/index.ts`
- изменить логику мержа персон -> `MergePersons.svelte`, `plugins/contact-resources/src/components/MergePersons.svelte`
- скрыть/показать канал связи по региону -> `BANNED_CHANNEL_PROVIDERS`, `plugins/contact-resources/src/utils.ts`
- добавить/изменить стадию воронки Lead -> `defaultLeadStatuses`, `models/lead/src/spaceType.ts`
- изменить колонки таблицы/канбана лидов -> viewlet'ы в `models/lead/src/index.ts`
- изменить право доступа к разделу Lead -> `models/lead/src/permissions.ts`
- изменить формат отображения имени (Фамилия Имя / Имя Фамилия) -> `formatName`, `plugins/contact/src/utils.ts`, метаданные `contact.metadata.LastNameFirst`
- изменить seat-лимиты при создании сотрудника -> `plugins/contact-resources/src/components/CreateEmployee.svelte`

## Настройки и конфигурация

- `DISABLED_FEATURES=lead` - отключает приложение Lead целиком (`docs/disableFeatures.md`).
- `DISABLED_FEATURES=auto-translate` - отключает настройку автоперевода (`setting.class.SettingsCategory` с `feature: 'auto-translate'`, `models/contact/src/index.ts`).
- `DISABLED_FEATURES=hide-ru-banned-channels` - скрывает часть провайдеров каналов в UI (`plugins/contact-resources/src/utils.ts`).
- Seat-лимиты воркспейса (`planLimits.usersLimit`) ограничивают создание Employee - источник лимитов описан в `docs/memory/billing-limits-enforcement.md`.

## Тесты

- Unit: `plugins/contact/src/__tests__/cache.test.ts`, `plugins/contact/src/__tests__/ensureEmployee.test.ts`, `plugins/contact-resources/src/__tests__/timezone.test.ts`.
- ws-tests (регрессия Postgres-сортировки по `$lookup.channels.lastMessage`): `ws-tests/api-tests/src/__tests__/contact-channels-sort.test.ts`.
- Sanity (Playwright): `tests/sanity/tests/contacts.spec.ts`, `tests/sanity/tests/contact.duplicate.spec.ts`; page-объекты - `tests/sanity/tests/model/contacts/*`, `tests/sanity/tests/model/leads/leads-page.ts`.

## Связанные документы

- [../memory/postgres-reverse-lookup-sort.md](../memory/postgres-reverse-lookup-sort.md) - баг сортировки по reverse lookup в Postgres, обнаружен на таблице Contacts/Employee, регрессия покрыта `contact-channels-sort.test.ts`.
- [../memory/billing-limits-enforcement.md](../memory/billing-limits-enforcement.md) - enforcement seat/plan-лимитов, от которых зависит создание Employee.
- [../billing-subscription-status-transitions.md](../billing-subscription-status-transitions.md) - источник лимитов подписки.
- [../disableFeatures.md](../disableFeatures.md) - полный список `DISABLED_FEATURES`, включая `lead`/`auto-translate`/`hide-ru-banned-channels`.
