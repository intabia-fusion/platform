# Платформа: рабочее место, настройки, экспорт, бэкап, desktop

> Сверено с кодом: коммит 39ae47eb6f, 2026-09-23.

Пользовательский каркас платформы: левая панель приложений и навигатор (workbench), сайдбар с виджетами и вкладками, настройки аккаунта/воркспейса (setting), персональные предпочтения (preference), экспорт данных в файл или в другой воркспейс, резервное копирование/восстановление и Electron-приложение для десктопа. Сущности: `Application`, `Widget`/`WidgetPreference`, `WorkbenchTab`, `SettingsCategory`, `Integration`, `Preference`, `BackupInfo`.

## Где код

| Пакет | Путь | Роль |
| --- | --- | --- |
| models/workbench | `models/workbench/src` | модель `Application`/`Widget`/`WidgetPreference`/`WorkbenchTab`/`HiddenApplication`, actions вкладок |
| plugins/workbench | `plugins/workbench/src` | типы (`Application`, `Widget`, `NavigatorModel`, `WidgetTab`), plugin-id |
| plugins/workbench-resources | `plugins/workbench-resources/src` | UI: `Workbench.svelte`, сайдбар/виджеты, вкладки, `connect.ts` (подключение к воркспейсу) |
| models/setting | `models/setting/src` | модель категорий настроек, `Integration`/`IntegrationType`, `InviteSettings`/`OfficeSettings`, мискины редактора классов и типов спейсов |
| plugins/setting | `plugins/setting/src` | типы категорий/интеграций, `spaceTypeEditor.ts` |
| plugins/setting-resources | `plugins/setting-resources/src` | UI настроек: `Settings.svelte`, `ClassSetting`, `ManageSpaceTypes`, `Backup.svelte`, `General.svelte`, `Profile.svelte` |
| server-plugins/setting | `server-plugins/setting/src` | описание серверных функций/триггера (интерфейс плагина) |
| server-plugins/setting-resources | `server-plugins/setting-resources/src` | реализация: template fields интеграций, триггер `OnRoleNameUpdate` |
| models/preference | `models/preference/src` | базовые классы `Preference`/`SpacePreference` |
| plugins/preference | `plugins/preference/src` | типы (`-resources` пакета нет, потребители реализуют UI сами) |
| models/desktop-preferences | `models/desktop-preferences/src` | `TDesktopNotificationPreference`, группа в Notification Preferences |
| plugins/desktop-preferences | `plugins/desktop-preferences/src` | типы desktop-уведомлений |
| models/desktop-downloads | `models/desktop-downloads/src` | регистрация `WorkbenchExtension` для панели загрузок |
| plugins/desktop-downloads | `plugins/desktop-downloads/src` | `DownloadItem`, IPC-функция `HandleDownloadItem` |
| plugins/export | `plugins/export/src` | типы (`TransformConfig`, `RelationDefinition`, `ExportResultRecord`), plugin-id |
| plugins/export-resources | `plugins/export-resources/src` | UI (`ExportSettings`, `ExportButton`, `ExportToWorkspaceModal`) + клиент к pod-export |
| services/export/pod-export | `services/export/pod-export/src` | сервис экспорта: `/exportAsync`, `/exportSync`, `/export-to-workspace` |
| server/backup | `server/backup/src` | движок бэкапа/восстановления, аренда, ревизия индекса, чистка удалённых воркспейсов |
| server/backup-service | `server/backup-service/src` | обвязка `backupService`/`doBackupWorkspace` конфигом и storage-адаптерами |
| pods/backup | `pods/backup/src` | под периодического бэкапа (`startBackup`) |
| services/backup/backup-api-pod | `services/backup/backup-api-pod/src` | REST для UI `Backup.svelte`: список файлов снапшота, скачивание |
| desktop | `desktop/src` | Electron: `main/*` (окно, трей, автообновление, IPC) и `ui/*` (renderer, preload) |
| desktop-package | `desktop-package/src` | сборка/подпись дистрибутива, дист-сервер обновлений |

## Модель данных

