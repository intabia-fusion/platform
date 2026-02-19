# Подпись и нотаризация приложения для macOS

Данная инструкция описывает, как настроить подпись кода (code signing) и нотаризацию для desktop-приложения Platform на macOS.

## Общая информация

Для публикации приложения macOS за пределами App Store необходимо:
1. **Подписать код** (Code Signing) — используется сертификат Developer ID Application
2. **Нотаризовать** (Notarization) — проверка приложения Apple на наличие вредоносного ПО

## Необходимые сертификаты и учётные данные

### 1. Apple Developer ID Certificate (P12)

**Для чего:** Подпись приложения перед распространением.

**Где получить:**
1. Зайдите в [Apple Developer Portal](https://developer.apple.com/account/resources/certificates/list)
2. Создайте сертификат типа **"Developer ID Application"** (не "Mac App Distribution"!)
3. Скачайте `.cer` файл и импортируйте в Keychain Access
4. Экспортируйте как `.p12`:
   - Откройте Keychain Access → login → My Certificates
   - Найдите "Developer ID Application: Your Team Name"
   - Правый клик → Export → Формат: Personal Information Exchange (.p12)
   - Установите пароль для экспорта

**Переменные окружения:**
- `DEV_ID_P12_BASE64` — содержимое `.p12` файла в base64 кодировке
- `DEV_ID_P12_PASSWORD` — пароль от P12 файла
- `KEYCHAIN_PASSWORD` — временный пароль для keychain (может быть любым)

### 2. Apple ID для нотаризации

**Для чего:** Загрузка приложения на серверы Apple для проверки.

**Требования:**
- Apple ID должен быть в программе Apple Developer Program
- Должна быть настроена двухфакторная аутентификация
- Нужно создать [App-Specific Password](https://appleid.apple.com/account/manage)

**Переменные окружения:**
- `APPLE_ID` — email от Apple ID (например, `developer@company.com`)
- `APPLE_ID_APP_PASS` — App-Specific Password (не обычный пароль!)
- `TEAM_ID` — Team ID из Apple Developer Portal (10 символов, например `ABCD123456`)

## Настройка GitHub Secrets

Все переменные нужно добавить в **GitHub Secrets** (Settings → Secrets and variables → Actions):

| Secret | Описание | Пример/Формат |
|--------|----------|---------------|
| `DEV_ID_P12_BASE64` | Base64 содержимое P12 сертификата | `base64 -i cert.p12 \| pbcopy` |
| `DEV_ID_P12_PASSWORD` | Пароль от P12 файла | `your-p12-password` |
| `KEYCHAIN_PASSWORD` | Пароль для временного keychain | `any-random-password` |
| `APPLE_ID` | Apple ID email | `developer@company.com` |
| `APPLE_ID_APP_PASS` | App-Specific Password | `xxxx-xxxx-xxxx-xxxx` |
| `TEAM_ID` | Team ID из Developer Portal | `ABCD123456` |

### Кодирование P12 в Base64

```bash
# macOS
base64 -i DeveloperID.p12 | pbcopy

# Linux
base64 -w 0 DeveloperID.p12

# Windows (PowerShell)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("DeveloperID.p12")) | Set-Clipboard
```

## Настройка workflow

После добавления secrets, раскомментируйте следующие секции в `.github/workflows/main.yml`:

## Полезные ссылки

- [Apple Developer: Distributing Software](https://developer.apple.com/documentation/xcode/distributing-software)
- [electron-builder Code Signing](https://www.electron.build/code-signing)
- [@electron/notarize](https://github.com/electron/notarize)
- [Creating App-Specific Passwords](https://support.apple.com/en-us/HT204397)
