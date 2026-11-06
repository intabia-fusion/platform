# Идентичность Юли ИИ в данных

Область: [AI](../features/ai.md)

- Отдельного класса/флага «бот» нет: Юля - обычный аккаунт в account DB + `contact.Person` с миксином `Employee` в каждом воркспейсе. Единственный маркер - email-социальный идентификатор `aiBotAccountEmail` (`foundations/core/packages/core/src/component.ts`), из него строится `aiBotEmailSocialKey = email:<address>`.
- Аккаунт создаёт сам под при первом обращении к воркспейсу (`services/ai-bot/pod-ai-bot/src/utils/account.ts`): `signUp` случайным паролем, затем `assignWorkspace`; `Person` в воркспейсе - общий `ensureEmployee` (`plugins/contact/src/utils.ts`).
- `ensureEmployee` не синхронизирует изменившийся `value`/`key` социального идентификатора: обновляет только `verifiedOn`, `attachedTo` и удаление. Поэтому смена адреса бота требует и SQL-миграции account DB (`social_id.value`), и миграции модели contact в каждом воркспейсе - иначе UI, серверный триггер и notifications перестают находить бота по ключу, а вебхуки продолжают отдавать старый email.
- В account DB `key` - generated stored column (`type || ':' || value`), а `_id` от значения не зависит: переименование `value` не рвёт `createdBy`/`modifiedBy`, упоминания, `otp` и `integration_secrets`.
- По этому email бота узнают: `IdentityMiddleware` (право писать от имени людей), `seatLimits`/`limitsProvider` (не занимает место), billing usage, notifications (не уведомлять саму), mail blocklist, исходящие вебхуки (`assignee` - email персоны).
- Адрес бота намеренно не является валидным email: домен `platform` одноуровневый, поэтому `isEmail` (`server/account/src/utils.ts`) его отвергает. Это решение тимлида: `signUp` формат не проверяет, ящик с таким именем создать нельзя, письма режет blocklist; но внешние получатели вебхуков могут считать `assignee` битым.
