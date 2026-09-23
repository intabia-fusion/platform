# Password Policy

Область: [Аутентификация, авторизация и онбординг](features/auth-onboarding.md)

## Overview

Password policy enforced only on client side (login UI). Server (`server/account`) does not validate password complexity - `setPassword()` (`server/account/src/utils.ts`) only checks that the password is a non-empty string.

Validation applies in three forms: `SignupForm.svelte` (registration), `PasswordRestore.svelte` (password reset via recovery link), `ChangePassword.svelte` (change current password). `LoginForm.svelte` itself does not validate - it only checks the existing password against the backend.

## Components

### Rule generator

`plugins/login-resources/src/validations.ts` - `getPasswordValidationRules()` builds rules from metadata `login.metadata.PasswordValidations`.

Five rules, all "min count of chars": `MinLength` (overall length), `MinSpecialChars` (`/[^a-zA-Z0-9]/g`), `MinDigits` (`/[0-9]/g`), `MinUpperChars` (`/[A-Z]/g`), `MinLowerChars` (`/[a-z]/g`).

No max length. No char blacklist. No dictionary / breach check. No repeat-char limit.

### Metadata declaration

`plugins/login/src/index.ts`:
```ts
PasswordValidations: '' as Metadata<{
  MinLength: number
  MinSpecialChars: number
  MinDigits: number
  MinUpperChars: number
  MinLowerChars: number
}>
```

Localized rule descriptions live next to it: `string.PasswordMinLength`, `PasswordMinSpecialChars`, `PasswordMinDigits`, `PasswordMinUpperChars`, `PasswordMinLowerChars`, each taking a `{ count }` param.

## Configuration

### Source

`dev/prod/src/platform.ts` - `PASSWORD_REQUIREMENTS` map, four presets:

| Preset       | MinLength | MinDigits | MinSpecial | MinUpper | MinLower |
|--------------|-----------|-----------|------------|----------|----------|
| `very_strict`| 32        | 4         | 4          | 4        | 4        |
| `strict`     | 16        | 2         | 2          | 2        | 2        |
| `normal`     | 8         | 1         | 1          | 1        | 1        |
| `none`       | 0         | 0         | 0          | 0        | 0        |

Applied at boot in `dev/prod/src/platform.ts`:
```ts
setMetadata(login.metadata.PasswordValidations, PASSWORD_REQUIREMENTS[config.PASSWORD_STRICTNESS ?? 'none'])
```

### Where to set the param

Field `PASSWORD_STRICTNESS` in the front config JSON (served by front pod on `GET /config.json`): `dev/prod/public/config.json` (local dev stand), `dev/prod/public/config-test.json` (test stand), `pods/front/dist/config-test.json` (built front pod). Desktop client config has the same field in `desktop/src/ui/types.ts`.

All of the above are currently set to `"none"` - no enforcement. To enable, change the value to `"normal" | "strict" | "very_strict"` in the config JSON the front pod serves.

### Custom values (not preset)

To pick exact min-counts outside the four presets, edit `PASSWORD_REQUIREMENTS` in `dev/prod/src/platform.ts`. There is no env / runtime override for individual `Min*` fields.

## Gaps

- No env var pipeline: `PASSWORD_STRICTNESS` is only read from the static config JSON, not from container env - the `/config.json` handler in `server/front/src/index.ts` never reads `process.env.PASSWORD_STRICTNESS`. To make it env-configurable, extend that handler to read the env var and include it in the served `data`.
- Server has no enforcement - a modified client or direct API call bypasses all rules. For real policy, add validation in `server/account/src/operations.ts` on the signup / changePassword / restorePassword paths.
- No password history, no rotation, no breach (HIBP) check, no min-entropy / zxcvbn-style scoring.

## Связанные документы

- [Аутентификация, авторизация и онбординг](features/auth-onboarding.md)