| Символ | Смысл | Файл |
| --- | --- | --- |
| `Application` (`TApplication`) | приложение левой панели: label/icon/alias/position/hidden/accessLevel/order | `models/workbench/src/index.ts` |
| `ApplicationNavModel` | навигационная модель, расширяет `Application` (`extends: Ref<Application>`) | `models/workbench/src/index.ts` |
| `HiddenApplication` | персональный `Preference`, скрывает приложение из панели | `models/workbench/src/index.ts` |
| `SpaceView` (mixin) | вешает `ViewConfiguration` на класс спейса | `models/workbench/src/index.ts` |
| `Widget`/`WidgetType` | виджет сайдбара: Fixed/Flexible/Configurable, component/tabComponent | `models/workbench/src/index.ts`, `plugins/workbench/src/types.ts` |
| `WidgetPreference` | включён ли виджет на воркспейс (создаётся при первом добавлении) | `models/workbench/src/index.ts` |
| `WorkbenchTab` | вкладка на аккаунт: attachedTo/location/isPinned | `models/workbench/src/index.ts` |
| `WidgetTab` | вкладка внутри виджета, 3 состояния preview/kept/pinned | `plugins/workbench/src/types.ts` (детали - `docs/memory/sidebar-widget-tabs.md`) |
| `SettingsCategory`/`WorkspaceSettingCategory` | категория настроек: name/label/component/role/feature/group | `models/setting/src/index.ts` |
| `Integration`/`IntegrationType` | интеграция воркспейса: type/disabled/value/shared; тип: allowMultiple/kind/компоненты connect-reconnect-configure | `models/setting/src/index.ts` |
| `Editable`/`UserMixin`/`ClassifierOrder` | мискины: редактируемость класса, удаление кастомных классов, порядок миксинов в редакторе | `models/setting/src/index.ts` |
| `SpaceTypeEditor`/`SpaceTypeCreator` | секции редактора типа спейса (general/properties/roles) | `models/setting/src/index.ts` |
| `InviteSettings`/`OfficeSettings`/`WorkspaceSetting` | конфигурация приглашений, дефолты офиса, иконка/имя воркспейса | `models/setting/src/index.ts` |
| `Preference`/`SpacePreference` | базовый персональный настройка (`attachedTo`) и её сужение до `Ref<Space>` | `models/preference/src/index.ts` |
| `DesktopNotificationPreference` | showNotifications/playSound/bounceAppIcon/showUnreadCounter | `models/desktop-preferences/src/index.ts` |
| `DownloadItem` | состояние загрузки в desktop: key/state/receivedBytes/totalBytes/savePath | `plugins/desktop-downloads/src/types.ts` |
| `TransformConfig`/`RelationDefinition`/`ExportResultRecord` | правила трансформации при экспорте между воркспейсами, лог результата | `plugins/export/src/types.ts` |
| `BackupInfo` (+ `revision`) | индекс бэкапа: снапшоты, домены, ревизия для контроля конкурентной записи | `server/backup/src/types.ts` |
| `BackupConfig.DeletedRetentionDays` | сколько дней хранить архив удалённого воркспейса (0 = не чистить) | `server/backup/src/service.ts` |

## Как работает

