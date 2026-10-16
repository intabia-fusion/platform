# ui-kit Button

- `--button-accent-*` и `--button-negative-*` были объявлены только у акцентов Intabia/Intabia2/Huly: на Green, Blue и др. primary брал текст от `font-medium-14`, negative был прозрачным с рамкой `currentColor`. Базовые значения теперь в `.theme-light`/`.theme-dark` (`_lumia-colors.scss`); в `* {}` их класть нельзя - `*` перебивает значения акцента на `html` у всех потомков.
- `Spinner.svelte` давал всем экземплярам `<linearGradient id="a">`: каждый спиннер на странице рисовался градиентом первого. Id теперь уникален на экземпляр.
- Svelte 4: явный `prop={undefined}` затирает значение по умолчанию из `export let x = 'large'` (старые кнопки получали класс `undefined`). В ките умолчания резолвятся через `??`.
- Сверка с ModernButton/ButtonIcon - программная, по computed styles пар в `Legacy (to be removed)/Comparison`; сознательные отличия: disabled tertiary гасит иконку, loading без `cursor: pointer`, спиннер цвета иконки вида (у старых - всегда `accent-color-base` в Intabia и `--caption-color` в остальных акцентах; розовый на primary Intabia сохранён токеном `--button-primary-loading-IconColor`), белый текст negative на любом акценте.
- `Label` подписывался на весь `$themeStore` и переводил строку заново при смене акцента/темы/шрифта; теперь `languageStore` (derived, уведомляет только при смене языка; `''`, пока тема не задана - передаётся как `undefined`).
- Компонентные тесты должны `$destroy()` смонтированное в `afterEach`: живые экземпляры с прошлых тестов реагируют на сторы и путают проверки вызовов (`translateCB` вызывался `Label` из чужих тестов).
- В tsc-сборке импорт `.svelte` - `any` (`platform-rig/profiles/ui/svelte`), поэтому `@ts-expect-error` на пропсах компонента в `.ts` бесполезен; проверки типов пропсов - в `.svelte`-фикстуре под svelte-check (`IconButtonTypes.svelte`).
- Контейнер иконки старых кнопок всегда `min-width: 20px`, даже при иконке 16px у кнопки меню: иначе `MenuButton` на 4px уже `ButtonMenu`.
