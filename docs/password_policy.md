# Password Policy

## Overview

Password policy enforced only on client side (login UI). Server (`server/account`) does NOT validate password complexity — it stores any string.

Validation applies in three forms:
- `SignupForm.svelte` — registration
- `PasswordRestore.svelte` — password reset via recovery link
- `ChangePassword.svelte` — change current password

`LoginForm.svelte` itself does NOT validate (only checks existing password against backend).

## Components

### Rule generator
`plugins/login-resources/src/validations.ts` — `getPasswordValidationRules()` builds rules from metadata `login.metadata.PasswordValidations`.

Five rules, all "min count of chars":
- `MinLength` — overall length
- `MinSpecialChars` — match `/[^a-zA-Z0-9]/g`
- `MinDigits` — match `/[0-9]/g`
- `MinUpperChars` — match `/[A-Z]/g`
- `MinLowerChars` — match `/[a-z]/g`

No max length. No char blacklist. No dictionary / breach check. No repeat-char limit.

### Metadata declaration
`plugins/login/src/index.ts:58`:
```ts
PasswordValidations: '' as Metadata<{
  MinLength: number
  MinSpecialChars: number
  MinDigits: number
  MinUpperChars: number
  MinLowerChars: number
}>
```

### Localized rule descriptions
`plugins/login/src/index.ts` — `string.PasswordMinLength`, `PasswordMinSpecialChars`, `PasswordMinDigits`, `PasswordMinUpperChars`, `PasswordMinLowerChars`. Each takes `{ count }` param.

## Configuration

### Source
`dev/prod/src/platform.ts:265` — `PASSWORD_REQUIREMENTS` map, four presets:

| Preset       | MinLength | MinDigits | MinSpecial | MinUpper | MinLower |
|--------------|-----------|-----------|------------|----------|----------|
| `very_strict`| 32        | 4         | 4          | 4        | 4        |
| `strict`     | 16        | 2         | 2          | 2        | 2        |
| `normal`     | 8         | 1         | 1          | 1        | 1        |
| `none`       | 0         | 0         | 0          | 0        | 0        |

### Applied at boot
`dev/prod/src/platform.ts:515`:
```ts
setMetadata(login.metadata.PasswordValidations, PASSWORD_REQUIREMENTS[config.PASSWORD_STRICTNESS ?? 'none'])
```

### Where to set the param
Field: `PASSWORD_STRICTNESS` in front config JSON (served by front pod on `GET /config.json`).

Files:
- `dev/prod/public/config.json` — local dev stand
- `dev/prod/public/config-test.json` — test stand
- `pods/front/dist/config-test.json` — built front pod
- Desktop client config: `desktop/src/ui/types.ts:68` (same field)

Currently all set to `"none"` — no enforcement.

To enable: change value to `"normal" | "strict" | "very_strict"` in the config JSON the front pod serves.

### Custom values (not preset)
To pick exact min-counts outside the four presets, edit `PASSWORD_REQUIREMENTS` in `dev/prod/src/platform.ts`. There is no env / runtime override for individual `Min*` fields.

## Gaps

- No env var pipeline. `PASSWORD_STRICTNESS` only readable from static config JSON, not from container env. To make env-configurable, extend `server/front/src/index.ts` (`/config.json` handler around line 350) to read `process.env.PASSWORD_STRICTNESS` and include in `data`.
- Server has no enforcement — a modified client or direct API call bypasses all rules. For real policy, add validation in `server/account/src/operations.ts` on signup / changePassword / restorePassword paths.
- No password history, no rotation, no breach (HIBP) check, no min-entropy / zxcvbn-style scoring.
