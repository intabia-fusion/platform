# ui-kit - базовые компоненты

Актуальные базовые компоненты платформы: `packages/ui/src/ui-kit/`, импорт из отдельной точки входа:

```ts
import { Button } from '@hcengineering/ui/kit'
```

## Компоненты

| Component | Purpose | Key props |
|---|---|---|
| Button | База кнопок: текст, иконка или оба; toggle, кнопка своего попапа, загрузка; `kind="chip"` - овальная пилюля строки списка как в develop (высота 1.75rem, рамка `--theme-button-border`, фон `--theme-list-button-color`, текст `--theme-content-color`, иконка `--theme-halfcontent-color`, наведение вид не меняет): счётчики подзадач, комментариев, вложений при `appearance="inline"` | `kind`, `size`, `label`, `icon`, `selected`, `pressed` |
| IconButton | Кнопка только с иконкой; доступное имя обязательно по типам | `icon`, `tooltip` / `aria-label`, `kind`, `size` |
| MenuButton | Кнопка выбора пункта из списка в попапе | `items`, `selected`, `on:selected`, `label`, `icon` |
| Dropdown | Выбор значения из списка: триггер `SelectButton` и свой попап; ↓ / ↑ на кнопке открывают список, с клавиатуры фокус в списке и обратно на кнопку | `items` (с `children`), `selected`, `multiselect`, `separator`, `placeholder`, `icon`, `kind`, `size`, `chevron`, `fullWidth`, `justify` |
| DateSelect | Дата, которую можно поменять: `SelectButton` открывает `DatePopup`; secondary с заливкой и рамкой полей ввода (`--input-*`), как DateInput, остальные SelectButton - кнопочные | `value`, `mode`, `placeholder`, `tone`, `readonly`, `on:change` |
| DateLabel | Дата только для показа: текст строки с иконкой календаря | `value`, `mode`, `showIcon`, `icon`, `tone` |
| IconBox | Декоративная плашка с иконкой вида объекта (у поля названия в диалоге создания) | `icon`, `iconProps`, `size`, `shape` |
| SelectButton | Триггер селектора: значение или плейсхолдер, попап открывает место; `kind="chip"` - пилюля строки списка без шеврона (веха, компонент, срок в списке задач) | `label` / slot, `placeholder`, `icon`, `kind`, `size`, `chevron`, `pressed` |
| ButtonGroup | Переключатели, из которых включён не больше одного (боковые панели документа) | `items`, `selected`, `allowDeselect`, `kind`, `size`, `iconSize`, `on:select` |
| SplitButton | Главное действие и меню связанных, склеенные в один контрол | `label`, `icon`, `kind`, `size`, `items`, `on:click`, `on:selected` |
| SegmentedControl | Значение или режим одного содержимого из 2-5 вариантов, выбран всегда ровно один (`radiogroup`); трек - половина `--global-ui-hover-BackgroundColor`, как плашки крошек; `iconOnly` прячет подпись и бейдж только у сегментов с иконкой; не помещается - сегменты прокручиваются (без полосы), вокруг трека запас под обводку фокуса без сдвига раскладки | `items` (`badge`), `selected`, `size`, `iconOnly`, `on:select` |
| Tabs | Разделы или виды одного экрана (`tablist`, подчёркивание); содержимое выбранной рисует место | `items`, `selected`, `size`, `on:select` |
| WorkbenchTab | Вкладка открытого объекта в полосе workbench или сайдбара, закрываемая и закрепляемая; средняя кнопка мыши закрывает `closable` | `label`, `icon`, `selected`, `closable`, `preview`, `kind`, `orientation`, `on:close`, `on:menu` |
| Toggle | Переключатель on/off (`input role=switch`) с подписью и описанием | `checked`, `kind` (`brand` / `primary` / `positive` / `negative`), `size`, `label`, `description`, `labelPosition`, `fullWidth`, `readonly`, `on:change` |
| Checkbox | Флажок: `indeterminate`, `round`, цвет из данных, `decorative` для отметки внутри кнопки-строки; рамка невыбранного цвета вида (как в легаси), выключенный без заливки | `checked`, `indeterminate`, `kind` (`primary` / `brand` / `positive` / `negative` / `neutral` - серый круг и галочка без заливки, круглая подложка на ховер, как отметка «прочитано» в develop), `size`, `shape`, `color`, `label`, `readonly`, `error`, `on:change` |
| Radio, RadioGroup | Переключатель-вариант и вертикальная группа (`radiogroup`); рамка невыбранного цвета вида, выключенный без заливки | `value`, `group` / `items`, `selected`, `kind`, `size`, `on:change` |
| Breadcrumbs, Breadcrumb | Путь (`nav`, последняя - текущая) и одна крошка; в узкой шапке сначала сжимается путь, текущая крошка - последней | `items`, `on:select`, слот `after`; `label`, `icon`, `iconBox`, `current`, `aria-label` / `aria-labelledby` (по умолчанию «Breadcrumbs») |
| AccordionItem | Раскрываемая секция: шапка-кнопка `aria-expanded`, счётчик, длительность, выбор; содержимое - регион, у `small` без `role="region"` (длинные списки) | `label`, `icon`, `size`, `open`, `selected`, `counter`, `duration`, `sticky`, `on:toggle`, `on:select` |
| Chip | Значение поля или метка, опционально со снятием; цвет - акцент или `color` из данных; крестик назван «Remove {label}», счётчик «+N» - `kind="neutral"` (плоская плашка `--global-ui-hover-BackgroundColor`, вторичный текст, без рамки) | `label`, `kind` (`tint` / `solid` / `outline` / `neutral` - вид на выбор), `tone` (статус: `positive` / `negative` / `regular` / `ghost`, перекрывает kind и color), `size`, `color`, `icon`, `iconProps`, `removable`, `on:remove` (крестик, Backspace / Delete) |
| FilterButton | Кнопка фильтров на `SelectButton`: попап категорий; с фильтрами кнопка остаётся серой, акцент только у индикатора, крестик сброса внутри кнопки (плашка размером с число); попап категорий берёт фокус при открытии и смене вида, ↑/↓ по кругу, Home/End | `categories` (`FilterButtonCategory`), `activeFilters` (`FilterButtonActiveFilter`), `indicator` (`count` - число в светлом квадратике, `dot` - точка на воронке), `kind`, `size`, `on:change` |
| SearchInput | Поле поиска с очисткой и задержкой, свёрнутый режим; собран на TextInput (лупа, очистка, рамка и фокус оттуда), ghost - `subtle` с `inset` и подложкой на ховер | `value`, `placeholder`, `kind`, `size`, `collapsed`, `delay`, `fullWidth`, `loading`, `aria-labelledby`, `on:change`, `on:keydown`; Escape очищает непустой запрос и не уходит дальше |
| NumberInput | Число со степперами `−` / `+`, диапазон и точность при фиксации | `value`, `min`, `max`, `step`, `fractionDigits`, `size`, `fullWidth`, `aria-labelledby`, `on:change` (только при изменении значения) |
| TextInput | Однострочное поле: имя обязательно по типам, иконка, очистка, подпись; заливка и рамка - токены полей ввода (`--input-*`), как у легаси; ghost вровень с краем и чистый в фокусе, `subtle` - ghost с подложкой на ховер, в фокусе заливка и кольцо поля; без `inset` это коробка залитого поля, сдвинутая влево на отступ (текст вровень, у заливки есть поле), с `inset` - отступ залитого поля (места ModernEditbox); ошибка у всех видов - полная рамка, у ghost без `inset` вынесена наружу на отступ поля, текст не сдвигается | `value`, `kind` (`secondary` / `ghost` / `subtle`), `size`, `heading`, `inset`, `label`, `placeholder`, `icon`, `clearable`, `type`, `error`, `on:input`, `on:change` |
| TextArea | Многострочное поле, растёт до `maxRows`; плейсхолдер и значение весом 400 во всех размерах; ghost с `inset` стоит на одной линии с `inset` TextInput | `value`, `kind`, `size`, `inset`, `rows`, `maxRows`, `placeholder`, `on:input`, `on:change` |
| CodeInput | Код по ячейкам: вставка и `one-time-code` раскладываются, переход между ячейками | `value`, `length`, `size`, `numeric`, `separator`, `error`, `on:input`, `on:complete` |
| Dialog | Диалог: шапка с заголовком и закрытием, тело, футер с главным действием и отменой | `label`, `width`, `padding`, `embedded`, `footer`, `submitLabel`, `submitKind`, `canSubmit`, `loading`, `on:submit`, `on:cancel` (отменяемое), `on:close`; `canClose()` для хоста попапа; модальный: фокус внутри, Tab по кругу, возврат фокуса |
| Steps | Индикатор шагов (`ol`, `aria-current="step"`) | `items`, `selected` |
| WizardDialog | Диалог-мастер: шаги слева, «Назад» / «Далее» / главное действие | `label`, `steps`, `selected`, `canProceed`, `canSubmit`, `on:select` (отменяемое), `on:submit` |
| Menu | Список в попапе: иконка, цвет, описание, галочка, подменю, поиск, мультивыбор, заголовки групп; буквы на строке ищут по началу подписи, ↑ из поля поиска - на последнюю строку | `items` (`MenuItem`), `selected`, `multiselect`, `withSearch`, `headings` (`lines` / `divider` / `plain`), `width`, `embedded`, `loading`, `on:close`, `on:update`, слоты `header` / `actions` |
| Spinner | Признак занятости рядом с элементом; с подписью - `role="status"` | `size`, `kind` (`neutral` / `brand`), `inheritColor`, `label` |
| Loading | Заглушка области: спиннер посередине, появляется с задержкой; одна область `role="status"` (текст вставляется после неё), подпись `label` или скрытое «Loading»; без `aria-busy` | `size`, `label`, `delay`, слот `actions` |
| ProgressBar | Полоса прогресса, одиночная или из частей | `value`, `min`, `max`, `kind`, `segments`, `size`; одиночной полосе обязателен `aria-label` / `aria-labelledby` |
| Slider | Значение перетаскиванием по диапазону (`input type=range`): масштаб, радиус размытия, перемотка; `disabled` - серый, без акцента; значение округляется к сетке `step` от `min`; трек - половина `--global-tertiary-TextColor` (как у `ProgressCircle`), на hover и при перетаскивании ореол вокруг бегунка без смены цвета | `value`, `min`, `max`, `step` (`'any'`), `size`, `disabled`, `showValue`, `formatValue`, `on:input`, `on:change` |
| ProgressCircle | Кольцо прогресса | `value`, `min`, `max`, `size`, обязателен `aria-label` / `aria-labelledby` |
| StatusIcon | Состояние значком или точкой; `negative` - красный опасного действия (нет, отклонено), `error` - красный ошибки; `kind="outline"` - кольцо без заливки бледным оттенком тона (60%) | `tone`, `kind` (`solid` / `outline`), `size`, `dot`, `tooltip` |
| Callout | Плашка с пояснением в форме или диалоге: значок, текст, заголовок, кнопки справа | `tone` (`info` / `positive` / `warning` / `error`), `label`, `title`, слоты по умолчанию / `actions` |
| SettingRow | Строка настройки в форме или диалоге: подпись капсом слева, контрол справа, линия под строкой (над первой нет) | `label`, `hint` (кнопка-«i» с подсказкой), `stacked` (подпись над контролом), слот `details` (чипы под строкой), `let:labelId` для `aria-labelledby` |
| MonthView | Вид «месяц» приложения: таблица целых недель на всю высоту, шапка дней недели прилипает, номер дня - кнопка, под ним содержимое места | `month`, `value`, `weeks`, `rowHeight`, `weekdayFormat`, слот `day` (`date`, `today`, `selected`, `outside`), `on:select`, `on:navigate` |
| YearView | Вид «год» приложения: 12 `Calendar` без стрелок и года сеткой по ширине, выходные подсвечены, прокручивается сам | `year`, `value`, `marked`, `dayTooltip`, `on:select` |
| StatusMessage | Строка результата `Status` под формой | `status`, `wrap` |
| Toast | Карточка уведомления; значок тона - StatusIcon, у info `outline`, у остальных залитый | `title`, `tone`, `closable`, слот `actions`, `on:close` |
| ShowMore | Обрезка высокого содержимого с плашкой «Показать ещё» в чистой полосе под затуханием (в раскрытом виде - под содержимым); высота меряется сразу при монтировании, фокус ниже обрезки раскрывает (`overflow: clip`); в `expandable={false}` - только текст: ссылка под обрезом получит фокус невидимой | `limit`, `open`, `disabled`, `expandable`, `on:toggle` |
| Section | Секция с заголовком и действиями | `label`, `icon`, `level` (2–4, уровень заголовка), слот `actions` |
| EmptyState | Пустое состояние: `large` - заполняет место по высоте и ширине и сам ставит заглушку по центру (текст не шире 30rem), иконка на плашке по `kind` (`brand` по умолчанию - круг тона выбора, `plate` - нейтральный квадрат); `small` - светлая рамка в секции, с `action` - вся плашка пунктирная кнопка добавления | `label`, `description`, `icon`, `size` (`large` / `small`), `kind`, `action` + `on:click`, слот действий |
| Kbd | Сочетание клавиш; подложка клавиши `--global-ui-hover-BackgroundColor`, как у легаси | `keys` |
| WorkspaceLogo | Логотип или буква воркспейса, точка уведомления; `notify` озвучивается в имени | `name`, `src`, `size`, `notify`; буква на заливке primary |
| Link | Ссылка (`a` с `href`, иначе `button`): цвет основного текста, у `href` тонкое подчёркивание в покое, при наведении сплошное | `label`, `href`, `external`, `icon`, `disabled`, `truncate` (`end` / `middle` - многоточие посередине, конец имени целиком), `on:click` |
| NavItem | Строка навигатора: иконка, счётчик, выбранная, вложенность, раскрытие; hover - бледнее выбранной (55% `--button-selected-BackgroundColor`), между строками 1px; плашка иконки `object` без рамки | `label`, `identifier` (12px / 500 перед названием, название обрезается), `description`, `kind` (`link` / `object` / `anchor`), `icon`, `count`, `selected`, `level`, `expandable`, `open`, слоты `actions` / `children` |
| NavGroup | Заголовок группы навигатора | `label`, `kind` (`section` / `nested`), `divider`, `expandable`, `open`, `selected`, слоты `tools` / `extra` |
| List | Список с выбором клавиатурой (`listbox`); в порядке Tab, ↑ ↓ Home End PageUp PageDown, Enter - `activate`, `onKeydown` для поля поиска | `count`, `items`, `selection`, `highlighted`, `inset`, `scroll`, `tone` (`neutral` - серая текущая строка, `tint` - бледный оттенок выбранного, как ховер NavItem), слот `item`, `on:select`, `on:activate` |
| Panel | Страница объекта: шапка `PanelHeader` (закрытие в начале, заголовок, действия, ширина, полный размер, переключатель aside), содержимое и aside, который в панели уже 900px или с `floatAside` всплывает | `closable`, `customAside` / `selectedAside`, `useMaxWidth`, `isFullSize`, `adaptive`, слоты `before` / `title` / `actions` / `utils` / `extra` / `header` / `aside` |
| PanelHeader | Шапка панели: заголовок, поиск, extra, действия; адаптивная вторая строка; Esc закрывает только последнюю появившуюся шапку и не закрывает из текстового поля (из флажка, переключателя, ползунка - закрывает) | `adaptive`, `breakpoint`, `closable`, `navigatorToggle`, слоты `before` / `actions` / `extra` |
| Calendar | Сетка месяца: выбор дня или диапазона (`grid`, стрелки, PageUp/PageDown) | `value`, `end`, `range`, `month`, `navigation`, `showYear`, `weekends` (подсветка столбцов выходных), `marked` (точка под днём), `dayTooltip`, `on:select`, `on:range` |
| DatePicker | Попап выбора даты, времени или диапазона, со сдвигами; `time` / `timeonly` - только время, без месяцев; поверхность как у Menu (рамка, popover-тень), сдвиги - строки на всю ширину колонки | `value`, `end`, `range`, `mode`, `compact`, `label`, `detail`, `shifts`, `on:close` |
| DateInput | Ввод даты и времени с клавиатуры по частям (`spinbutton`); высоты, шрифт и отступ текста - как у TextInput того же размера, кольцо фокуса и по клику (ghost - подложка); «.» и «:» прижаты к частям | `value`, `mode`, `kind`, `size`, `clearable`, `on:change` |
| RelativeTime | «5 минут назад», обратный отсчёт, сдвиг | `value`, `format` (`ago` / `countdown` / `offset`), `exact` |
| FileBadge, PageThumb, FileCover, FileImage | Значок формата, первая страница, обложка файла (картинка проявляется целиком по `load`, до этого - `blurhash`, если передан, иначе заливка формата), картинка из сервиса превью по размеру блока | `label`, `color`, `page`, `picture` |
| FileCard | Документ: обложка, имя, размер, «Скачать» (при наведении; без наведения скрыта только визуально, для скринридера и Tab остаётся); слоты для строк списка | `name`, `size`, `badge`, `page`, `picture`, `url`, `nameLines` |
| FileTile | Строка файла, записи или ссылки: во вводе и описаниях (`medium`) и отдельно (`large`), загрузка | `kind`, `scale`, `loading`, `progress`, `failed`, `retryable`, `removable` |
| AudioCard, AudioBar | Аудиофайл и голосовое: кнопка, волна (`Waveform`) или линия (`SeekLine`), время, скорость (`RateButton`); части не экспортируются | `id`, `src`/`url`, `size`, `duration`, `playback` |
| AudioCover | Обложка аудиофайла в сетке карточек: тон формата, знак звука (одинаковые полоски у всех файлов, не громкость записи) и длительность, прочитанная из заголовка файла, когда обложка попала на экран (и заново при смене `src`). Не играет: запись запускается в открытом файле. Встаёт в слот `cover` у `FileCard` | `id`, `src`, `badge`, `duration?` |
| VoiceRecorderBar | Запись голосового в шапке поля ввода, над вложениями: отмена (крестик), время и живая волна в капсуле, галочка прикрепляет запись к черновику | `state` (`starting`/`recording`/`saving`), `elapsed`, `levels`; события `discard`, `attach` |
| LinkCard | Превью ссылки в сообщении | `preview`, `details`, `detailsLoaded`, `removable` |
| LinkCoverCard, SiteIcon | Карточка ссылки с обложкой для сеток (поиск); иконка сайта. Картинка страницы со скелетоном и заглушкой - внутренний `LinkPicture` (`LinkCard` и ссылка в `FileTile`) | `url`, `host`, `title`, `image`, `highlighted`; `src`, `host` |
| FileNoPreview | Нет превью или оно не открылось: значок, имя, подпись, «Скачать» (без `url` кнопки нет) | `name`, `badge`, `url`, `label` (`ui.string.PreviewUnavailable` / `PreviewFailed`) |
| MediaToolbar | Плавающая панель кнопок `kind="ghost"` в углу картинки или видео: фон и граница поповера, тень темы | `visible`, `showOnTouch` |

