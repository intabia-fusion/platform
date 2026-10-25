# Иконки платформы: состояние

Стандарт иконки и правило «кит или плагин» - раздел «Иконки» в [ui-kit.md](ui-kit.md). Здесь - где сейчас лежат
иконки платформы, как плагины ссылаются на кит и что ещё не по стандарту. Сверено с кодом на 2026-10-26.

## Итог

- В исходниках 410 иконок (`node dev/storybook/scripts/platform-icons.mjs`): 242 символа спрайта кита, 116 символов
  спрайтов плагинов, 39 Svelte-компонентов, 4 svg-строки в `.ts`, 9 data URI в стилях.
- Кит - спрайт `packages/ui/assets/icons.svg`, ключи `ui.icon.*`. Все символы - сетка 32, линия 2, только заливка
  `currentColor`.
- Svelte-компонентов иконок в `ui` и `presentation` нет; легаси-экспорты `Icon*` удалены, места рисуют `ui.icon.*`
  (`ui/components/icons/SquareSpinner.svelte` - спиннер, не иконка).
- Id иконок плагинов (`loadMetadata(<plugin>.icon, ...)` в `plugins/*-assets`): 369 ведут на символы кита, 118 - на
  спрайт своего плагина.

## Как устроено

- Иконка, нужная больше чем одному плагину, - символ кита; код рисует `ui.icon.*`.
- Id плагина, который может лежать в данных (`card.icon.Tag` пишется в созданные теги, `time.icon.Planned` - в
  документы из триггеров, иконки классов и типов в моделях), сохранён и ведёт на символ кита:
  `const uiIcons = require('@hcengineering/ui/assets/icons.svg')`, `` Tag: `${uiIcons}#check-circle` ``. Старые документы
  показывают иконку кита без миграции данных. Id без использования в коде и данных удалены вместе с символами.
- Иконка, которая имеет смысл только в одном плагине, - символ его спрайта `plugins/<plugin>-assets/assets/icons.svg`
  по тому же стандарту (hr `PTO`, `Sick`, `Vacation`, request `Approve` / `Reject`, recorder `Stop`, `Pause`). Плагин без
  своих иконок спрайта не имеет.
- Цвет задаёт место: `fill` у `Icon`, `iconProps={{ fill }}` у кнопки. Так красятся статусы test-management
  (`StatusPassed` / `StatusFailed`), task `Won` / `Lost`, микрофон, камера и запись love, ошибки (`--theme-error-color`),
  состояния uploader.
- Иконки с логикой остаются компонентами поверх символов кита: статусы task (`IconBacklog`, `IconUnstarted`,
  `IconStarted`, `IconCompleted`, `IconCanceled` - цвет палитры по номеру, сектор прогресса), time `Priority`,
  rating `StarMark` (золото, анимация), `ConnectionStatus`, controlled-documents `DocumentIcon` (на него ссылается модель).
  `IconStartedRing`, view `UpDown` и desktop-downloads `DownloadProgress` (кольцо прогресса толще линии кита) нарисованы
  на сетке 32 своим svg.
- svg, собранный в DOM-коде (`drawing.ts`, декорации таблиц и codeblock text-editor, `PlatformIcon` логина), ссылается на
  символ кита через `<use href="${getMetadata(ui.icon.X)}">`. Исключение - значок в подписи диаграммы `TaskTypeDiagram`:
  mermaid вычищает `<use>`, а диаграмма скачивается отдельным SVG, поэтому там встроенный рисунок.

## Не по стандарту

Символы спрайтов плагинов на другой сетке (размер в продукте верный, линия и поля - исходника):

| Плагин | Символы | Сетка |
|---|---|---|
| contact | логотипы каналов: `facebook`, `linkedin`, `telegram`, `twitter`, `whatsapp`, `github`, `google`, `viber`, `huly` | 12, 52.5, 246, 34 |
| emoji | категории пикера (`activities`, `flags`, `symbols` и ещё 6) | 24 |
| tags | `level-1` ... `level-3` | 16 |
| test-management | `status-*`, `red-circle` (цвета в символе) | 14 |
| text-editor | `strikethrough`, `quote`, `codeBlock`, `tableProps`, `brush`, `textStyle`, `linkEmbed`, `showDiff` | 14-24 |
| tracker | `priority-*` (`priority-urgent` с цветом), `component-status-*`, `red-circle` | 14, 16 |
| github | логотип `github` | 24 |

Svelte-компоненты плагинов, которые не стали символами:

- логотипы и иллюстрации (многоцветные): login `Google`, `Github`, `OpenId`, `IntabiaIcon`, `LoginIcon`, `IBanner`,
  `Ball*`, onboard `OnboardIcon`, gmail `GmailColor`, telegram `Telegram`, `TelegramColor`, calendar `Calendar`,
  ai-assistant `HulyAssistant`, huly-mail `HulyMail`;
- рисунки с логикой: task-статусы, time `Priority`, view `UpDown`, desktop-downloads `DownloadProgress`, recorder `Rec`,
  contact `EmptyAvatar`, controlled-documents `DocumentIcon`;
- text-editor `Description`, `Send` - на своей сетке.

Многоцветные логотипы в кит не входят: правила линии и `currentColor` к ним не применяются, они остаются у своих
плагинов.

Известная поломка из develop: view `Tree` и `Document` ссылаются на `#tree` и `#document`, которых нет в спрайте view.

## Инструменты

- Storybook, UI kit / «Overview / Icons» - все ключи `ui.icon` по смысловым группам
  (`dev/storybook/src/ui-kit/iconGroups.ts`).
- Storybook, Plugins / «Icons» - все svg платформы вне кита по источникам; сбор - `dev/storybook/scripts/platform-icons.mjs`
  (подробнее - [dev/storybook/README.md](../../dev/storybook/README.md)).
