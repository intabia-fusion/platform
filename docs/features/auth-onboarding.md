# Аутентификация, авторизация и онбординг

> Сверено с кодом: коммит 39ae47eb6f, 2026-09-23.

Подсистема отвечает за вход и регистрацию пользователя, управление токенами и ролями, создание/апгрейд воркспейсов, гостевой и публичный доступ, а также за удаление аккаунтов и воркспейсов (self-service и админское). Сущности: `Account`, `Person`, `SocialId`, `Workspace`/`WorkspaceStatus`, `Member`, `Token`, `PublicLink`. БД аккаунтов - Postgres/CockroachDB через `server/account/src/collections/postgres`.

## Где код

| Пакет | Путь | Роль |
| --- | --- | --- |
| account | `server/account/src` | ядро auth: операции логина/регистрации/инвайтов/удаления, роли, admin-операции |
| account-service | `server/account-service/src` | HTTP/RPC-сервис поверх `account` (роутинг методов, строки писем, presence) |
| pod-account | `pods/account/src` | исполняемый под, поднимает account-service |
| workspace-service | `server/workspace-service/src` | пайплайн создания/апгрейда/архивации/удаления воркспейса (воркер) |
| pod-workspace | `pods/workspace/src` | исполняемый под, поднимает workspace-service |
| auth-providers | `pods/authProviders/src` | OAuth-провайдеры (Google, GitHub, generic OpenID) поверх koa-passport |
| server-token | `foundations/core/packages/token/src` | подпись/верификация JWT-подобного токена, лицензия self-host |
| login | `plugins/login/src` | клиентский плагин: metadata, строки, `GET /providers` |
| login-resources | `plugins/login-resources/src` | UI логина/регистрации/восстановления/создания и удаления воркспейса |
| login-assets | `plugins/login-assets` | статические ресурсы плагина login |
| onboard | `plugins/onboard/src` | клиентский плагин мастера первого запуска |
| onboard-resources | `plugins/onboard-resources/src` | UI мастера онбординга (шаги Workspace/User/Finish) |
| onboard-assets | `plugins/onboard-assets` | статические ресурсы онбординга |
| admin | `plugins/admin/src` | клиентский плагин админ-панели |
| admin-resources | `plugins/admin-resources/src` | UI админки: вкладки Accounts/Workspaces/Billing/Audit/General |
| guest | `plugins/guest/src` | клиентский плагин публичных ссылок |
| guest-resources | `plugins/guest-resources/src` | UI публичных ссылок, гостевой вход |
| model-guest | `models/guest/src` | модель класса `PublicLink` |
| server-guest | `server-plugins/guest/src` | серверный триггер `OnPublicLinkCreate` |
| model-core | `models/core/src` | модель permission-классов (`definePermissions`) |
| sign | `plugins/sign` | подпись PDF; связь с auth только через JWT |
| pod-sign | `services/sign/pod-sign/src` | сервис подписи документов, резолвит аккаунт по токену через account-client |

## Модель данных

| Класс/интерфейс | Смысл | Файл |
| --- | --- | --- |
| `Account` | учётная запись (hash/salt пароля, blockedOn, failedLoginAttempts) | `server/account/src/types.ts` |
| `Person` | профиль человека (firstName/lastName/phoneHint) | `server/account/src/types.ts` |
| `SocialId` | идентификатор входа (email, oauth-провайдер) | `server/account/src/types.ts` |
| `Workspace` / `WorkspaceStatus` | воркспейс и его жизненный цикл (mode, deleteOn, backup-lease) | `server/account/src/types.ts` |
| `Member` | роль участника воркспейса | `server/account/src/types.ts` |
| `AdminAction` | запись аудита админ-действий | `server/account/src/types.ts` |
| `WorkspaceInvite` | инвайт/access-link | `server/account/src/types.ts` |
| `WorkspacePermission` | точечное разрешение вне ролей | `server/account/src/types.ts` |
| `LoginInfo` / `WorkspaceLoginInfo` | ответ логина клиенту (включая `deleteOn`) | `server/account/src/types.ts` |
| `Token` / `PermissionsGrant` | payload подписанного токена | `foundations/core/packages/token/src/token.ts` |
| `AccountRole` (enum) + `roleOrder` | 7 ролей и их "сила" | `foundations/core/packages/core/src/classes.ts` |
| `Permission` | базовый класс permission (role/scope/txMatch) | `foundations/core/packages/core/src/classes.ts` |
| `PublicLink` | публичная гостевая ссылка с restrictions | `models/guest/src/index.ts` |
| `License` / `LicenseEdition` | self-host лицензия (dev/community/licensed) | `foundations/core/packages/token/src/license.ts` |