### Button

`IconButton` и `MenuButton` - надстройки над `Button`: рендерят её, сужают API и добавляют поведение.

- `kind`:
  - `primary` - заливка основным акцентом;
  - `brand` - заливка базовым цветом бренда `--accent-color-base`: в Intabia второй акцент (розовый), в остальных акцентах -
    сам цвет акцента;
  - `secondary` - нейтральная заливка;
  - `tertiary` - прозрачная, текст и иконка цвета акцента;
  - `ghost` - прозрачная; иконка и подпись в покое - `--global-secondary-TextColor` на треть ближе к основному
    цвету (`color-mix` 70/30), при наведении - основная: подпись не громче соседних кнопок-иконок;
  - `positive` - подтверждение, успешное действие (зелёная, в цвет позитивных статусов);
  - `negative` - опасное действие;
  - `positive-ghost`, `negative-ghost` - прозрачные, иконка и подпись зелёные или красные, при наведении подложка того
    же оттенка (`--theme-state-*`): состояние вкл / выкл в статус-баре (микрофон, камера, показ экрана). В
    `SplitButton` не входят.
  - `light` / `dark` - белая и почти чёрная, одинаковые в обеих темах: кнопки на фирменных поверхностях (экраны входа,
    онбординг), где тема приложения не действует; у выключенной свой цвет подписи, читаемый на этой заливке.
