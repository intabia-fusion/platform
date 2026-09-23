# Платформенные утилиты (emoji, tags, templates, achievement, survey, rating, questions, inventory, products, print)

> Сверено с кодом: коммит 39ae47eb6f, 2026-09-23.

Набор небольших независимых модулей платформы: кастомные эмодзи, цветные метки (tags), шаблоны сообщений с подстановками, значки достижений, опросы, рейтинг документов и пользователей, банк вопросов для тестов, товарный каталог (inventory) и QMS-продукты с версионированием.

## Где код

| Пакет | Путь | Роль |
| --- | --- | --- |
| models/emoji | `models/emoji/src` | модель `TCustomEmoji`, настройка воркспейса |
| plugins/emoji | `plugins/emoji/src` | id плагина, ресурсы (Resource) пикера |
| plugins/emoji-resources | `plugins/emoji-resources/src` | UI: пикер, категории, skin tone |
| plugins/emoji-assets | `plugins/emoji-assets/src` | иконки/переводы |
| models/tags | `models/tags/src` | `TTagElement`, `TTagReference`, `TTagCategory`, фильтры |
| plugins/tags | `plugins/tags/src` | id плагина, аналитика |
| plugins/tags-resources | `plugins/tags-resources/src` | UI меток (30+ компонентов) |
| plugins/tags-assets | `plugins/tags-assets/src` | иконки/переводы |
| server-plugins/tags | `server-plugins/tags/src` | описание триггера `onTagReference` |
| server-plugins/tags-resources | `server-plugins/tags-resources/src` | реализация триггера и каскадного удаления |
| models/templates | `models/templates/src` | действия (Copy/Move/EditGroup), миграция дефолтного спейса |
| plugins/templates | `plugins/templates/src` | `MessageTemplate`, `TemplateField`, `TemplateDataProvider` |
| plugins/templates-resources | `plugins/templates-resources/src` | UI шаблонов, `fillTemplate` |
| plugins/templates-assets | `plugins/templates-assets/src` | иконки/переводы |
| server-plugins/templates | `server-plugins/templates/src` | `ServerTemplateField` (мixin-описание) |
| models/server-templates | `models/server-templates/src` | wiring `TServerTemplateField` в билдер модели |
| models/achievement | `models/achievement/src` | `PersonAchievementsPresenter` |
| plugins/achievement | `plugins/achievement/src` | значки Earliest Adopter/Epic/Legendary |
| plugins/achievement-resources | `plugins/achievement-resources/src` | презентер в профиле |
| plugins/achievement-assets | `plugins/achievement-assets/src` | иконки/переводы |
| models/survey | `models/survey/src` | `TSurvey`, `TPoll`, приложение Surveys, дефолтный спейс |
| plugins/survey | `plugins/survey/src` | id плагина, типы |
| plugins/survey-resources | `plugins/survey-resources/src` | UI опросов/голосований |
| plugins/survey-assets | `plugins/survey-assets/src` | иконки/переводы |
| models/rating | `models/rating/src` | `TPersonRating`, `RatingWidget` |
| plugins/rating | `plugins/rating/src` | `DocRating`, `DocReaction`, `ReactionKind` |
| plugins/rating-resources | `plugins/rating-resources/src` | UI рейтинга |
| plugins/rating-assets | `plugins/rating-assets/src` | иконки/переводы |
| server-plugins/rating | `server-plugins/rating/src` | `RatingMiddleware` - запрет прямых правок |
| services/rating | `services/rating/src` (пакет `@hcengineering/pod-rating`) | отдельный под, пересчитывает рейтинг из очереди транзакций |
| models/questions | `models/questions/src` | `TQuestion`, типы вопросов, `TQuestionMixin` |
| plugins/questions | `plugins/questions/src` | id плагина, типы |
| plugins/questions-resources | `plugins/questions-resources/src` | утилиты оценки ответов, UI |
| plugins/questions-assets | `plugins/questions-assets/src` | иконки/переводы |
| models/inventory | `models/inventory/src` | действие `CreateSubcategory` |
| plugins/inventory | `plugins/inventory/src` | `Category`/`Product`/`Variant` (каталог) |
| plugins/inventory-resources | `plugins/inventory-resources/src` | UI: `Categories.svelte`, `HierarchyView.svelte` |
| plugins/inventory-assets | `plugins/inventory-assets/src` | иконки/переводы |
| server-plugins/inventory | `server-plugins/inventory/src` | описание `ProductUrlPresenter` |
| server-plugins/inventory-resources | `server-plugins/inventory-resources/src` | реализация presenter'а ссылки на продукт |
| models/server-inventory | `models/server-inventory/src` | wiring presenter'а в activity |
| models/products | `models/products/src` | роли QARA/Manager/Qualified User, действие `DeleteProductVersion` |
| plugins/products | `plugins/products/src` | `Product`, `ProductVersion` (поверх controlled-documents) |
| plugins/products-resources | `plugins/products-resources/src` | UI версий продукта, change control |
| plugins/products-assets | `plugins/products-assets/src` | иконки/переводы |
| models/server-products | `models/server-products/src` | `SearchPresenter` для глобального поиска |
| models/print | `models/print/src` | действие "Print to PDF", DOCX-превью |
| plugins/print | `plugins/print/src` | id плагина, `printToPDF`/`convertToHTML` (HTTP-клиент к поду) |
| plugins/print-resources | `plugins/print-resources/src` | UI печати, публичная ссылка + подпись PDF |
| plugins/print-assets | `plugins/print-assets/src` | иконки/переводы |
| services/print | `services/print/pod-print/src` (пакет `@hcengineering/pod-print`) | отдельный под: рендер страницы в PDF/картинку, конвертация DOCX |