## Как работает

**1. Логин паролем.**
1. Клиент шлёт email+пароль -> `login()` - `server/account/src/operations.ts`.
2. `verifyPassword()` сверяет scrypt-хеш, при неудаче - `recordFailedLoginAttempt()` (`server/account/src/utils.ts`); после `MAX_FAILED_LOGIN_ATTEMPTS` (default 5) аккаунт блокируется - `isAccountPasswordLocked()` (`utils.ts`).
3. `ensureNotBlocked()` (`utils.ts`) проверяет `Account.blockedOn` (админ-блокировка) - гейт стоит и здесь, и в `validateOtp`, `loginOrSignUpWithProvider`, `selectWorkspace`.
4. Генерируется токен - `generateToken()` (`token.ts`), клиент получает `{account, token, name, socialId}`.

**2. Вход по коду (OTP) и регистрация без пароля.**
1. `loginOtp()` (`operations.ts`) отправляет код на email; для незарегистрированного email ответ всё равно `{sent: true}` (анти-эниумерация).
2. `signUpOtp()` (`operations.ts`) создаёт `Person` + `SocialId(EMAIL)`.
3. `validateOtp()` (`operations.ts`) проверяет код и выдаёт токен.

**3. OAuth (Google/GitHub/OpenID).**
1. `pods/authProviders/src/index.ts` отдаёт список провайдеров на `GET /providers`.
2. Каждый провайдер регистрирует роуты `/auth/<provider>` и `/auth/<provider>/callback` через `koa-passport` - пример: `pods/authProviders/src/google.ts` (`GoogleStrategy` из `passport-google-oauth20`).
3. Callback резолвит/создаёт аккаунт через account-сервис и редиректит на front с токеном.

**4. Создание воркспейса и вход по инвайту.**
1. `createWorkspace()` (`operations.ts`) создаёт запись `Workspace`/`WorkspaceStatus` в режиме создания.
2. Воркер `workspace-service` (`server/workspace-service/src/service.ts`) опрашивает `getPendingWorkspace(region, version, operation)` и выполняет `createWorkspace()`/`upgradeWorkspace()` - `server/workspace-service/src/ws-operations.ts`. Режим `WS_OPERATION` (`create`/`upgrade`/`all`/`all+backup`) задаётся env, читается в `server/workspace-service/src/index.ts`.
3. Приглашённый проходит `join()`/`joinByInvite()`/`checkJoin()`/`checkAutoJoin()`/`signUpJoin()` (`operations.ts`).
4. Если аккаунт создан без инвайта - `sendCrmNotificationIfNotInvited()` (`operations.ts`).

**5. Удаление воркспейса и аккаунта (отложенное, FUSIO-1339).**
1. Владелец или админ инициирует `deleteWorkspace()`/`deleteAccount()` (`operations.ts`) с OTP-подтверждением (`sendOperationOtp`, `utils.ts`); гвард "единственный owner" - `findOrphanedWorkspaces()` (`server/account/src/deletion.ts`).
2. Ставится `deleteOn` (`DELETION_GRACE_DAYS`, default 21); первые `DELETION_READONLY_DAYS` (default 7) воркспейс доступен только на чтение (`extra.readonly` в токене).
3. Периодический sweep - `sweepScheduledDeletions()` (`deletion.ts`) переводит просроченные записи в `pending-deletion`; `workspace-service` физически удаляет БД, `purgeAccount()` (`deletion.ts`) обезличивает `person`/`social_id` и хард-удаляет `account`.
4. Отмена - `cancelAccountDeletion()` (`operations.ts`) или `performWorkspaceOperation('cancel-delete', ...)` (`server/account/src/serviceOperations.ts`). Подробности семантики purge, гвардов и найденных ловушек - `docs/memory/deferred-deletion.md`.

