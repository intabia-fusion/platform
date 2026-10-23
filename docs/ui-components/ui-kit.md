# ui-kit - базовые компоненты

Актуальные базовые компоненты платформы: `packages/ui/src/ui-kit/`, импорт из отдельной точки входа:

```ts
import { Button } from '@hcengineering/ui/kit'
```

Компонент кита заменяет одноимённые и похожие компоненты из `packages/ui/src/components` и самописные аналоги
в плагинах. Старые переводятся на кит и удаляются, параллельно их не поддерживаем.

## Компоненты

| Component | Purpose | Key props | Заменил |
|---|---|---|---|
| Button | База кнопок: текст, иконка или оба; toggle, кнопка своего попапа, загрузка | `kind`, `size`, `label`, `icon`, `pressed` | ModernButton, ButtonBase |
| IconButton | Кнопка только с иконкой; доступное имя обязательно по типам | `icon`, `tooltip` / `aria-label`, `kind`, `size` | ButtonIcon |
| MenuButton | Кнопка выбора пункта из списка в попапе | `items`, `selected`, `on:selected`, `label`, `icon` | ButtonMenu |
| FileBadge, PageThumb, FileCover, FileImage | Значок формата, первая страница, обложка файла (картинка проявляется целиком по `load`, до этого - `blurhash`, если передан, иначе заливка формата), картинка из сервиса превью по размеру блока | `label`, `color`, `page`, `picture` | |
| FileCard | Документ: обложка, имя, размер, «Скачать» (при наведении; без наведения скрыта только визуально, для скринридера и Tab остаётся); слоты для строк списка | `name`, `size`, `badge`, `page`, `picture`, `url`, `nameLines` | AttachmentPresenter.svelte (удалён) |
| FileTile | Строка файла, записи или ссылки: во вводе и описаниях (`medium`) и отдельно (`large`), загрузка | `kind`, `scale`, `loading`, `progress`, `failed`, `retryable`, `removable` | |
| AudioCard, AudioBar | Аудиофайл и голосовое: кнопка, волна (`Waveform`) или линия (`SeekLine`), время, скорость (`RateButton`); части не экспортируются | `id`, `src`/`url`, `size`, `duration`, `playback` | AudioPlayer, VoicePlayer |
| AudioCover | Обложка аудиофайла в сетке карточек: тон формата, знак звука (одинаковые полоски у всех файлов, не громкость записи) и длительность, прочитанная из заголовка файла, когда обложка попала на экран (и заново при смене `src`). Не играет: запись запускается в открытом файле. Встаёт в слот `cover` у `FileCard` | `id`, `src`, `badge`, `duration?` | |
| VoiceRecorderBar | Запись голосового в шапке поля ввода, над вложениями: отмена (крестик), время и живая волна в капсуле, галочка прикрепляет запись к черновику | `state` (`starting`/`recording`/`saving`), `elapsed`, `levels`; события `discard`, `attach` | VoiceRecordingHud чата |
| LinkCard | Превью ссылки в сообщении | `preview`, `details`, `detailsLoaded`, `removable` | LinkPreview, LinkPreviewCard |
| LinkCoverCard, SiteIcon | Карточка ссылки с обложкой для сеток (поиск); иконка сайта. Картинка страницы со скелетоном и заглушкой - внутренний `LinkPicture` (`LinkCard` и ссылка в `FileTile`) | `url`, `host`, `title`, `image`, `highlighted`; `src`, `host` | |
| FileNoPreview | Нет превью или оно не открылось: значок, имя, подпись, «Скачать» (без `url` кнопки нет) | `name`, `badge`, `url`, `label` (`ui.string.PreviewUnavailable` / `PreviewFailed`) | |
| MediaToolbar | Плавающая панель кнопок `kind="ghost"` в углу картинки или видео: фон и граница поповера, тень темы | `visible`, `showOnTouch` | белая плашка действий AttachmentPreview |

### Button

`IconButton` и `MenuButton` - надстройки над `Button`: рендерят её, сужают API и добавляют поведение.

