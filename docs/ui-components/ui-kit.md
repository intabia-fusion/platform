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

### Button

`IconButton` и `MenuButton` - надстройки над `Button`: рендерят её, сужают API и добавляют поведение.

- `kind`: `primary` / `secondary` / `tertiary` / `negative`; `size`: `large` (по умолчанию) / `medium` / `small` /
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
- Токены: `--button-{primary,secondary,tertiary,negative}-*`, `--button-accent-*`, `--button-subtle-*`,
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