**6. Admin-операции и admin-сессия.**
1. Логин под email из `ADMIN_EMAILS`/`BILLING_EMAILS` кладёт в токен `extra.admin`/`extra.billingAdmin` - `isAdminEmail()` (`server/account/src/admin.ts`).
2. Разрушительные и приватные операции идут через единый гейт `requireAdminOp()` (`server/account/src/adminOp.ts`): human-логин (`isHumanAdminLogin`, `adminOp.ts`) + свежая `extra.mfaAt`-сессия (`hasAdminSession()`, `token.ts`, TTL `ADMIN_SESSION_TTL_SEC`) + rate-limited OTP (`verifyAdminOtpLimited()`, `adminOp.ts`).
3. Действие пишется в аудит - `logAdminAction()`/`listAdminActions()` (`serviceOperations.ts`).

## Фичи

### Логин и регистрация
- **Пароль с блокировкой после N попыток.** `login()`, `recordFailedLoginAttempt`/`isAccountPasswordLocked` - `server/account/src/operations.ts`, `server/account/src/utils.ts`.
- **Email OTP логин/регистрация.** `loginOtp`/`validateOtp`/`signUpOtp` - `server/account/src/operations.ts`.
- **Регистрация паролем (deprecated, только dev без mail-сервиса).** `signUp()`, флаг `hasSignUp` в `getMethods()` - `operations.ts`.
- **Восстановление и смена пароля.** `requestPasswordReset`/`restorePassword`/`changePassword` - `operations.ts`. Политика сложности пароля - только клиентская валидация, см. `docs/password_policy.md`.
- **OAuth Google/GitHub/OpenID Connect.** `pods/authProviders/src/{google,github,openid}.ts`.
- **Инвайты и access-ссылки.** `createInvite`/`sendInvite`/`resendInvite`/`createInviteLink`/`createAccessLink` (экспирация, email-маска, лимит мест, роль) - `operations.ts`.
- **Привязка social identity.** `addEmailSocialId`/`addHulyAssistantSocialId`/`refreshHulyAssistantToken`/`releaseSocialId` - `operations.ts`.

### Сессии и токены
- **Подписанный JSON-токен без refresh-механики.** `generateToken`/`decodeToken` - `foundations/core/packages/token/src/token.ts`; `exp` при обычном логине не проставляется.
- **LRU-кэш верифицированных токенов** (Map, max 4096) с повторной проверкой nbf/exp - `verifiedTokens` в `token.ts`.
- **Exchange legacy гостевого токена.** `exchangeGuestToken()` - `operations.ts`.
- **Admin-сессия по OTP-штампу.** `extra.mfaAt`, `hasAdminSession()`, `ADMIN_SESSION_TTL_SEC` (default 43200с) - `token.ts`.

### Авторизация
- **7 ролей и их "сила".** `AccountRole`, `roleOrder`, `getRolePower()` - `foundations/core/packages/core/src/classes.ts`, `server/account/src/utils.ts`.
- **Permission-модель класс/атрибут.** `definePermissions()` - `models/core/src/permissions.ts`.
- **Роли участника и назначаемые роли.** `Member`, `assignableRoles` (`Guest/User/Maintainer/Owner`), `updateWorkspaceRole` - `utils.ts`.
- **Временный грант в токене.** `PermissionsGrant` (обязательные nbf/exp) - `token.ts`.
- **Точечные workspace-права.** `batchAssignWorkspacePermission`/`batchRevokeWorkspacePermission`/`hasWorkspacePermission`/`getWorkspacePermissions` - `operations.ts`.
- **Password aging на воркспейс.** `updatePasswordAgingRule`/`checkPasswordAging` - `utils.ts`.
- **Админ-операции и имперсонация.** `admin*` в `serviceOperations.ts` (роли, maintenance, force-close, reindex, subscriptions, `adminImpersonate`).