- `size`: `extra-large` (3.5rem, текст 1rem - главные действия экранов входа и онбординга) / `large` (по умолчанию) /
  `medium` / `small` / `extra-small` (текст 0.75rem, как у xs-полей и чипов рядом) / `min` (только icon-only); `shape`: `rectangle` /
  `round`; `type` - нативный, по умолчанию `button`.
- Текст кнопки - всегда проп `label` (`IntlString`):
  - перевод - ключ строки (`ui.string.Save`);
  - перевод с данными - ключ с параметром и `labelParams` (`label={ui.string.TodayDate} labelParams={{ date }}`);
  - готовый текст без перевода (имя, дата, число) - `getEmbeddedLabel(text)`;
  - у `MenuButton` - подпись выбранного пункта из его `items`: `label={items.find((it) => it.id === selected)?.label}`.
- Default slot - только для разметки (аватары, счётчики). Любое содержимое слота, даже пустое выражение, делает кнопку
  не icon-only.
- Без текста и с `icon` кнопка icon-only (квадрат), доступное имя берётся из `tooltip.label`; в коде icon-only - через
  `IconButton`.
- `tooltip` появляется через 500 мс после наведения, чтобы подсказки не мелькали при проведении курсором по панели;
  своё `timeout` в объекте тултипа переопределяет задержку.