Важно: `inventory.Product` (товар каталога) и `products.Product` (версионируемый QMS-продукт) - два разных, не связанных класса с одинаковым именем в разных плагинах.

## Модель данных

| Класс/интерфейс | Смысл | Файл |
| --- | --- | --- |
| `TCustomEmoji` | кастомный эмодзи организации, `shortcode` + `image: Ref<Blob>` | `models/emoji/src/models.ts` |
| `TTagElement` | метка: `title`/`targetClass`/`color`/`category` | `models/tags/src/index.ts` |
| `TTagReference` | привязка метки к документу, поле `weight` | `models/tags/src/index.ts` |
| `TTagCategory` | категория меток (icon/label/tags/default) | `models/tags/src/index.ts` |
| `MessageTemplate` | шаблон сообщения `title` + `message: Markup` | `plugins/templates/src/index.ts` |
| `TemplateField` / `ServerTemplateField` | вычисляемое поле `${...}`, серверная реализация | `plugins/templates/src/index.ts`, `server-plugins/templates/src/index.ts` |
| `TSurvey` | опрос: `name` (fulltext), `prompt`, `questions?` | `models/survey/src/types.ts` |
| `TPoll` | голосование, attached к `TSurvey`, `isCompleted` | `models/survey/src/types.ts` |
| `DocRating` | агрегированный рейтинг документа | `plugins/rating/src/index.ts` |
| `DocReaction` / `ReactionKind` | реакция (Emoji=0/Star=1/RateValue=3, 0..10) | `plugins/rating/src/index.ts` |
| `TPersonRating` | персональная статистика (months/days/hours, starsEarned, rageOperations) | `models/rating/src/index.ts` |
| `TQuestion<QuestionData>` | вопрос: `rank`, `title`, `owner: Ref<Employee>`, `releasedOn/By` | `models/questions/src/doc-types/base.ts` |
| `TSingleChoiceQuestion`/`TMultipleChoiceQuestion`/`TOrderingQuestion` | три готовых типа вопросов | `models/questions/src/doc-types/questions/{SingleChoice,MultipleChoice,Ordering}.ts` |
| `TQuestionMixin` | расширяемый миксин кастомного типа вопроса | `models/questions/src/doc-types/mixin.ts` |
| `Category`/`Product`/`Variant` (inventory) | иерархия каталога, `Variant.sku` | `plugins/inventory/src/index.ts` |
| `Product` (products) | внешний спейс controlled-documents, `fullDescription`/`attachments` | `plugins/products/src/types.ts` |
| `ProductVersion` | `major/minor/patch`, `codename`, `state`, `parent`, `changeControl?: Ref<Document>` | `plugins/products/src/types.ts` |