### 2FA / гостевой доступ
- **Admin-OTP.** `requestAdminOtp`/`verifyAdminOtpLimited` (TTL 300с, лимит 5 неудач/300с) - `adminOp.ts`, `utils.ts`.
- **OTP-подтверждение для деструктивных операций.** `deleteWorkspace`/`leaveWorkspace` принимают `otpCode` - `operations.ts`.
- **Read-only гость на воркспейс.** `loginAsGuest`/`updateAllowReadOnlyGuests` - `operations.ts`, `utils.ts`.
- **Переключатель гостевой регистрации.** `updateAllowGuestSignUp` - `utils.ts`.
- **Публичные ссылки.** `PublicLink{restrictions{readonly, disableComments, disableNavigation, disableActions}}`, триггер `OnPublicLinkCreate` - `models/guest/src/index.ts`, `server-plugins/guest/src/index.ts`.

### Удаление аккаунта/воркспейса (FUSIO-1339)
- **Отложенное удаление с readonly-окном и sweep.** `deleteWorkspace`/`deleteAccount`/`sweepScheduledDeletions`/`purgeAccount` - `server/account/src/deletion.ts`, `operations.ts`.
- **Гвард "единственный owner".** `findOrphanedWorkspaces`, публичный RPC `canDeleteAccount` - `deletion.ts`, `operations.ts`.
- **Отмена удаления.** `cancelAccountDeletion`, `performWorkspaceOperation('cancel-delete'|'unarchive')` - `operations.ts`, `serviceOperations.ts`.
- **Немедленное удаление и блокировка админом.** `delete-now` (`WorkspaceUserOperation`), `adminSetAccountBlocked` - `serviceOperations.ts`; UI - `plugins/admin-resources/src/components/tabs/{Accounts,Workspaces}Tab.svelte`.
- **Аренда бэкапа перед удалением.** `updateBackupLease`/`workspace_status.backup_lease_until` - см. `docs/memory/deferred-deletion.md`. Детальная механика, миграции v43-v47, найденные баги - `docs/memory/deferred-deletion.md`, `docs/memory/account_db_migrations.md`.

### Администрирование и self-host
- **Единый admin-гейт.** `requireAdminOp`/`isHumanAdminLogin` - `server/account/src/adminOp.ts`.
- **Self-host лицензия.** `LicenseEdition` (dev/community/licensed), `COMMUNITY_MAX_USERS = 15`, RSA-подпись - `foundations/core/packages/token/src/license.ts`.
- **Бесплатные лимиты self-host.** `parseFreePlanLimits`/`getFreePlanLimits` - `server/account/src/freeLimits.ts`.
- **Мультирегиональность через env-конфиг.** `loadRegionConfig`/`resolveEndpoints`/`getRegionsFromConfig` - `server/account/src/region-config.ts`. См. `docs/region_config.md`.
- **Presence-трекинг.** `server/account-service/src/presence.ts`.

## Куда смотреть, если нужно...

- Изменить правило блокировки после неудачных логинов -> `server/account/src/utils.ts` (`isAccountPasswordLocked`), env `MAX_FAILED_LOGIN_ATTEMPTS`.
- Добавить нового OAuth-провайдера -> `pods/authProviders/src/` (новый файл по образцу `google.ts`) + регистрация в `pods/authProviders/src/index.ts`.
- Поменять политику пароля на клиенте -> `docs/password_policy.md`, компоненты `SignupForm.svelte`/`PasswordRestore.svelte`/`ChangePassword.svelte` в `plugins/login-resources/src/components`.
- Изменить окна отложенного удаления -> `server/account/src/deletion.ts` (`DELETION_GRACE_DAYS`/`DELETION_READONLY_DAYS`).
- Добавить admin-операцию -> `server/account/src/serviceOperations.ts`, обернуть в `requireAdminOp()` (`adminOp.ts`), не забыть `logAdminAction`.
- Поменять содержимое токена/добавить поле -> `foundations/core/packages/token/src/token.ts` (`Token`), `generateToken`/`decodeToken`.
- Изменить роли или их силу -> `foundations/core/packages/core/src/classes.ts` + `assignableRoles` в `server/account/src/utils.ts`.
- Поменять шаги мастера онбординга -> `plugins/onboard-resources/src/index.ts` (`OnboardSteps`), `components/`.
- Изменить письма об удалении/приглашениях -> `server/account/lang/*.json` + `accountStrings` в `server/account-service/src/index.ts`; паритет ключей проверяет `server/account/src/__tests__/lang.test.ts`.
- Изменить пайплайн создания/апгрейда воркспейса -> `server/workspace-service/src/ws-operations.ts`, режим - `WS_OPERATION` в `server/workspace-service/src/index.ts`.
- Изменить restrictions публичной гостевой ссылки -> `models/guest/src/index.ts`, `plugins/guest/src/utils.ts`.
- Изменить региональную конфигурацию -> `docs/region_config.md`, `server/account/src/region-config.ts`.