- Иконка `medium` рядом с текстом, `small` у icon-only и кнопки меню; `iconSize` переопределяет.
- `selected` - переключатель «включено/выключено»: `undefined` - обычная кнопка, `true`/`false` - toggle
  (`aria-pressed`). Включённая `secondary`, `tertiary`, `ghost` - лёгкая заливка акцентом, иконка и текст цвета
  акцента (`--button-selected-*`); у залитых видов вид не меняется.
- `pressed` - только серый вид нажатия: открытый попап, строка под курсором; `aria-pressed` не ставит. С `hasMenu` -
  открыт ли свой попап (`aria-haspopup`, `aria-expanded`). Для «включено» - `selected`. Кнопке, которая меняет
  иконку и подсказку по состоянию (скрыть / показать навигатор), `selected` не нужен: состояние уже в подписи.
  `hasMenu` - для кнопки, открывающей свой попап; выбор из списка - `MenuButton`.
- `loading` блокирует кнопку и заменяет иконку `Spinner` кита цвета иконки; подпись тускнеет (у `primary` и `brand` -
  цвет подписи на 70 %); фокус, ушедший на страницу, после окончания возвращается на кнопку.
- `inheritColor` - иконка и текст берут цвет окружения; `inheritFont`, `noPrint`.
- События `click`, `keydown`, `focus`, `blur` типизированы (`ButtonEvents`). Клик по умолчанию не уходит дальше кнопки
  (`stopPropagation`, у `type="button"` ещё `preventDefault`): кликабельный родитель (строка, ссылка, карточка) на него
  не реагирует. `stopPropagation={false}` отпускает клик дальше. `id`, `name`, `value`, `form`, `aria-*`, `data-*`,
  `tabindex` уходят на `<button>` (`tabindex={-1}` - вне порядка Tab, когда до действия есть путь с клавиатуры, как у
  степперов). Рамка фокуса - только при навигации с клавиатуры (`:focus-visible`), после клика мышью
  кнопка не подсвечивается; `noFocus` старой кнопки поэтому не нужен.
- Явный `undefined` в `kind`, `size`, `shape`, `type` - значение по умолчанию.
- Токены: `--button-{primary,brand,secondary,tertiary,positive,negative,light,dark}-*` (`ghost` - на нейтральных `--global-primary-TextColor`/`IconColor` и фонах `tertiary`), `--button-accent-*`, `--button-subtle-*`, `--button-selected-*`,
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
- `multiselect` - попап не закрывается и переключает пункты, `selected` - массив id, событие приходит на каждое
  изменение. Так делается кнопка «+» с галочками, когда выбранное показано рядом (чипами), а не на кнопке.
- Попап `ModernPopup` у кнопки; `hasMenu` и `pressed` (`aria-expanded`) ведёт сам. Смена `items` при открытом попапе
  обновляет его на месте, удаление кнопки закрывает её попап.

### Dropdown

- Триггер - `SelectButton` (`kind`, `size`, `fullWidth`, `justify`, `loading`, `tooltip` пробрасываются), `chevron` по
  умолчанию включён.
  Попап `ModernPopup` свой: `pressed`, обновление при открытом попапе и закрытие при удалении - как у `MenuButton`.
- `items: DropdownItem<Id>[]` - свой тип пункта: `id`, `label` (текст через `getEmbeddedLabel`), `labelParams`, `icon`,
  `iconProps`, `description`, `descriptionParams`, `exclusive`, `divider`, `heading`, `component`/`componentProps`
  (разметка строки в списке - только когда подписи с иконкой мало; на кнопке её рисует слот `value`). В `ModernPopup`
  пункты переводятся внутри; список по ширине пунктов (10-16.5rem, не уже кнопки в этих пределах: широкая кнопка не растягивает короткий список); `popupWidth` (`wide`, `x-wide`) - широкий список для длинных строк. `selected` и событие `selected` - id или,
  с `multiselect`, массив id.
- С `multiselect` попап не закрывается; на триггере выбранные с иконками пунктов, между ними `separator`: `dot`
  (по умолчанию, как у легаси), `comma` или `none` - только отступ.
- Пока ничего не выбрано - `placeholder` и `icon` (с `iconProps`); они же у выбранного пункта без своей иконки.
- Обобщён по типу id и форме выбора (`Selected` - id или массив id): `bind:selected` к `Ref<X>` или к `Ref<X>[]`
  с `multiselect` типизирован без приведений; с `multiselect` передавать `selected` массивом.