1. **Переключение приложения в левой панели.** Клик по иконке в `Applications.svelte` (`<NavLink app={app.alias}>`) меняет location -> `Workbench.svelte` вызывает `buildNavModel` (`plugins/workbench-resources/src/utils.ts`), который мёрджит `Application` с найденным по `extends` `ApplicationNavModel` в единый `NavigatorModel`. Программная навигация (шорткаты, действия) идёт через action `Navigate` (`createNavigateAction`, `models/workbench/src/index.ts`, impl `workbench.actionImpl.Navigate`).
2. **Открытие виджета сайдбара.** `WidgetsBar.svelte` вызывает `openWidget` из `sidebar.ts`; первое включение виджета создаёт `WidgetPreference` (`AddWidgetsPopup.svelte`). Открытие объекта внутри виджета - `createWidgetTab` (`sidebar.ts`): для существующего `id` таб фокусируется, иначе заменяет preview-таб виджета или добавляется новым (модель состояний - `docs/memory/sidebar-widget-tabs.md`).
3. **Подключение к воркспейсу и фильтр DISABLED_FEATURES.** `connect()` в `plugins/workbench-resources/src/connect.ts` селектит воркспейс, затем считает `effectiveDisabledFeatures = globalDisabledFeatures \ workspace.disabledFeaturesOverride` (`connect.ts`) и кладёт результат в `presentation.metadata.DisabledFeatures` - им пользуется `isDisabled()` (`packages/presentation/src/utils.ts`), скрывающий категории в `Settings.svelte`. Запрос social id воркспейса запускается параллельно с открытием сокета (`socialIdsPromise`, `connect.ts`) и дожидается только перед `ensureEmployee` (`connect.ts`).
4. **Отложенное удаление воркспейса/аккаунта (self-service).** Кнопка "Delete workspace" в `General.svelte` (видна только владельцу, `General.svelte`) и "Delete account" в `Profile.svelte` запрашивают код подтверждения через общий `OtpConfirmDialog` (`packages/presentation/src/components/OtpConfirmDialog.svelte`, вызывается из `requestOperationOtpCode`, `plugins/setting-resources/src/utils.ts`), затем зовут account-API (`deleteAccount`, `getDeletionPolicy`, `canDeleteAccount`). Полная механика grace/readonly-периодов, писем и guard "последний owner" - в server/account, см. `docs/memory/deferred-deletion.md`.
5. **Периодический бэкап воркспейса.** `BackupWorker` (`server/backup/src/service.ts`) по расписанию берёт активные воркспейсы; `doBackup(..., withLease=true)` сначала берёт аренду (`updateBackupLease(..., 'acquire')`, `service.ts`), затем каждые 30с продлевает её и при двух подряд ошибках или смене режима воркспейса отменяет бэкап (`isCanceled: () => leaseLost`, `service.ts`). Запись индекса `backup.json.gz` (`writeBackupInfo`, `server/backup/src/backup.ts`) перед каждой записью перечитывает файл и сверяет `revision` (`revisionIsOurs`, `backup.ts`) - если индекс успел поменять другой писатель (workspace-service архивация), прогон отменяется без перезаписи. После удаления воркспейса `cleanupDeletedBackups` (`service.ts`) по истечении `DeletedRetentionDays` удаляет файлы архива поштучно по списку из индекса, не префиксным sweep-ом (`removeBackupFiles`, `service.ts`). Детали и найденные ловушки - `docs/memory/backup_index_revision_guard.md`.
6. **Экспорт документов в другой воркспейс.** Кнопка на объекте зовёт `exportToWorkspace` (`plugins/export-resources/src/export.ts`), которая шлёт `POST {ExportUrl}/export-to-workspace` с `_class`/`query`/`relations`/`fieldMappers` в `pod-export` (`services/export/pod-export/src/server.ts`); там же живут `/exportAsync` (экспорт в файл в Drive) и `/exportSync` (синхронный CSV-ответ, использует `ExportButton.svelte`). Результат кросс-воркспейсной операции логируется в `ExportResultRecord` и уведомляет получателя (`ImportedDocumentsNotification`).

## Фичи

### Workbench