## Настройки и конфигурация

- `MAX_FAILED_LOGIN_ATTEMPTS` (default 5) - лимит неудачных попыток пароля.
- `ADMIN_SESSION_TTL_SEC` (default 43200 = 12ч) - TTL admin-сессии после OTP - `token.ts`.
- `ADMIN_OTP_TTL_SEC` / `ADMIN_OTP_DEV_CODE` - TTL и dev-код admin-OTP.
- `ADMIN_EMAILS` / `BILLING_EMAILS` - списки email для полного и billing-only admin доступа - `server/account/src/admin.ts`.
- `DELETION_GRACE_DAYS` (default 21) / `DELETION_READONLY_DAYS` (default 7) - окна отложенного удаления - `deletion.ts`.
- `DELETED_RETENTION_DAYS` - хранение архива удалённого воркспейса (backup pod).
- `WS_OPERATION` (`create`/`upgrade`/`all`/`all+backup`) - режим воркера workspace-service - `server/workspace-service/src/index.ts`.
- `COMMUNITY_MAX_USERS = 15` - лимит self-host community-редакции лицензии - `license.ts`.
- Метаданные плагина `login`: `Secret` (HMAC-секрет токена), `PasswordValidations`, `UsageUrl`/`SupportUrl`/`LicenseUrl`/`UserAgreementUrl` и др. - `plugins/login/src/index.ts`.

## Тесты

- Unit: `server/account/src/__tests__/` - `operations.test.ts`, `utils.test.ts`, `admin-access.test.ts`, `admin-email.test.ts`, `deferred-deletion.test.ts`, `deletion-real.test.ts`, `account-block.test.ts`, `backup-lease-real.test.ts`, `lang.test.ts`, `migrations.test.ts`, `postgres.test.ts`/`postgres-real.test.ts`.
- Unit токена: `foundations/core/packages/token/src/__tests__/token.test.ts`.
- Sanity (Playwright): `tests/sanity/tests/login.spec.ts`, `tests/sanity/tests/workspace/onboarding-workspace.spec.ts`, `tests/sanity/tests/workspace/workspace-settings.spec.ts`, page-объекты `tests/sanity/tests/model/login-page.ts`, `tests/sanity/tests/model/select-workspace-page.ts`.
- ws-tests (Docker, реальный стенд): `ws-tests/api-tests/src/__tests__/identity-deletion.test.ts`, `account-blocking.test.ts`, `deletion-emails.test.ts`; `ws-tests/sanity/tests/workspace/deletion.spec.ts`.
- qms-tests: `qms-tests/sanity/tests/auth/`.

## Связанные документы

- [../password_policy.md](../password_policy.md) - политика сложности пароля на клиенте.
- [../region_config.md](../region_config.md) - мультирегиональная конфигурация endpoint'ов.
- [../memory/account_db_migrations.md](../memory/account_db_migrations.md) - правила миграций account DB (cockroach-специфика).
- [../memory/deferred-deletion.md](../memory/deferred-deletion.md) - модель отложенного удаления, аренда бэкапа, письма, ловушки.
- [../memory/admin_plugin_refactor.md](../memory/admin_plugin_refactor.md) - вынос админки из login в отдельный плагин `admin`.