- `kind`: `primary` / `brand` / `secondary` / `tertiary` / `ghost` / `positive` / `negative`; `size`: `large` (по умолчанию) / `medium` / `small` /
  `extra-small` / `min` (только icon-only); `shape`: `rectangle` / `round`; `type` - нативный, по умолчанию `button`.
- Текст кнопки - всегда проп `label` (`IntlString`):
  - перевод - ключ строки (`ui.string.Save`);
  - перевод с данными - ключ с параметром и `labelParams` (`label={ui.string.TodayDate} labelParams={{ date }}`);
  - готовый текст без перевода (имя, дата, число) - `getEmbeddedLabel(text)`;
  - у `MenuButton` - подпись выбранного пункта из его `items`: `label={items.find((it) => it.id === selected)?.label}`.
- Default slot - только для разметки (аватары, счётчики). Любое содержимое слота, даже пустое выражение, делает кнопку
  не icon-only.
- Без текста и с `icon` кнопка icon-only (квадрат), доступное имя берётся из `tooltip.label`; в коде icon-only - через
  `IconButton`.
- Иконка `medium` рядом с текстом, `small` у icon-only и кнопки меню; `iconSize` переопределяет.
- `pressed`: `undefined` - обычная кнопка, `true`/`false` - toggle (`aria-pressed`); с `hasMenu` - открыт ли попап
  (`aria-haspopup`, `aria-expanded`). `hasMenu` - для кнопки, открывающей свой попап; выбор из списка - `MenuButton`.
- `loading` блокирует кнопку и заменяет иконку спиннером цвета иконки; у primary - `--button-primary-loading-IconColor`
  (в акценте Intabia розовый `--accent-color-base` на фиолетовом фоне).
- `inheritColor` - иконка и текст берут цвет окружения; `inheritFont`, `noPrint`.
- События `click`, `keydown`, `focus`, `blur` типизированы (`ButtonEvents`). Клик по умолчанию не уходит дальше кнопки
  (`stopPropagation`, у `type="button"` ещё `preventDefault`): кликабельный родитель (строка, ссылка, карточка) на него
  не реагирует. `stopPropagation={false}` отпускает клик дальше. `id`, `name`, `value`, `form`, `aria-*`, `data-*`
  уходят на `<button>`.
- Явный `undefined` в `kind`, `size`, `shape`, `type` - значение по умолчанию.
- Токены: `--button-{primary,brand,secondary,tertiary,positive,negative}-*`, `--button-accent-*`, `--button-subtle-*`,
  `--button-disabled-*`, размеры `--global-*-Size`, скругления `--*-BorderRadius`, отступы `--spacing-*`, фокус
  `--global-focus-BorderColor`.

### IconButton

- `icon` обязателен; доступное имя обязательно: `tooltip` с `label` или `aria-label`, иначе ошибка типов. `label` и слота
  нет. Остальные пропсы и события - как у `Button`.
- Подпись - существующая строка (своего плагина, `presentation.string`, `view.string`, `ui.string`); новая - ключом в
  строках своего плагина во всех локалях. Если `tooltip` - компонент без `label`, имя задаётся переведённым
  `aria-label` (пример - `ErrorPresenter` в `process-resources`).
- Глиф, которого нет среди иконок (эмодзи), передаётся компонентом-иконкой: `icon={EmojiGlyph}` с `iconProps`
  (`emoji-resources`); кнопка остаётся квадратной.
- Проверка типов - `src/__test__/ui-kit/IconButtonTypes.svelte` (svelte-check; tsc видит импорты `.svelte` как `any`).

### MenuButton

- `items: DropdownIntlItem<Id>[]`, `selected?: Id` (поддерживает `bind:selected`), событие `selected: CustomEvent<Id>`.
  Компонент обобщён по типу id (`generics`), поэтому список с типизированными id даёт типизированный выбор:
  `const items: Array<DropdownIntlItem<Visibility>> = [...]`. Любой id, кроме `undefined`, выбирается (в том числе `0`).
- `noSelection` - не отмечать выбранный пункт; `autoSelectSingle` - единственный пункт выбирается без попапа;
  `itemParams` - параметры строк пунктов.