- Слот `value` (`let:items` - выбранные пункты) - разметка значения вместо подписей: чипы статусов, «первый + счётчик».
  Показывается, пока что-то выбрано, иначе плейсхолдер. `wrap` - длинное значение переносится на несколько строк,
  кнопка растёт от высоты своего размера.
- `allowDeselect`: при одиночном выборе повторный клик по выбранному пункту снимает выбор (`on:deselected`
  с `detail` = `null`, `selected` становится `undefined`; в `on:selected` `undefined` не приходит). По умолчанию равен `multiselect`: в
  мультивыборе можно снять и последний пункт, с `allowDeselect={false}` последний остаётся.
- `children` у пункта - подменю: открывается наведением, стрелкой вправо или кликом (без наведения), первой строкой
  в нём сам пункт - его тоже можно выбрать, - под линией дети; стрелка влево возвращает к родителю. Глубина любая,
  только одиночный выбор. Выбранный пункт ищется на всех уровнях (подпись и иконка на кнопке, галочка - на нём самом).
  С `withSearch` список при вводе плоский: совпадения со всех уровней, во второй строке путь родителей
  («Game Component › Character»). Подменю рисует `ModernPopup` через `showPopup` с `kind: 'submenu'` без оверлея. Подменю, заданное ресурсом и закрытое до загрузки, не появляется.
- `withSearch` - поиск в попапе (залитое поле `secondary`, отступ 0.75rem под кольцо фокуса); `autoSelect` - выбрать первый пункт, пока `selected` не задан (у легаси
  `ModernDropdown*` включён по умолчанию, здесь - явно). `itemParams` - параметры подписей пунктов.

### DateSelect, DateLabel

- `value` - timestamp, `null` / `undefined` - даты нет (`placeholder`, по умолчанию «Нет даты»). `mode`: `DATE`
  (по умолчанию), `DATETIME`, `TIMEONLY`. Дата - в порядке локали, год только не текущий; время - `HH:MM`
  (`formatDateValue`); между датой и временем тонкий разделитель `--theme-divider-color`, как в легаси (текст для
  чтения и копирования - через пробел).
- `DateSelect`: триггер `SelectButton` (`kind`, `size`, `chevron` - по умолчанию выключен, `fullWidth`, `tooltip`,
  `focusIndex` пробрасываются), по клику `DatePopup` в положении `top`; клик не доходит до строки и карточки под
  ним. `on:change` - новый timestamp или `null` (дату очистили); `bind:value` работает. `popupLabel` / `popupDetail` -
  заголовок и подсказка попапа, без них заголовок выбирает попап. `readonly` - тот же вид без попапа и наведения,
  вместо `editable={false}`: значение не бледнеет, как с `disabled`. Кнопка объявляет `aria-haspopup="dialog"`; открытый попап закрывается вместе с компонентом.
- `tone`: `warning`, `critical`, `overdue` - цвет иконки календаря, у `overdue` иконка перечёркнута (бывший
  `iconModifier`).
- `due` - срок: тон по близости даты (сегодня - `critical`, ближайшие 7 дней - `warning`, прошедший день - `overdue`)
  и подсказка при наведении «через / просрочено на N дней» (`DueDatePopup`, `getDueState`); `ignoreOverdue` - задача
  закрыта, без тона. Явный `tone` и `tooltip` важнее. Есть у обоих компонентов, замена легаси `DueDatePresenter`.
- `DateLabel`: не кнопка, шрифт и цвет места; иконка - `--global-secondary-TextColor`. Для таблиц, списков и
  карточек, где дату только показывают; чип (легаси `kind="list"`) - разметкой места.

### IconBox

- Не кнопка: `<span aria-hidden="true">` без фокуса и событий. Вид - как у `IconButton kind="secondary"` того же
  размера, чтобы стоять в ряд с кнопками. Иконка всегда `small`.
- `size` - высоты кнопок кита (`large`, `medium`, `small` по умолчанию, `extra-small`).
- `shape="round"` - круг на любом размере (иконка канала вместо `CircleButton`); по умолчанию прямоугольник, как у кнопок.
- Если по иконке кликают (выбор иконки, смена типа) - это `IconButton` с подписью, а не `IconBox`.

### ButtonGroup

- Ряд кнопок кита с `role="group"`; включённый пункт - `selected` у его кнопки. Виды только `secondary` и `ghost` (по
  умолчанию): невыбранные нейтральные, включённый - акцент на подложке; у залитых и акцентных видов включённый не отличить. Размер по умолчанию `small`.
- Пункт - `ButtonGroupItem` (`id`, `icon`, `label`, `tooltip`, `disabled`); пункту без текста нужен `tooltip`: это имя кнопки.
- Клик по включённому выключает его (`selected` → `undefined`, событие `select` с `null`), если не
  `allowDeselect={false}`.
- Кнопки получают id `btnGID-<id пункта>`, как у легаси-группы: по нему их ищут тесты.

### SelectButton

- Только триггер: попап (люди, объекты, статусы) открывает место по `on:click`, привязывает его к `element`
  (`bind:element`) и держит `pressed`, пока он открыт (`aria-expanded`). `hasMenu` всегда включён.
- `kind`: `secondary` (по умолчанию) - чип в диалоге и форме, `ghost` - значение в панели атрибутов и ячейке,
  `primary` и `brand` - акцентный выбор (легаси `primary` → `brand`); у них плейсхолдер цветом самой кнопки.
  `size` - как у кнопок, без `min` и `extra-large`; по умолчанию `small`.
- Презентер атрибута на ките берёт `kind` и `size` значениями кита. Как показать значение, задаёт не кит, а проп
  презентера `appearance` (`PresenterAppearance` из `@hcengineering/view`): `button`, `inline`, `heading`.
- Значение - `label` (имена и даты через `getEmbeddedLabel`) или default slot (аватар с именем). Значение весом 400,
  как в поле. `empty` по умолчанию - нет `label` и слота; со слотом задаётся явно.
- Плейсхолдер и его иконка - `--global-secondary-TextColor`; у выключенной кнопки - цвета disabled, чтобы пустое
  значение не читалось как выключенное.
- С `icon`, без текста значения, `placeholder` и `chevron` - квадратная кнопка с одной иконкой (компактные карточки),
  пока пуста - цвета плейсхолдера; доступное имя - `tooltip.label`.
- `chevron`: `false` / `true` / `hover` (место под стрелку остаётся, видна при наведении, фокусе и открытом попапе).
  Во время `loading` шеврон тускнеет вместе с подписью.