Веса знания у `TTagReference.weight`: `InitialKnowledge = 0\|1\|2`, `MeaningfullKnowledge = 3\|4\|5`, `ExpertKnowledge = 6\|7\|8` - `plugins/tags/src/index.ts`.

`Product`/`ProductVersion` наследуют `ExternalSpace`/`Project`/`Document` из `@hcengineering/controlled-documents` (`plugins/products/src/types.ts`) - модуль products - специализация QMS-подсистемы controlled-documents, описана отдельно (см. "Связанные документы").

## Как работает

1. **Метка на документе (tags).** Клиент создает `TTagReference` через `TagsEditor`/`TagsAttributeEditor` (`plugins/tags-resources/src/components/TagsAttributeEditor.svelte`) -> сервер матчит триггер по `TxCreateDoc`/`TxRemoveDoc` класса `TagReference` (`models/server-tags/src/index.ts`) -> вызывается `OnTagReference` (`server-plugins/tags-resources/src/index.ts`) -> при удалении `TTagElement` триггерится каскадное удаление через `ObjectDDParticipant`/`TagElementRemove` (`server-plugins/tags-resources/src/index.ts`).
2. **Подстановка в шаблон сообщения.** UI открывает `TemplatePopup.svelte`, `TemplateDataProvider.fillTemplate` (`plugins/templates-resources/src/utils.ts`) ищет `${...}` по `templateFieldRegexp` (`plugins/templates/src/index.ts`) и подставляет значения полей, включая серверные `ServerTemplateField` (`server-plugins/templates/src/index.ts`).
3. **Пересчет рейтинга.** Прямая правка `DocRating`/`PersonRating` с клиента блокируется `RatingMiddleware.validateReactionUpdate` (`server-plugins/rating/src/index.ts`, запрет дублей, значение вне 0..10). Фактический пересчет делает отдельный под `pod-rating`: `WorkspaceManager.startRatingCalculator` (`services/rating/src/manager.ts`) поднимает `RatingCalculator` (`services/rating/src/calculator.ts`), читающий очередь транзакций Kafka (`getPlatformQueue`, `services/rating/src/index.ts`) и пишущий агрегаты напрямую в Postgres.
4. **Печать документа в PDF.** Клиент вызывает `printToPDF(link, token)` (`plugins/print/src/utils.ts`) -> HTTP GET `/print` на под `pod-print` -> `createServer` проверяет токен через account-client и allowlist хоста (`services/print/pod-print/src/server.ts`) -> `print()` открывает страницу в headless Chrome (puppeteer) и рендерит PDF/скриншот (`services/print/pod-print/src/print.ts`) -> результат кладется в storage воркспейса.
5. **Конвертация DOCX для превью.** `GET /convert/:file` на `pod-print` читает файл из storage, конвертирует через `mammoth.convertToHtml` (`services/print/pod-print/src/convert.ts`) и кэширует HTML по `file@etag` (`services/print/pod-print/src/server.ts`); клиент показывает результат в `DOCXViewer.svelte`.
6. **Прохождение теста (вопросы + training).** Модуль `questions` не имеет собственного UI-приложения - вопросы/ответы/оценка используются модулем `models/training`, `plugins/training-resources` (`plugins/training-resources/src/components/TrainingPanelQuestions.svelte`); проходной балл считает `calculateAnswersToPass` (`plugins/questions-resources/src/utils/calculateAnswersToPass.ts`), оценку одного ответа - `assessAnswer` (`plugins/questions-resources/src/utils/assessAnswer.ts`).

## Фичи