- **Виджеты сайдбара (Fixed/Flexible/Configurable).** Панель `WidgetsBar.svelte` + попап `AddWidgetsPopup.svelte` управляют включением через `WidgetPreference`. - `models/workbench/src/index.ts`, `plugins/workbench-resources/src/components/sidebar/widgets/`.
- **Три состояния вкладки виджета** (preview/kept/pinned), детерминированные id по объекту. - `plugins/workbench-resources/src/sidebar.ts`, см. `docs/memory/sidebar-widget-tabs.md`.
- **Вкладки воркбенча на аккаунт** (`WorkbenchTab`) с pin/unpin/close. - `WorkbenchTabs.svelte`, `WorkbenchTabPresenter.svelte`, actions `PinTab`/`UnpinTab`/`CloseTab`/`CloseCurrentTab` (`models/workbench/src/index.ts`).
- **Переключатель приложений и меню выбора воркспейса.** - `AppSwitcher.svelte`, `SelectWorkspaceMenu.svelte`, `plugins/workbench-resources/src/components/`.
- **"Client statistics" (ServerManager).** Попап агрегированной клиентской статистики сессии, доступен из настроек/действий. - `models/workbench/src/index.ts`, `ServerManager.svelte`.
- **Расширенный Help & Support.** Help Center, Keyboard Shortcuts, Contact Support, Open Platform Guide. - `HelpAndSupport.svelte`, строки в `plugins/workbench-resources/src/plugin.ts`.
- **Intabia-акцентные темы.** `intabia` (#cf13a2), `intabia2` (#6b3ad3) в списке акцентов. - `Themes.svelte`.

### Settings

- **Категории настроек аккаунта и воркспейса** (Profile/Password/Integrations/Mailboxes; General/Backup/Members/Configure/Classes/Relations/Enums/InviteSettings/Export/OfficeSettings/SpaceTypes), каждая с `role` (минимальная роль доступа) и опциональным `feature` для скрытия. - `models/setting/src/index.ts`.
- **Интеграции.** Универсальная карточка подключения/переподключения/настройки стороннего сервиса с `IntegrationType` (allowMultiple/kind/компоненты). - `Integrations.svelte`, `plugins/setting-resources/src/components/integrations/`.
- **Управление типами спейсов и ролями.** `ManageSpaceTypes.svelte` + `SpaceTypeEditor.svelte` + `RoleEditor.svelte` (секции general/properties/roles). - `plugins/setting-resources/src/components/spaceTypes/`.
- **Редактор классов (Classes).** Просмотр/скрытие атрибутов, кастомные миксины, порядок классификаторов. - `ClassSetting.svelte`, actions `HideAttribute`/`ShowAttribute`/`CreateMixin`/`DeleteMixin`.
- **Самостоятельное удаление воркспейса/аккаунта.** Кнопка в Danger Zone (только владелец), диалог подтверждения с озвученными grace/readonly-периодами (`getDeletionPolicy`), guard на единственного владельца в `Profile.svelte`. - `General.svelte`, `Profile.svelte` (`isLastOwner`, `deleteAccount`), подробности - `docs/memory/deferred-deletion.md`.
- **OTP-подтверждение чувствительных операций.** Общий `OtpConfirmDialog` (запрос кода на email). - `plugins/setting-resources/src/utils.ts`, `packages/presentation/src/components/OtpConfirmDialog.svelte`.
- **Server-пакет `server-setting`.** Presenter интеграции, template fields (Value/OwnerFirstName/ OwnerLastName/Position), триггер `OnRoleNameUpdate`. - `server-plugins/setting/src/index.ts`, `server-plugins/setting-resources/src/index.ts`.

### Preferences

- **Базовый тип `Preference`/`SpacePreference`.** Переиспользуется всеми пер-аккаунт настройками (скрытые приложения, виджеты, вкладки, desktop-уведомления). - `models/preference/src/index.ts`.
- **Desktop-уведомления.** Показ/звук/bounce иконки/счётчик непрочитанных, отдельная группа в Notification Preferences. - `models/desktop-preferences/src/index.ts`.
- **Тема и акцентный цвет.** Light/dark + выбор акцента (включая темы Intabia). - `Themes.svelte`.

### Export

- **Экспорт в файл (Drive).** `ExportSettings.svelte` - выбор класса (Issues/Milestones/Documents/ TestCases/TestRuns/TestPlans), формата (JSON/CSV), уровня детализации; асинхронно через `/exportAsync` с уведомлением по готовности. - `plugins/export-resources/src/components/ExportSettings.svelte`.
- **Быстрый CSV-экспорт текущей выборки.** `ExportButton.svelte` зовёт `/exportSync`, получает файл сразу в ответе (`Content-Disposition`). - `plugins/export-resources/src/components/ExportButton.svelte`.
- **Экспорт документов в другой воркспейс.** `ExportToWorkspaceModal.svelte` с настройкой связей (`RelationDefinition`) и правил трансформации полей; пропуск archived/deleted/obsolete через `shouldSkipDocument`/`isEffectiveDocument`. - `plugins/export/src/utils.ts`, `services/export/pod-export/src/server.ts`.

### Backup / restore

- **Периодический бэкап с арендой.** Один под-владелец бэкапа воркспейса за раз (аренда 150с, продление каждые 30с), иначе конкурентный запуск workspace-service архивации ломает индекс. - `server/backup/src/service.ts`, `docs/memory/backup_index_revision_guard.md`.
- **Контроль ревизии индекса.** Любая запись `backup.json.gz` проверяет, что файл не изменился с последнего чтения (`revisionIsOurs`), иначе прогон отменяется без перезаписи чужих данных. - `server/backup/src/backup.ts`.
- **Чистка бэкапов удалённых воркспейсов.** По истечении `DeletedRetentionDays` (0 = выключено) снимает файлы архива по списку из индекса и сбрасывает `backupInfo` в account. - `server/backup/src/service.ts`.
- **UI снапшотов бэкапа.** Список файлов/размеров текущего снапшота и скачивание, доступно владельцу воркспейса. - `plugins/setting-resources/src/components/Backup.svelte`, `services/backup/backup-api-pod/src/server.ts`.
- **Восстановление account-домена.** `restore()` дополнительно восстанавливает person/socialId из бэкапа. - `server/backup/src/restore.ts`, `server/backup/src/accountRemap.ts`.

### Desktop (Electron)

- **Одноэкземплярный запуск + отдельный DEV_INSTANCE.** `requestSingleInstanceLock`, раздельный `userData`. - `desktop/src/main/start.ts`.
- **Персистентная сессия с патчем cookie SameSite.** Partition `persist:huly`/`persist:huly_dev`, `handleSetCookie` на `onHeadersReceived`. - `desktop/src/main/start.ts`.
- **Трей, автозапуск, сохранение геометрии окна.** `TrayController`/`Settings` классы. - `desktop/src/main/tray.ts`, `desktop/src/main/settings.ts`.
- **Пайплайн загрузок.** `will-download` в main-процессе генерирует ключ и шлёт прогресс/завершение в renderer через `IpcMessage.HandleDownloadItem`, модель `DownloadItem`. - `desktop/src/main/start.ts`, `plugins/desktop-downloads/src/types.ts`.
- **Скриншаринг и бейдж непрочитанных.** `SetBadge` на иконке/доке, `GetScreenSources`/`GetScreenAccess` (desktopCapturer). - `desktop/src/main/start.ts`.
- **Автообновление (electron-updater) с диалогом на русском.** Канал через `resolveUpdateFeed` (`updateChannel.ts`), диалог "Обновить и перезапустить" - `desktop/src/main/start.ts`. Полная цепочка до дист-сервера и разобранные баги multi-range/ дефолтного канала - `docs/memory/desktop-update-system.md`.
- **macOS-подпись и нотаризация.** Инструкция для self-hosted сборки. - `docs/macos_signing.md`.

### Отключение фич (DISABLED_FEATURES)

- **Глобальное отключение через env фронта.** Список ключей (auto-translate, github, mailboxes, export, integration, backup, invites, documents, calendar, inventory, survey, lead, products, telegram, recruit, training, testManagement, process, cards, hide-ru-banned-channels) - полный перечень и семантика в `docs/disableFeatures.md`.
- **Скрытие категорий настроек по `feature`.** `SettingsCategory.feature` + `isDisabled()` в `Settings.svelte`. - `plugins/setting/src/index.ts`.
- **Переопределение на уровне воркспейса.** Админ может точечно вернуть отключённую глобально фичу конкретному воркспейсу (`disabledFeaturesOverride`), правится в admin-панели (`WorkspaceDetails.svelte`), учитывается в `connect.ts`. - `server/account/src/types.ts`, `plugins/admin-resources/src/components/WorkspaceDetails.svelte`.

## Куда смотреть, если нужно...

- Добавить приложение в левую панель -> `createDoc(workbench.class.Application, ...)` по образцу существующих в моделях приложений; навигация - `ApplicationNavModel` рядом.
- Добавить новый виджет сайдбара -> `models/workbench/src/index.ts` (`TWidget`), компонент - зарегистрировать в модели соответствующего плагина, тип Fixed/Flexible/Configurable выбрать по `WidgetType` (`plugins/workbench/src/types.ts`).
- Добавить категорию настроек -> `builder.createDoc(setting.class.SettingsCategory or WorkspaceSettingCategory, ...)` в `models/setting/src/index.ts`, компонент в `setting-resources`.
- Добавить новую интеграцию -> `IntegrationType` с компонентами create/reconnect/configure - `models/setting/src/index.ts`, UI - `plugins/setting-resources/src/components/integrations/`.
- Изменить правило удаления воркспейса/аккаунта -> UI в `General.svelte`/`Profile.svelte`, политика/письма - server/account, см. `docs/memory/deferred-deletion.md`.
- Изменить логику бэкапа/аренды -> `server/backup/src/service.ts` (`BackupWorker.doBackup`), запись индекса - `server/backup/src/backup.ts` (`writeBackupInfo`).
- Добавить поле трансформации при экспорте в другой воркспейс -> `TransformConfig`/ `RelationDefinition` (`plugins/export/src/types.ts`), обработка - `services/export/pod-export/src/transformer.ts`.
- Поменять поведение автообновления desktop -> `desktop/src/main/updater.ts`, `desktop/src/main/updateChannel.ts`, дист-сервер - `desktop-package/src/distServer.ts`.
- Добавить ключ в DISABLED_FEATURES -> обновить `docs/disableFeatures.md` и фильтр там, где фича реально проверяется (`isDisabled()`/ручные проверки по имени фичи).

## Настройки и конфигурация

- `DISABLED_FEATURES` (front) - глобальный список отключённых фич, см. `docs/disableFeatures.md`.
- `disabledFeaturesOverride` (per-workspace, admin-панель) - точечное включение фичи для воркспейса.
- `BACKUP_URL` (front/desktop, metadata `setting.metadata.BackupUrl`) - адрес `backup-api-pod` для UI снапшотов.
- `ExportUrl` (metadata `exportPlugin.metadata.ExportUrl`) - адрес `pod-export`.
- `DeletedRetentionDays` (`BackupConfig`, backup-под) - сколько дней хранить архив удалённого воркспейса; 0 и меньше выключает чистку.
- `DESKTOP_UPDATES_CHANNEL`/`DESKTOP_UPDATES_CHANNELS` - канал автообновления desktop (дефолт `latest`).

## Тесты

- Unit: `server/backup/src/__tests__/` (`backup-index-guard`, `backup-lease`, `storage-cleanup`, `stream-errors`); `services/export/pod-export/src/__tests__/` (`workspace-exporter`, `data-mapper`, `attachment-exporter`); `desktop/src/__test__/main/` и `.../ui/` (`updateChannel`, `settings`, `trayUtils`, `config`, ...); `desktop-package/src/__test__/` (`distServer`, `verifyManifests`).
- api-tests: `api-tests/backup/src/__tests__/` (`backup-incremental`, `backup-retention`, `backup-service`); `api-tests/api/src/__tests__/identity-deletion.test.ts`, `deletion-emails.test.ts`.
- Sanity (Playwright): `tests/sanity/tests/settings.spec.ts`, `tests/sanity/tests/workbench.spec.ts`, `tests/sanity/tests/workspace/workspace-settings.spec.ts`, `tests/sanity/tests/workspace/class-settings-navigation.spec.ts`; page-объекты - `tests/sanity/tests/model/settings-page.ts`, `tests/sanity/tests/model/workspace/workspace-settings-page.ts`.

## Связанные документы

- [../architecture.md](../architecture.md) - как плагин/модель/server-plugin/pipeline связаны на уровне платформы.
- [../disableFeatures.md](../disableFeatures.md) - полный список ключей `DISABLED_FEATURES`.
- [../connection_reconnect.md](../connection_reconnect.md) - жизненный цикл клиентского WebSocket-соединения (использует `connect()` из workbench-resources).
- [../macos_signing.md](../macos_signing.md) - подпись и нотаризация desktop-сборки для macOS.
- [../memory/desktop-update-system.md](../memory/desktop-update-system.md) - цепочка автообновления Electron-приложения и разобранные баги.
- [../memory/sidebar-widget-tabs.md](../memory/sidebar-widget-tabs.md) - модель состояний вкладок сайдбар-виджетов.
- [../memory/backup_index_revision_guard.md](../memory/backup_index_revision_guard.md) - аренда бэкапа и защита индекса от конкурентной записи.
- [../memory/deferred-deletion.md](../memory/deferred-deletion.md) - отложенное удаление воркспейсов/аккаунтов, grace/readonly-периоды.