- Попап `ModernPopup` у кнопки; `hasMenu` и `pressed` (`aria-expanded`) ведёт сам. Смена `items` при открытом попапе
  обновляет его на месте, удаление кнопки закрывает её попап.

### Файлы, записи, ссылки

`ui-kit/file/`, `ui-kit/audio/`, `ui-kit/link/` - компоненты без модели: имя, размер, значок и источники картинок приходят пропсами. Типы папки - в её `types.ts`, в остальных `.ts` - логика. Иконки кита - в `ui-kit/_icons/` (подчёркивание держит папку первой в списке): `IconFileDownload`, `IconSaveFile` (то же «Скачать», крупнее - для шапки файла), `IconOpenFile` (нарисована с отступом от края, иначе кажется крупнее соседних), `IconZoomIn`/`IconZoomOut`, `IconGlobe`, `IconPlayFill`/`IconPauseFill`. Скелетон загрузки - `ui-kit/skeleton/Skeleton.svelte` (`width`, `height`, `radius`, `delay` - блик начинается позже, основа видна сразу).

- Значок - `FileBadgeData { label, color? }`: цвет - имя палитры (`Firework`), без цвета - нейтральная подложка; без подписи - иконка файла. Вид задаёт `variant` (`size` у карточек - размер файла в байтах); `row` - квадрат 1.5rem для строки списка рядом с миниатюрами фото. Внутренние классы значка (`.text`, `.long`) не пересекаются с глобальными `.icon`/`.label` легаси-презентеров.
- Картинка - `ImageSource`: `(width, height) => Promise<{ src, srcset? }>`; ссылку нужного размера отдаёт вызывающий код (`blobImage`/`pictureImage`/`pageImage` в `attachment-resources/src/components/file/blob.ts`, `preview.ts` в `drive-resources`). `FileImage` запрашивает её по фактической ширине места (шаг 32px, плотность - через `srcset`), грузит лениво и помнит загруженные `cacheKey`: заново смонтированная карточка не мигает.
- Размер карточек и превью ссылок известен до загрузки и не меняется после неё. У `LinkCard` картинка берётся только из `preview`, а текст - из `preview`, если он есть на вложении. Без него в рамке фиксированной высоты до загрузки скелетон, потом заголовок и описание из `details`; `details` ещё заполняют строку сайта. Картинка страницы (`LinkCard` сбоку или обложкой, ссылка в `FileTile`) грузится поверх скелетона, блик которого начинается через 150 мс, и проявляется за 0.2 с. Уже загруженная показывается сразу, без скелетона (`revealImage`, `link/link.ts`, класс `picture-loading` на её рамке).
- Меню, просмотрщик и права - снаружи: компонент шлёт `open`, `remove`, `retry`, `contextmenu` (`FileTile` - только `open`, `remove`, `retry`). Вид наведения, например пока открыто меню, держит `highlighted` (`FileCard`, `AudioCard`, `LinkCard`, `LinkCoverCard`). `FileTile`: подпись вместо имени - `nameLabel`, ключ записи в плеере - `playbackId`. Общая поверхность карточки и бумажный лист страницы - миксины `file/_surface.scss`. Списки добавляют свои строки через слоты (`FileCard`, `LinkCoverCard`).
- Плеер: один `<audio>` на приложение - `sharedPlayback()` (`audio/playback.ts`). Карточка подписана на свою запись через `playbackOf` и перерисовывается, только когда играет она. Запись останавливается, когда пропала последняя её карточка; место, где её оставили, запоминается. Ширину карточки и волны меняют `--audio-card-width` и `--waveform-max-width`. Скорость - `RateButton`, одна на все записи, в слоте постоянной ширины справа; видна у текущей записи и при наведении. Волна - `loadWaveform` (`audio/peaks.ts`), без волны (файл больше лимита или волна не прочиталась) - линия `SeekLine`; обе - ползунки через action `seekable` (`audio/seek.ts`: `role="slider"`, клик, стрелки по 5 с, Home/End). Длительность читается по заголовку через `<audio preload="metadata">` (`loadDuration`, `audio/duration.ts`, ждёт не дольше 15 с): так время видно до запуска, а у файла без известной длины она проверяется до декодирования волны. Кэши волны и длины - по записи и адресу.
- Ссылки: `linkLayout`, `linkTarget`, `describeLink`, `webUrl`, `openLink` (`link/link.ts`) - открываются только `http(s)`. `SiteIcon` - иконка из деталей, иначе favicon по домену, иначе глобус; `SiteTile` - обложка сайта для `LinkCoverCard` (apple-touch-icon, затем favicon, затем первая буква домена).
- Форматы - `formatMediaDuration`, `formatFileSize` (`file/format.ts`).
- Размеры - в rem; px только для линий в 1px и поправок на них. Цвета - токены темы: тени - доля `--global-popover-ShadowColor`, бумага страницы - `--white-color`, затемнение и текст поверх фото и видео - `--global-media-OverlayColor`, `--global-on-media-TextColor`.