### Emoji
- **Кастомные эмодзи организации.** Домен `emoji`, `shortcode` + `image: Ref<Blob>`. - `TCustomEmoji`, `models/emoji/src/models.ts`.
- **Пикер с категориями и поиском.** Категории SmileysAndPeople/AnimalsAndNature/FrequentlyUsed и т.д. - `EmojiPopup.svelte`, `plugins/emoji-resources/src/components/EmojiPopup.svelte`.
- **Тональность кожи.** Выбор skin tone для эмодзи-людей. - `SkinTonePopup.svelte`/`SkinToneTooltip.svelte`, `GetEmojiByShortCode`, `plugins/emoji/src/plugin.ts`.
- **Разбор текста с эмодзи.** Ресурс возвращает узлы и флаг "только эмодзи". - `ParseTextWithEmojis`, `plugins/emoji/src/plugin.ts`, тип в `plugins/emoji/src/types.ts`.
- **Эмодзи в настройках воркспейса.** Таблица кастомных эмодзи в настройках. - `SettingsEmojiTable.svelte`, `models/emoji/src/index.ts`.
- **Бордер выбранной кнопки эмодзи.** Fallback `transparent` для `--button-primary-BorderColor`. - `EmojiButton.svelte`, коммит `8c472b4b88`.

### Tags
- **Цветные метки с привязкой к классу.** - `TTagElement`, `models/tags/src/index.ts`.
- **Привязка к документу с весом знания.** 3 уровня (0-2/3-5/6-8). - `TTagReference`, `models/tags/src/index.ts`.
- **Категории меток.** - `TTagCategory`, `models/tags/src/index.ts`.
- **Фильтры по меткам.** "Есть метка"/"Нет метки". - `FilterTagsIn`/`FilterTagsNin`, `plugins/tags/src/index.ts`.
- **Серверная синхронизация при создании/удалении ссылки на метку.** - `OnTagReference`, `server-plugins/tags-resources/src/index.ts`.
- **Каскадное удаление ссылок при удалении метки.** - `TagElementRemove`, `server-plugins/tags-resources/src/index.ts`.
- **Аналитика создания/удаления меток.** - `TagsEvents.TagCreated`/`TagRemoved`, `plugins/tags/src/analytics.ts`.
- **(FUSIO-812) Ограничение длины названия/описания.** `MAX_TITLE_LENGTH=64`, `MAX_DESCRIPTION_LENGTH=256` с автообрезкой. - `plugins/tags-resources/src/components/CreateTagElement.svelte`, коммит `e70cf67d79`.
- **(FUSIO-675/813/777) UI и презентация меток.** Правки `LabelsPresenter`/`TagReferencePresenter`/`TagsAttributeEditor`/`TagsPopup`/`CreateTagElement`/`EditTagElement`/`TagsView`. - коммиты `5a351aad48`, `d39b11abec`, `83de7bce80`.

### Templates
- **Шаблоны сообщений с плейсхолдерами.** `title` + `message: Markup` в спейсе `TemplateCategory`. - `MessageTemplate`, `plugins/templates/src/index.ts`.
- **Вычисляемые поля `${...}`.** Regex + провайдер подстановки, включая серверные поля. - `templateFieldRegexp`, `TemplateDataProvider.fillTemplate`, `plugins/templates/src/index.ts`, `plugins/templates-resources/src/utils.ts`.
- **Копирование/перемещение/групповое редактирование.** - `Copy.svelte`/`Move.svelte`/`EditGroup.svelte`, `plugins/templates-resources/src/components/`.
- **Публичный спейс "Public templates" по умолчанию.** Миграция создает `private:false, autoJoin:true`. - `models/templates/src/migration.ts`.

### Achievement
- **Значки достижений.** Earliest Adopter / Epic / Legendary. - `plugins/achievement/src/index.ts`.
- **Показ в профиле.** ComponentPointExtension. - `PersonAchievementsPresenter`, `models/achievement/src/plugin.ts`.
- Серверной части нет.

### Survey
- **Документ-опрос.** `name` (fulltext), `prompt`, `questions?: Question[]`. - `TSurvey`, `models/survey/src/types.ts`.
- **Голосование (Poll).** Attached-документ к опросу, `isCompleted`. - `TPoll`, `models/survey/src/types.ts`.
- **Приложение "Surveys" с дефолтным спейсом.** - `models/survey/src/index.ts`, `createDefaultSpace(..., {name:'Surveys'})`, `models/survey/src/migration.ts`.
- Серверной части нет.

