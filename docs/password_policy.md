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

`plugins/login/src/index.ts` - `passwordRequirements` map, four presets (shared by web and desktop):

| Preset       | MinLength | MinDigits | MinSpecial | MinUpper | MinLower |
|--------------|-----------|-----------|------------|----------|----------|
| `very_strict`| 32        | 4         | 4          | 4        | 4        |
| `strict`     | 16        | 2         | 2          | 2        | 2        |
| `normal`     | 8         | 1         | 1          | 1        | 1        |
| `none`       | 0         | 0         | 0          | 0        | 0        |

Applied at boot in `dev/prod/src/platform.ts` (web) and `desktop/src/ui/platform.ts` (desktop):
```ts
setMetadata(login.metadata.PasswordValidations, passwordRequirements[config.PASSWORD_STRICTNESS ?? 'none'])
```

Desktop takes `PASSWORD_STRICTNESS` from the front server config (`desktop/src/ui/preload.ts`, merged into the combined config). Desktop used to never set the metadata (reported on 0.8.33), so signup on desktop skipped all rules regardless of the server preset.

### Where to set the param

- Web dev-server: field in `dev/prod/public/config.json` / `config-test.json`. Read over HTTP at page load, a tab reload is enough.
- Front pod (docker, prod stands, and the server desktop connects to): env `PASSWORD_STRICTNESS` (`pods/front/src/__start.ts`), served in `GET /config.json` (`server/front/src/index.ts`). Needs a container recreate.
- Desktop has no own value: it reads the field from the front pod it connects to (locally `http://localhost:8087`).

Locally the default is `none`: the JSON files set it explicitly, `dev/docker-compose.yaml` leaves the env unset. `tests/docker-compose.persona.yaml` sets `normal`. To enable, set `"normal" | "strict" | "very_strict"`.

### Custom values (not preset)

To pick exact min-counts outside the four presets, edit `passwordRequirements` in `plugins/login/src/index.ts`. There is no env / runtime override for individual `Min*` fields.

## Gaps

- Server has no enforcement - a modified client or direct API call bypasses all rules. For real policy, add validation in `server/account/src/operations.ts` on the signup / changePassword / restorePassword paths.
- No password history, no rotation, no breach (HIBP) check, no min-entropy / zxcvbn-style scoring.

## Связанные документы

- [Аутентификация, авторизация и онбординг](features/auth-onboarding.md)