- По содержимому; `fullWidth` - на ширину места: значение слева, шеврон у правого края, длинное значение обрезается.
  По содержимому не сжимается во flex-строке (как `Button`), ширину ограничивает место (`max-width: 100%`).
  Саму ширину задаёт место. `wrap` - значение переносится, высота растёт от высоты размера. `justify: 'center'` ставит посередине только текст, иконка и шеврон остаются по краям.
  Действие рядом (открыть объект) - отдельный `IconButton` вне кнопки.

### SplitButton

- Две кнопки кита одного `kind` и `size`; `tertiary`, `positive-ghost`, `negative-ghost` (без заливки и рамки половинки не
  читаются) и `min` нет. `ghost` - тихое второстепенное действие: половинки без заливки, между ними короткий разделитель
  (`--kit-button-secondary-BorderColor`), подпись - как у ghost `Button`. `iconSize` - размер иконки главной кнопки. Вид выбирается по содержимому:
  - с текстом - половинки со своей заливкой и волосяным зазором, стрелка квадратная;
  - только иконка - компактно: общий контур, короткий разделитель цвета подписи, стрелка уже главной (2/3 высоты),
    иначе два квадрата читаются как две кнопки.
  По умолчанию `secondary`, `large`.
- `on:click` - главное действие. Связанные - `items` (`DropdownIntlItem`, как у `MenuButton`): кнопка со стрелкой
  открывает их списком сама, ведёт `aria-expanded` и сообщает выбор в `on:selected`. Без `items` - `on:menu` с кликом
  в `detail`, свой попап место открывает само и держит `menuPressed`. Подпись кнопки меню - `menuTooltip`, по
  умолчанию `ui.string.MoreOptions`.
- `hasMenu={false}` оставляет одну главную кнопку - для списка из одного действия.
- Без `label` и слота главная половина - квадрат с иконкой (`iconProps` - её цвет, например состояние устройства).
  `menuIcon` меняет стрелку: панель внизу экрана открывает меню вверх.
- `fill` - на всю ширину места, растёт главная кнопка; `alignStart` - её содержимое к началу (боковая панель).
- `id`, `aria-*`, `data-*` и прочие атрибуты уходят на главную кнопку. Во время `loading` кнопка меню темнеет вместе с
  главной (фон нажатия, без спиннера) и попап не открывает; `disabled` её не делает, чтобы не стать серой.

### Новые контролы

- `SegmentedControl` - не `ButtonGroup`: всегда выбран один, одна остановка Tab и стрелки (`radiogroup`); `ButtonGroup`
  остаётся для переключателей, которые можно выключить все. Сегменты сохраняют `data-id="tab-<id>"`.
- Какой компонент вкладок: `Tabs` - разделы или виды одного экрана, у каждой вкладки своё содержимое (вкладок может
  быть много, ряд прокручивается); `SegmentedControl` - значение или режим одного содержимого из 2-5 вариантов;
  `WorkbenchTab` - вкладка открытого объекта в полосе workbench или сайдбара; `ButtonGroup` - выключаемые панели.
- `Tabs` / `WorkbenchTab`: стрелки, Home, End; `WorkbenchTab` ищет соседей в ближайшем `[role=tablist]` места;
  крестик - `IconButton` с `ui.string.Close`. Ширину вкладки задаёт место. Кольцо фокуса `WorkbenchTab` - поверх своего
  края (`outline-offset: -1px`): полоса вкладок прокручивается и обрезала бы внешнее.
  Текстовые поля держат кольцо снаружи (`2px`): место под него у прокручиваемого родителя обеспечивает место.
- Цвета - токены темы: выбранное - `--button-selected-*`, акцент - `--button-primary-*` / `--button-brand-*`.
  `--global-accent-BackgroundColor` и `--global-ui-active-BackgroundColor` в акценте Intabia не переопределены и
  остаются синими. Легаси `kind="primary"` / `todo` у флажков - `kind="brand"`; у `Checkbox` и `Radio` рамка
  невыбранного цвета вида (как в легаси), выключенный - серая, ошибка - красная;
  выключенный `Toggle` - серый трек без цвета вида.
- Красный заливок один - `--button-negative-BackgroundColor` (кнопки, `ProgressBar`, `StatusIcon` negative); текст ошибки - `--global-error-TextColor`. `StatusMessage`: текст warning цветом предупреждения
  (`--theme-warning-color`), info - основным цветом, тон несёт значок. `ProgressCircle` - сине-фиолетовая дуга `--primary-bg-color` и бледная дорожка, как у легаси. `Slider` в pressed - цвет hover (pressed-токен
  почти чёрный на маленьком бегунке). `Steps`: будущий шаг - кольцо 1.5px `--global-tertiary-TextColor`, линия к нему
  того же цвета. `WorkspaceLogo`: точка над углом на расстоянии от логотипа, как у легаси, без выреза.
- Фокус-кольцо везде `outline: 2px solid var(--global-focus-BorderColor)` с отступом 2px и радиусом контрола. `Tabs` -
  кольцо вокруг подписи внутри высоты ряда (у прокручиваемого ряда запас 6px по бокам); у `SplitButton` с подписью
  кольцо половинки доходит до шва и не заходит на соседнюю; у крестика `Chip` кольцо внутри чипа; `WorkbenchTab` вне `[role=tablist]` сама
  в порядке Tab. Иконки-действия, которые компонент рисует сам (`Section`, `NavGroup`, `PanelHeader`), - `ghost`:
  `tertiary` в светлой теме фиолетовый.
- Навигация и меню: шеврон раскрытия (`NavGroup`, `NavItem`, как у `AccordionItem`) в покое `--global-secondary-TextColor`,
  под указателем `--global-primary-IconColor` на `--button-tertiary-hover-BackgroundColor`, выключенный
  `--global-disabled-TextColor`, поворот 0.15s; описание и счётчик `NavItem` вторичные, счётчик 500 и всегда справа (число - `count`, не
  `description`); у строки с `color` цвет несёт только метка. Строка `Menu` - 40px в одну строку и 58px с описанием; у
  пункта с `color` цветной только квадрат. У выбора (`selected` / `multiselect`) колонка галки справа у каждой строки, от
  текста spacing-3; галка, шеврон подменю и кнопка слота `actions` на одной вертикали. Разделители - на всю ширину меню.
  Список не выше 10,5 строки: 10 пунктов целиком, как у легаси (шапка и поиск сверх него): обрезанная строка показывает прокрутку, затухание - только на
  ней. Фокус-кольцо строки внутри строки (offset -2px). `embedded` с `width="fit"` заполняет место.