### Rating
- **Рейтинг документа.** rating/updates/messages/stars/reactions. - `DocRating`, `plugins/rating/src/index.ts`.
- **Реакции трех типов.** Emoji(0)/Star(1)/RateValue(3, 0..10). - `ReactionKind`, `plugins/rating/src/index.ts`.
- **Персональный рейтинг со статистикой.** months/days/hours, starsEarned, rageOperations. - `TPersonRating`, `models/rating/src/index.ts`.
- **Серверная защита от прямых правок и дублей.** - `RatingMiddleware`, `server-plugins/rating/src/index.ts`.
- **Виджет и редактор заголовка.** - `RatingWidget`/`RatingEditor`, `models/rating/src/index.ts`.
- **Отдельный под-калькулятор рейтинга.** Слушает Kafka-очередь транзакций воркспейса, пишет агрегаты в Postgres. - `@hcengineering/pod-rating`, `services/rating/src/manager.ts`, `services/rating/src/calculator.ts`.

### Questions
- **Вопрос/оценка/ответ с рангом и владельцем.** - `TQuestion`/`TAssessment`/`TAnswer`, `models/questions/src/doc-types/base.ts`.
- **Три готовых типа вопросов.** Single/Multiple choice, Ordering (+ данные/оценка/ответ для каждого). - `models/questions/src/doc-types/questions/{SingleChoice,MultipleChoice,Ordering}.ts`.
- **Расширяемый миксин кастомного типа.** presenter/editor/answerClassRef. - `TQuestionMixin`, `models/questions/src/doc-types/mixin.ts`.
- **Типы Rank/Percentage.** - `TTypeRank`/`TTypePercentage`, `models/questions/src/doc-types/base.ts`.
- **Оценка ответа и расчет проходного балла.** - `assessAnswer`, `calculateAnswersToPass`, `plugins/questions-resources/src/utils/assessAnswer.ts`, `.../calculateAnswersToPass.ts`.
- **Потребитель - модуль training.** UI вопросов/тестов встроен в `models/training`/`plugins/training-resources`, отдельного приложения у questions нет.

### Inventory / Products
- **Иерархия каталога Категория -> Продукт -> Вариант.** `Variant.sku`. - `plugins/inventory/src/index.ts`; UI `Categories.svelte`/`HierarchyView.svelte`.
- **Создание подкатегории.** - `action.CreateSubcategory`, `models/inventory/src/plugin.ts`.
- **Ссылка на продукт в activity-фиде.** - `ProductUrlPresenter`, `server-plugins/inventory-resources/src/index.ts`.
- **QMS-продукт как внешний спейс controlled-documents.** `fullDescription`, `attachments`. - `Product`, `plugins/products/src/types.ts`.
- **Версии с семантическим версионированием.** major/minor/patch/codename/state(Active\|Released)/parent. - `ProductVersion`, `plugins/products/src/types.ts`.
- **Связка версии с change control документом.** - `changeControl?: Ref<Document>`, `ChangeControlInlineEditor.svelte`, `plugins/products-resources/src/components/product-version/ChangeControlInlineEditor.svelte`.
- **Роли продукта.** QARA / Manager / Qualified User, права controlled-documents. - `models/products/src/roles.ts`.
- **Удаление версии продукта.** - `action.DeleteProductVersion` + `CanDeleteProductVersion`, `models/products/src/plugin.ts`.
- **Поиск продукта в глобальном поиске.** SearchPresenter по name/icon/color. - `models/server-products/src/index.ts`.

### Print
- **Печать документа в PDF.** Публичная ссылка + рендер в headless Chrome. - `printToPDF`, `plugins/print/src/utils.ts`; `print()`, `services/print/pod-print/src/print.ts` (puppeteer).
- **Массовая печать.** - `PrintBulkToPDF.svelte`, `plugins/print-resources/src/components/PrintBulkToPDF.svelte`.
- **Подпись PDF после генерации.** Использует сервис `sign` (см. `docs/memory/qms-tests-integration.md`). - `plugins/print-resources/src/printUtils.ts` (импорт `signPDF` из `@hcengineering/sign`).
- **Просмотр DOCX превью через конвертацию в HTML.** - `convertToHTML`, `plugins/print/src/utils.ts`; `convertToHtml` (mammoth), `services/print/pod-print/src/convert.ts`; `DOCXViewer.svelte`.
- **Действие "Print to PDF" на любом документе.** - `models/print/src/index.ts`, видимость через `CanPrint`.

