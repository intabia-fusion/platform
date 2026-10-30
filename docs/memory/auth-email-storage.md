# AuthEmail читается напрямую из localStorage

Область: [Аутентификация, авторизация и онбординг](../features/auth-onboarding.md)

- `setMetadataLocalStorage` кладёт строку в localStorage как есть, а `fetchMetadataLocalStorage` всегда её `JSON.parse`-ит (`packages/ui/src/utils.ts:31-56`). Значение из одних цифр возвращается числом, и всё длиннее 2^53 теряет цифры (`12345678901234567890` -> `12345678901234567000`); `1e5` -> `100000`.
- Поэтому `readAuthEmail` (`plugins/login-resources/src/utils.ts`) читает `localStorage` напрямую, без метаданных: `AuthEmail` — всегда строка, и в форме это ровно то, что ввёл пользователь. `getMetadata(login.metadata.AuthEmail)` нигде не читается.