- `AccordionItem`: выбранный заголовок - серая плашка `--global-ui-hover-BackgroundColor`, подпись своим цветом (как в
  легаси); шеврон подсвечивается при наведении на любую часть шапки, кроме действий; заголовок
  основным цветом и у свёрнутой, и у раскрытой секции, у выключенной (и выключенной selectable, которая всё равно выбирается) - `--global-disabled-TextColor`; капсула medium в
  цветах крошек: подпись и иконка вторичным, открытая и плашка иконки - половина `--global-ui-hover-BackgroundColor`
  (5% в светлой, видна и в тёмной), свёрнутая без подложки (без шеврона это единственный признак), на hover текст на
  ступень темнее на `--global-ui-hover-BackgroundColor`; шапки large 56, medium 40, small и
  `filled` 32. `Breadcrumbs`: путь 500, текущая крошка 700, все вторичным цветом (как в легаси),
  путь при наведении на ступень темнее (`color-mix` 45% вторичного с основным); плашка иконки - половина `--global-ui-hover-BackgroundColor`
  (как в легаси), бейдж `after` - `--global-ui-hover-BackgroundColor` в 8px от названия (как в легаси). `ShowMore`: плашка 12/16px обычного веса, вторичный текст (основной на ховер), волосок `--theme-divider-color` и мягкая тень; в обрезанном виде стоит в чистой полосе под затуханием.
  `EmptyState`: `large` - иконка 28px на плашке 3.5rem; `small` - без заливки: без действия - светлая сплошная рамка, иконка 16px на мягком квадрате; одно действие «добавить» - `action`: пунктир (заливка на ховер), клик по всей плашке. Вид `large` - `brand` (по умолчанию, на него маппятся все BlankView) или `plate`.
- `List`: текущая строка в попапе и на панели одной подложкой `--button-tertiary-hover-BackgroundColor`, `highlighted` -
  `--button-selected-BackgroundColor`. `Chip` `tint` / `outline`: текст - 60% акцента в смеси с основным цветом.
  `NavGroup` `highlighted` / `pressed`: подпись основным цветом без подложки. `Calendar`: «сегодня» - цвет бренда и вес
  500, внутри диапазона - основным цветом с подчёркиванием.
- `Toggle`, `Checkbox`, `Radio`: нативный `input` поверх нарисованного контрола; доступное имя обязательно по типам
  (`label`, `aria-label`, `aria-labelledby`, у `Checkbox` ещё `decorative`); `readonly` не бледнеет, клик
  отменяется, `aria-readonly`. Наведение на невыбранный `Checkbox` / `Radio` подставляет галочку или точку цветом
  рамки, без ореола вокруг. Событие `change` - новое значение в `detail` (boolean или значение варианта) вместо
  нативного `Event` и `on:value` легаси.
- `DateSelect` получил `shifts` (быстрые сдвиги в попапе, замена `noShift`); режим `TIME` показывает только время.
- `NumberInput` приводит значение к диапазону и точности при фиксации (уход из поля, Enter, степпер, ↑/↓), не на
  каждом вводе; подписи степперов - `ui.string.Increase` / `Decrease`.
- `AccordionItem`: фон прилипшей шапки - CSS-переменная места `--accordion-header-BackgroundColor` (по умолчанию
  непрозрачный `--theme-panel-color`); сохранение
  «свёрнуто» остаётся месту (`open` + `on:toggle`).
- `AccordionItem` получил `size="small"` (строка-раскрытие без разделителей, замена `Expandable` и самодельных
  шапок с `Chevron`), `filled` (подложка с рамкой, бывший `bordered`) и `lazy`.
- Поля: `TextInput` / `TextArea` шлют `input` на каждую правку и `change` при фиксации (уход, Enter, очистка);
  `ghost` без боковых отступов и чистый в фокусе; `subtle` и ghost `SearchInput` на ховер - подложка, в фокусе - заливка и кольцо поля;
  свёрнутый `SearchInput` в покое - в цветах secondary-кнопки. Выключенное поле (`TextInput`, `TextArea`,
  `NumberInput`, ячейки `CodeInput`) без рамки, на подложке `--button-disabled-BackgroundColor`. Ведущая иконка поля -
  70%-смесь вторичного и основного текста. У `SearchInput` боковой отступ как у `TextInput` того же размера, свёрнутый -
  квадрат с лупой по центру. Поиск - `SearchInput`, число - `NumberInput`.
- `Dialog`: главная кнопка по умолчанию `brand`; `cancel` отменяемое (`preventDefault()` - подтверждение у места,
  `close` не придёт); Escape - только с `closeOnEscape`, остальное закрывает хост попапа. Отправляют только своя кнопка и Enter в поле (с
  `submitOnEnter`) - кнопка без `type` в содержимом диалог не отправляет; с `hideSubmit` Enter в поле ничего не нажимает. `WizardDialog` - отменяемое `select` для
  проверки шага.
- `Menu` говорит протоколом хоста попапов: `close` с id, `update` с массивом при мультивыборе, `submenu`. Кит
  `Dropdown` / `MenuButton` / `SplitButton` открывают `ModernPopup`.
- `DatePicker` закрывается с `{ value, end? }` или `null`; только дата - полдень UTC, как у легаси; поля диапазона названы «Дата начала» / «Дата окончания»; футер прижат к низу. `DateSelect` открывает `DatePicker`
  во всех режимах (в `time` / `timeonly` только поле `HH:MM`); без `popupLabel` у `due` заголовок «Add / Edit due date», как у легаси.
### Файлы, записи, ссылки

`ui-kit/file/`, `ui-kit/audio/`, `ui-kit/link/` - компоненты без модели: имя, размер, значок и источники картинок приходят пропсами. Типы папки - в её `types.ts`, в остальных `.ts` - логика. Иконки кита - в `ui-kit/_icons/` (подчёркивание держит папку первой в списке): `IconFileDownload`, `IconSaveFile` (то же «Скачать», крупнее - для шапки файла), `IconOpenFile` (нарисована с отступом от края, иначе кажется крупнее соседних), `IconZoomIn`/`IconZoomOut`, `IconGlobe`, `IconPlayFill`/`IconPauseFill`. Скелетон загрузки - `ui-kit/skeleton/Skeleton.svelte` (`width`, `height`, `radius`, `delay` - блик начинается позже, основа видна сразу).

