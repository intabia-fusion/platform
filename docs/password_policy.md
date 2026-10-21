# Password Policy

Область: [Аутентификация, авторизация и онбординг](features/auth-onboarding.md)

## Overview

Политика сложности пароля принадлежит **account-сервису**: он выбирает пресет по `PASSWORD_STRICTNESS`, отдаёт его клиенту методом `getPasswordPolicy` и проверяет каждый пароль, который сохраняется. Один источник правил — нельзя обойти проверку запросом в обход UI, и UI не может требовать не то, что проверяет сервер.

Проверка стоит на всех путях записи пароля:

| Метод | Файл |
|---|---|
| `signUp` (deprecated, только dev без mail) | `server/account/src/operations.ts:366` |
| `signUpJoin` | `operations.ts:1449` |
| `validateOtp` (signup с паролем, `action !== 'verify'` и аккаунта ещё нет) | `operations.ts:505` |
| `changePassword` (после проверки старого пароля) | `operations.ts:1561` |
| `restorePassword` | `operations.ts:1666` |

`setPassword()` (`server/account/src/utils.ts:483`) остаётся без проверки: его же используют `dev/tool` и импорт, где политика не нужна.

Системные токены политику обходят: AI-бот регистрируется через `signUp` с `randomBytes(32).toString('hex')`, который не проходит `normal` (нет заглавной и спецсимвола), поэтому `assertPasswordPolicy` вызывается только для пользовательских токенов (`!isSystemToken(token)`).

Клиентская валидация осталась, но работает от данных сервера: `SignupForm.svelte`, `PasswordRestore.svelte`, `ChangePassword.svelte` строят правила из `login.metadata.PasswordValidations`, которую заполняет `ensurePasswordValidations()`. `LoginForm.svelte` не валидирует — он только проверяет пароль у бэкенда. Страница смены пароля в настройках (`plugins/setting-resources/src/components/Password.svelte`) правил не имеет и спрашивает результат через ресурс `login.function.ValidatePassword`, который возвращает первое нарушенное правило уже с текстом — тем же, что показывает логин-форма.

## Правила

`foundations/core/packages/account-client/src/password.ts` — `measurePassword()`, `getPasswordViolations()`, `isPasswordValid()`. Подсчёт Unicode-aware:

| Правило | Что считает |
|---|---|
| `MinLength` | длина в кодовых точках (`[...value].length`), не в UTF-16 единицах |
| `MinSpecialChars` | `/[^\p{L}\p{N}]/gu` — не буква и не цифра любого алфавита |
| `MinDigits` | `/\p{N}/gu` |
| `MinUpperChars` | `/\p{Lu}/gu` |
| `MinLowerChars` | `/\p{Ll}/gu` |

Следствия, которые надо помнить:

- кириллическая `П` — заглавная буква, а не спецсимвол; `Пароль123` удовлетворяет правилам регистра, но требует настоящий спецсимвол (`Пароль123!`);
- письменности без регистра (китайский, грузинский мхедрули) не могут выполнить `MinUpperChars`/`MinLowerChars` — это осознанное ограничение, для них нужен пресет `none` или отдельная политика;
- порядок правил фиксирован (`passwordRules`): первое нарушенное правило одно и то же в форме и в ответе сервера.

## Пресеты

`server/account/src/password.ts` — `passwordRequirements`:

| Пресет       | MinLength | MinDigits | MinSpecial | MinUpper | MinLower |
|--------------|-----------|-----------|------------|----------|----------|
| `very_strict`| 32        | 4         | 4          | 4        | 4        |
| `strict`     | 16        | 2         | 2          | 2        | 2        |
| `normal`     | 8         | 1         | 1          | 1        | 1        |
| `none`       | 0         | 0         | 0          | 0        | 0        |

Пресетов ровно четыре, отдельных `Min*` в env нет: чтобы получить точные пороги, правят `passwordRequirements` в `server/account/src/password.ts`.

## Configuration

`PASSWORD_STRICTNESS` задаётся **у account-пода** (не у front: front больше не знает про политику):

- `server/account-service/src/index.ts` — `parsePasswordStrictness(process.env.PASSWORD_STRICTNESS)` → `setMetadata(account.metadata.PasswordStrictness, ...)`; неизвестное значение пишет warn и включает `none`;
- `dev/docker-compose.yaml`, `tests/docker-compose.persona.yaml` — `PASSWORD_STRICTNESS=normal` у сервиса `account`;
- helm/чарты stand'ов — там же, в переменных account.

**Не задано = `none`.** Это осознанный дефолт: апгрейд не должен внезапно начать отклонять пароли, которые раньше разрешались. Оператор включает политику явно и без пересборки фронта.

### Путь до формы

Политика грузится **по требованию, а не на старте**: `configurePlatform` про неё больше не знает.

1. `ensurePasswordValidations()` (`plugins/login-resources/src/password.ts`) делает один RPC `getPasswordPolicy` (таймаут 2с, ошибка/старый под → `undefined`) и публикует результат в `login.metadata.PasswordValidations`. Промис кэширован на сессию, повторных запросов нет.
2. Вызывают его только экраны с паролем: `LoginApp.svelte` ждёт его перед рендером `signup`/`recovery`/`changePassword` (остальные экраны логина рисуются сразу), а страница настроек — через ресурс `login.function.ValidatePassword` при сохранении.
3. `getPasswordValidationRules()` (`plugins/login-resources/src/validations.ts`) строит `Field['rules']` из `login.metadata.PasswordValidations`: порог — из данных, подсчёт — из `measurePassword()`.

Итог по запросам: аноним на парольном экране — один запрос; залогиненный пользователь, который не меняет пароль, — ноль; в Settings → Password — один, ровно когда он нужен.

`getPasswordPolicy` публичный (вызывается до логина) и возвращает `{ strictness, validations }`. Пороги не секрет — они и раньше лежали в бандле; `strictness` клиент не использует и не должен (иначе вернётся второй источник порогов).

### Ответ на слабый пароль

Сервер бросает `platform.status.PasswordPolicyViolation` с `{ rule, count }` (`foundations/core/packages/platform/src/platform.ts`); текст есть во всех `platform/lang/*.json`. `mapPasswordPolicyStatus()` в `validations.ts` заменяет его на ту же строку `login.string.PasswordMin*`, которую показала бы форма. В обычном сценарии пользователь до этого не доходит — форма блокирует сабмит; статус видит только клиент в обход формы (curl) или клиент с устаревшей политикой.

В настройках проверка идёт до вызова `ChangePassword`: `ValidatePassword` возвращает `{ label, params }` первого нарушенного правила, и страница показывает его вместо общего `FailedToSave`.

## Тесты

- `foundations/core/packages/account-client/src/__tests__/password.test.ts` — подсчёт по латинице и кириллице, порядок нарушений, `none`.
- `server/account/src/__tests__/operations.test.ts` — `describe('password policy')`: `getPasswordPolicy`, отказ `restorePassword`/`changePassword`, `none` принимает всё, кириллица проходит правила регистра; `describe('signUp')`: системный токен (пароль AI-бота) политику обходит, пользовательский — нет.

## Gaps

- Нет истории паролей, ротации, проверки по утечкам (HIBP), zxcvbn-оценки.
- Recovery-токен (`operations.ts:1611`) выпускается без `exp` и не одноразовый: ссылка из письма живёт бессрочно и переиспользуется.
- `hashWithSalt()` — `pbkdf2Sync(password, salt, 1000, 32, 'sha256')` (`utils.ts:362`), 1000 итераций мало.

## Связанные документы

- [Аутентификация, авторизация и онбординг](features/auth-onboarding.md)