## Правила

- Новый базовый компонент (кнопка, поле, переключатель, ...) - только сюда, не в `components/` и не в плагин.
- Внешний вид задают токены темы (`packages/theme/styles`), стили scoped в самом компоненте; глобальные
  классы под кит не заводятся.
- Нет пропсов раскладки (`width`, `padding`, `flex`, ...) - размеры и отступы задаёт место использования.
- Классы по БЭМ: блок - имя компонента (`button`), элементы `button__icon`, модификаторы `button--primary`.
  Локальные custom properties компонента - с префиксом `--_` (`--_bg`), токены темы в разметку не попадают.
- Кнопка глушит клик сама, обработчику `event.stopPropagation()` не нужен. Если родителю нужен клик (закрыть,
  выбрать строку), у кнопки `stopPropagation={false}`.
- Компонент приходит вместе с историей Storybook (`dev/storybook/src/ui-kit/<Component>.stories.ts`), тестом
  (`packages/ui/src/__test__`) и строкой в таблице выше.

## Storybook

`dev/storybook` - витрина компонентов: Storybook 8.6 (`@storybook/svelte-vite`), истории в CSF3 (`*.stories.ts`).

```bash
cd dev/storybook
pnpm run storybook         # http://localhost:6006
pnpm run build-storybook   # статическая сборка в storybook-static/
```

- Тема, акцент и язык - в тулбаре; декоратор `src/decorators/StoryTheme.svelte` рисует истории через `Theme` из
  `@hcengineering/theme`, как приложение.
- Истории компонента: Playground, Variants (`src/helpers/Sections.svelte` - матрицы размеров и
  состояний под заголовками) и, если есть поведение, пример с ним (Open у MenuButton с контролом `example`).
- `src/helpers/Matrix.svelte` + `axis()` - таблица вариантов (`kind` x `size`, состояния) для сверки компонента.
- `src/helpers/argTypes.ts` - общие правила таблицы пропсов: имена брендированных типов (`IntlString`, `Asset`),
  скрытие `aria-*`/`data-*`, группы (appearance, state, menu, accessibility & focus, native, methods) и контролы
  только у пропсов, меняющих вид или поведение. Новый проп кита - строка в `categories` и, если он невизуальный,
  в `withoutControl`; в историях `argTypes` не дублируются.
- Хосты попапов и тултипов монтируются один раз в `.storybook/preview.ts`.
- Проверки: `pnpm svelte-check --to @hcengineering/storybook` (typecheck историй), eslint - через `pnpm format`.
  В `pnpm build` Storybook не входит.

## Точка входа

`./kit` объявлен в `exports` пакета `packages/ui/package.json`. С появлением `exports` резолвятся только
перечисленные в нём пути, поэтому там же оставлены глубокие импорты `@hcengineering/ui/src/*` (типы, цвета,
`lang`, `plugin`) и `lang/*.json`. Новая глубокая точка входа в `ui` - сначала строка в `exports`.

## Дальше

- Перевести на кит `Button` из `@hcengineering/ui` (класс `.antiButton`) и удалить глобальные стили `.hulyButton` и
  `.antiButton` из `packages/theme/styles/button.scss`.
- Запретить импорт вытесненных компонентов правилом eslint `no-restricted-imports`.