- Значок - `FileBadgeData { label, color? }`: цвет - имя палитры (`Firework`), без цвета - нейтральная подложка; без подписи - иконка файла. Вид задаёт `variant` (`size` у карточек - размер файла в байтах); `row` - квадрат 1.5rem для строки списка рядом с миниатюрами фото. Внутренние классы значка (`.text`, `.long`) не пересекаются с глобальными `.icon`/`.label` легаси-презентеров.
- Картинка - `ImageSource`: `(width, height) => Promise<{ src, srcset? }>`; ссылку нужного размера отдаёт вызывающий код (`blobImage`/`pictureImage`/`pageImage` в `attachment-resources/src/components/file/blob.ts`, `preview.ts` в `drive-resources`). `FileImage` запрашивает её по фактической ширине места (шаг 32px, плотность - через `srcset`), грузит лениво и помнит загруженные `cacheKey`: заново смонтированная карточка не мигает.
- Размер карточек и превью ссылок известен до загрузки и не меняется после неё. У `LinkCard` картинка берётся только из `preview`, а текст - из `preview`, если он есть на вложении. Без него в рамке фиксированной высоты до загрузки скелетон, потом заголовок и описание из `details`; `details` ещё заполняют строку сайта. Картинка страницы (`LinkCard` сбоку или обложкой, ссылка в `FileTile`) грузится поверх скелетона, блик которого начинается через 150 мс, и проявляется за 0.2 с. Уже загруженная показывается сразу, без скелетона (`revealImage`, `link/utils.ts`, класс `picture-loading` на её рамке).
- Меню, просмотрщик и права - снаружи: компонент шлёт `open`, `remove`, `retry`, `contextmenu` (`FileTile` - только `open`, `remove`, `retry`). Вид наведения, например пока открыто меню, держит `highlighted` (`FileCard`, `AudioCard`, `LinkCard`, `LinkCoverCard`). `FileTile`: подпись вместо имени - `nameLabel`, ключ записи в плеере - `playbackId`. Общая поверхность карточки и бумажный лист страницы - миксины `file/_surface.scss`. Списки добавляют свои строки через слоты (`FileCard`, `LinkCoverCard`).
- Плеер: один `<audio>` на приложение - `sharedPlayback()` (`audio/playback.ts`). Карточка подписана на свою запись через `playbackOf` и перерисовывается, только когда играет она. Запись останавливается, когда пропала последняя её карточка; место, где её оставили, запоминается. Ширину карточки и волны меняют `--audio-card-width` и `--waveform-max-width`. Скорость - `RateButton`, одна на все записи, в слоте постоянной ширины справа; видна у текущей записи и при наведении. Волна - `loadWaveform` (`audio/peaks.ts`), без волны (файл больше лимита или волна не прочиталась) - линия `SeekLine`; обе - ползунки через action `seekable` (`audio/seek.ts`: `role="slider"`, клик, стрелки по 5 с, Home/End). Длительность читается по заголовку через `<audio preload="metadata">` (`loadDuration`, `audio/duration.ts`, ждёт не дольше 15 с): так время видно до запуска, а у файла без известной длины она проверяется до декодирования волны. Кэши волны и длины - по записи и адресу.
- Ссылки: `linkLayout`, `linkTarget`, `describeLink`, `webUrl`, `openLink` (`link/utils.ts`) - открываются только `http(s)`. `SiteIcon` - иконка из деталей, иначе favicon по домену, иначе глобус; `SiteTile` - обложка сайта для `LinkCoverCard` (apple-touch-icon, затем favicon, затем первая буква домена).
- Форматы - `formatMediaDuration`, `formatFileSize` (`file/format.ts`).
- Размеры - в rem; px только для линий в 1px и поправок на них. Цвета - токены темы: тени - доля `--global-popover-ShadowColor`, бумага страницы - `--white-color`, затемнение и текст поверх фото и видео - `--global-media-OverlayColor`, `--global-on-media-TextColor`.

## Правила

- Новый базовый компонент (кнопка, поле, переключатель, ...) - только сюда, не в `components/` и не в плагин.
- Внешний вид задают токены темы (`packages/theme/styles`), стили scoped в самом компоненте; глобальные
  классы под кит не заводятся.
- Токены кнопок, которые акцент перекрашивает у легаси (`secondary`, `subtle`, `primary`, текст `tertiary`), кит читает
  как `--kit-button-*`: акцент меняет легаси-кнопки, а у кита свои значения (`_lumia-colors.scss`, блоки акцентов
  в `_accent-colors.scss`). Когда легаси-кнопки уйдут, `--kit-button-*` сливаются обратно в `--button-*`.
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
- Обзоры групп (`src/overview/`, раздел «Overview»): поля ввода и формы, попапы и меню, диалоги и мастера - страница
  «Kit» (Variants компонентов кита). Страницу собирает
  `StoryStack.svelte` из готовых историй через `entry(title, module, export)`, заголовок ведёт на исходную историю;
  новый компонент группы - строка `entry` в её `*.stories.ts`.
- «Overview/Color map» - все цветовые токены, которые кит использует в стилях и разметке, с компонентами; список
  собирается из исходников `packages/ui/src/ui-kit` через `import.meta.glob` (типы - `src/vite-env.d.ts`), значения -
  для текущей темы. Живой пример в строке (`TokenSpecimen.svelte`) берёт вариант из селектора вокруг токена (`&--neutral`,
  `&--tone-ghost`, `:disabled`); токен ховера показан вторым образцом с подменой базового токена.
- «Overview/Red tokens» - все красные кита с токеном, значением в текущей теме, ролью и примером. Правило: всё, что
  касается ошибок (рамка `error` флажка и радио, StatusIcon `error` (StatusMessage, Toast error, ошибка интеграции), текст ошибки, звёздочка, просрочка), -
  `--global-error-TextColor`, а рамка ошибки полей ввода (TextInput, TextArea, CodeInput) - `--input-error-BorderColor`,
  как у легаси; негативные и опасные действия (Button `negative`, `kind="negative"` у Checkbox, Radio, Toggle,
  ProgressBar) - `--button-negative-BackgroundColor`, без заливки - `--theme-state-negative-color`.
- Хосты попапов и тултипов монтируются один раз в `.storybook/preview.ts`.
- Проверки: `pnpm svelte-check --to @hcengineering/storybook` (typecheck историй), eslint - через `pnpm format`.
  В `pnpm build` Storybook не входит.

## Точка входа

`./kit` объявлен в `exports` пакета `packages/ui/package.json`. С появлением `exports` резолвятся только
перечисленные в нём пути, поэтому там же оставлены глубокие импорты `@hcengineering/ui/src/*` (типы, цвета,
`lang`, `plugin`) и `lang/*.json`. Новая глубокая точка входа в `ui` - сначала строка в `exports`.