## Куда смотреть, если нужно...

- Добавить категорию/иконку эмодзи -> `plugins/emoji/src/plugin.ts`, `plugins/emoji-resources/src/components/EmojiPopup.svelte`.
- Изменить диапазоны веса знания метки -> `plugins/tags/src/index.ts` (`InitialKnowledge`/`MeaningfullKnowledge`/`ExpertKnowledge`).
- Поменять лимит длины названия/описания метки -> `plugins/tags-resources/src/components/CreateTagElement.svelte`.
- Добавить каскадную реакцию на удаление TagElement -> `server-plugins/tags-resources/src/index.ts` (`TagElementRemove`).
- Добавить новое вычисляемое поле шаблона -> `plugins/templates/src/index.ts` (`TemplateField`) + `server-plugins/templates/src/index.ts` для серверных.
- Изменить правила серверной защиты рейтинга (диапазон значений, антидубли) -> `server-plugins/rating/src/index.ts` (`RatingMiddleware`).
- Поменять логику пересчета/агрегации рейтинга -> `services/rating/src/calculator.ts` (`RatingCalculator`).
- Добавить новый тип вопроса (кроме Single/Multiple/Ordering) -> `models/questions/src/doc-types/mixin.ts` (`TQuestionMixin`) + новый файл по образцу `doc-types/questions/*.ts`.
- Изменить формулу проходного балла теста -> `plugins/questions-resources/src/utils/calculateAnswersToPass.ts`.
- Добавить поле/уровень в иерархию каталога inventory -> `plugins/inventory/src/index.ts`, UI `plugins/inventory-resources/src/components/HierarchyView.svelte`.
- Изменить права ролей продукта (QARA/Manager/Qualified User) -> `models/products/src/roles.ts`.
- Поменять формат/margin PDF или таймауты рендера -> `services/print/pod-print/src/print.ts`.
- Изменить allowlist хостов или порт пода печати -> `services/print/pod-print/src/config.ts` (`ALLOWED_HOSTNAMES`, `PORT`, дефолт 4005).

## Настройки и конфигурация

- `pod-print`: `PORT` (по умолчанию 4005), `SECRET`, `ACCOUNTS_URL`, `ALLOWED_HOSTNAMES` (whitelist доменов для `/print`), `PUPPETEER_ARGS` - `services/print/pod-print/src/config.ts`.
- `print.metadata.PrintURL` - адрес пода печати, читается клиентом через `getMetadata` - `plugins/print/src/utils.ts`.
- `pod-rating`: `DB_URL`, `ACCOUNTS_URL`, `SERVER_SECRET`, `MODEL_JSON` - `services/rating/src/index.ts`.

## Тесты

- Юнит-тест конвертации/печати: `plugins/print-resources/src/printUtils.test.ts`.
- Юнит-тест калькулятора рейтинга: `services/rating/src/__tests__/raiting.spec.ts`.
- Sanity (Playwright), печать документа в PDF: `tests/sanity/tests/documents/documents-print-preview.spec.ts`.
- Sanity QMS (products/controlled-documents), в т.ч. связка с training-продуктом: `qms-tests/sanity/tests/documents/REQ-10.spec.ts`.
- Выделенных sanity-тестов на emoji/tags/templates/achievement/survey/rating/questions/inventory нет - эти модули косвенно затрагиваются в `tests/sanity/tests/chat/*`, `tests/sanity/tests/workspace/workspace-settings.spec.ts`.

## Связанные документы

- [Controlled Documents (QMS) - обзор](../controlDocumentsOverview.md) - базовый модуль, на котором построен `products`.
- [QMS sanity tests integration](../memory/qms-tests-integration.md) - интеграция qms-тестов, включая сервис `sign`, используемый print-подсистемой для подписи PDF.
