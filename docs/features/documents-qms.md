# Документы и QMS (controlled documents)

> Сверено с кодом: коммит 39ae47eb6f, 2026-09-23.

Подсистема из двух слоёв: обычные документы (`document` - вики-страницы в teamspace) и управляемые документы (`controlled-documents` - QMS-модуль для регламентированного документооборота, ISO 13485). Оба используют общий совместный текстовый редактор (`text-editor` + Yjs-сервер `collaborator`), markdown-экспорт (`converter`) и просмотр различий версий. Сущности: `Document`/`DocumentSnapshot` (обычные), `ControlledDocument` с версией `major.minor`, состояниями `DocumentState`/`ControlledDocumentState`, вложениями `DocumentAttachment` и `ChangeControl` (Reason & Impact).

## Где код

| Пакет | Путь | Роль |
| --- | --- | --- |
| model-document | `models/document/src` | Модель `Document`/`Teamspace`/`DocumentSnapshot`, миграции, permissions |
| document | `plugins/document/src` | Типы (`Document.parent/rank/lockedBy`, `Teamspace`), utils, analytics |
| document-resources | `plugins/document-resources/src` | UI: навигатор-иерархия, редактор, History/References sidebar (снапшоты Yjs) |
| document-assets | `plugins/document-assets` | Локализация |
| model-controlled-documents | `models/controlled-documents/src` | Модель `ControlledDocument`, роли, права, space type, actions |
| controlled-documents | `plugins/controlled-documents/src` | Типы QMS-домена, `docutils.ts` (создание из шаблона) |
| controlled-documents-resources | `plugins/controlled-documents-resources/src` | UI: review/approval workflow, комментарии, вложения, diff, print |
| controlled-documents-assets | `plugins/controlled-documents-assets` | Локализация |
| model-text-editor | `models/text-editor/src` | Регистрация action-функций (`function.*`) редактора |
| text-editor | `plugins/text-editor/src` | Типы: `TextFormatCategory`, `AwarenessState`, `CollaboratorType` |
| text-editor-resources | `plugins/text-editor-resources/src` | tiptap kit, Yjs-провайдер, mentions, drawing board, inline comments, table-diff |
| text-editor-assets | `plugins/text-editor-assets` | Локализация |
| collaborator | `server/collaborator/src` | Yjs-сервер (Hocuspocus): загрузка/сохранение Y.Doc, RPC для истории версий |
| pod-collaborator | `pods/collaborator/src` | Точка входа/бандл для деплоя collaborator-сервиса |
| server-document | `server-plugins/document/src` | Декларации `function.*` (URL, link-провайдер, дочерние документы) |
| server-document-resources | `server-plugins/document-resources/src` | Реализация этих функций |
| server-controlled-documents | `server-plugins/controlled-documents/src` | Декларации триггеров жизненного цикла |
| server-controlled-documents-resources | `server-plugins/controlled-documents-resources/src` | Реализация триггеров |
| model-converter | `models/converter/src` | Миксин `TMarkdownValueFormatter` |
| converter | `plugins/converter/src` | API markdown-экспорта (mixin/function/action) |
| converter-resources | `plugins/converter-resources/src` | Построение markdown-таблиц, escape, форматтеры значений |
| diffview | `plugins/diffview/src` | Типы unified-diff (`DiffHunk`/`DiffFile`/`DiffLineType`) |
| diffview-resources | `plugins/diffview-resources/src` | `DiffView`/`InlineDiffView`/`Highlight` на базе `diff2html` |
| diffview-assets | `plugins/diffview-assets` | Локализация |

## Модель данных

| Класс/тип | Смысл | Файл |
| --- | --- | --- |
| `Document` (plain) | Вики-страница: `title`, `content: MarkupBlobRef`, `parent`, `space: Teamspace`, `rank`, `lockedBy` (блокировка при редактировании) | `plugins/document/src/types.ts` |
| `Teamspace` | Пространство обычных документов | `plugins/document/src/types.ts` |
| `HierarchyDocument`/`Document` (QMS) | Базовый документ QMS-иерархии: `seqNumber`/`major`/`minor`, `state`, `content`, `author`/`owner`, `category`, `attachments` | `plugins/controlled-documents/src/types.ts` |
| `ControlledDocument` | `extends HierarchyDocument`: `reviewers`/`approvers`/`externalApprovers`/`coAuthors`, `controlledState`, `plannedEffectiveDate`/`effectiveDate`, `changeControl` | `plugins/controlled-documents/src/types.ts` |
| `DocumentState` | `Draft / Effective / Archived / Deleted / Obsolete` | `plugins/controlled-documents/src/types.ts` |
| `ControlledDocumentState` | `InReview / Reviewed / InApproval / Approved / Rejected / ToReview` | `plugins/controlled-documents/src/types.ts` |
| `ChangeControl` | Reason & Impact: `description`/`reason`/`impact`/`impactedDocuments` | `plugins/controlled-documents/src/types.ts` |
| `DocumentAttachment` | Миксин на `Attachment`: `state: 'new'\|'referenced'`, `deletedIn: {major,minor}\|null` (мягкое удаление по версии) | `plugins/controlled-documents/src/types.ts` |
| `DocumentTemplate` | Миксин-шаблон: `sequence`, `docPrefix` | `plugins/controlled-documents/src/types.ts` |
| `DocumentTraining` | Миксин интеграции с тренингами (`training`/`roles`/`trainees`) | `plugins/controlled-documents/src/types.ts` |
| `DocumentRequest`/`DocumentReviewRequest`/`DocumentApprovalRequest` | Синонимы `Request` (из `@hcengineering/request`) - собственно review/approval заявки | `plugins/controlled-documents/src/types.ts` |
| `ProjectDocument`/`ProjectMeta`/`DocumentMeta` | Иерархия документов в пространстве (дерево, путь родителей) | `plugins/controlled-documents/src/types.ts` |
| `DocumentCategory` | Категория (акроним, фильтрация/права) | `plugins/controlled-documents/src/types.ts` |
| `MarkdownValueFormatter` (mixin) | Кастомное форматирование значения поля при экспорте в markdown | `models/converter/src/index.ts` |
| `DiffHunk`/`DiffFile`/`DiffLineType` | Unified-diff структуры (не используются QMS-сравнением версий напрямую, см. ниже) | `plugins/diffview/src/types.ts` |

## Как работает

### 1. Совместное редактирование (Yjs)
1. `CollaborativeTextEditor.svelte` создаёт `Y.Doc` и вызывает `createRemoteProvider` - `plugins/text-editor-resources/src/components/CollaborativeTextEditor.svelte`.
2. `createRemoteProvider` строит `HocuspocusCollabProvider` (WebSocket) с URL из `presentation.metadata.CollaboratorUrl` и токеном платформы - `plugins/text-editor-resources/src/provider/utils.ts`.
3. Сервер `collaborator` (`server/collaborator/src/storage/platform.ts`) загружает Y.Doc из blob-хранилища (`loadCollabYdoc`) либо, если его ещё нет, конвертирует исходный markup (`content`-поле документа) в Y.Doc (`markupToYDoc`).
4. При изменениях/выгрузке документа сервер сохраняет Y.Doc обратно (`saveCollabYdoc`, `platform.ts`), сравнивает markup до/после и, если изменилось, пишет новый `MarkupBlobRef` через `client.diffUpdate` и создаёт/агрегирует `DocUpdateMessage` в activity - `platform.ts`.

### 2. Создание управляемого документа из шаблона
1. UI вызывает `createControlledDocFromTemplate` из `controlled-documents-resources` (вызывает одноимённую функцию из `controlled-documents`) - `plugins/controlled-documents-resources/src/docutils.ts`, `plugins/controlled-documents/src/docutils.ts`.
2. `useDocumentTemplate` берёт `content`/`category`/`prefix` шаблона и атомарно инкрементирует его `sequence` - `plugins/controlled-documents/src/docutils.ts`.
3. `createControlledDocMetadata` создаёт `DocumentMeta`/`ProjectMeta`/`ProjectDocument` с проверкой уникальности `seqNumber`/`code` через `ops.notMatch` - `plugins/controlled-documents/src/docutils.ts`.
4. Вложения копируются из шаблона отдельно, с пометкой `state: 'referenced'` - `copyDocumentAttachments`, `plugins/controlled-documents-resources/src/docutils.ts`.

### 3. Жизненный цикл (review -> approval -> effective)
1. `OnDocPlannedEffectiveDateChanged` - при немедленной публикации (`plannedEffectiveDate === 0`) и `controlledState === Approved` вызывает `makeDocEffective` - `server-plugins/controlled-documents-resources/src/index.ts`.
2. `OnDocApprovalRequestApproved` - при апруве последнего запроса, если дата не отложена, также вызывает `makeDocEffective` - `server-plugins/controlled-documents-resources/src/index.ts`.
3. `OnDocHasBecomeEffective` - переводит более старые `Effective`-версии в `Archived` (`archiveDocs`), обновляет `DocumentMeta`, шаблон, создаёт запрос на тренинг (`createDocumentTrainingRequest`) - `server-plugins/controlled-documents-resources/src/index.ts`.
4. `OnDocEnteredNonActionableState` - при удалении/архивации отменяет все активные review/approval-заявки (`RequestStatus.Cancelled`) и сбрасывает `controlledState` - `server-plugins/controlled-documents-resources/src/index.ts`.
5. `OnDocTitleChanged` - синхронизирует заголовок в `DocumentMeta`, если версия ещё черновик и нет более старых effective-версий - `server-plugins/controlled-documents-resources/src/index.ts`.

### 4. Markdown-экспорт ("Copy Document as Markdown")
1. Действие зарегистрировано на `document.class.Document` (обычные документы, `models/document/src/index.ts`) и на `card.class.Card` (`models/card/src/actions.ts`); для `ControlledDocument` - через `converter.extensions.CopyAsMarkdownAction` (`models/controlled-documents/src/index.ts`).
2. Обработчик `CopyDocumentMarkdown` - общий, в `view-resources` (не в `converter`): читает markup из блоба и конвертирует `markupToMarkdown(markupToJSON(...))` - `plugins/view-resources/src/actionImpl.ts`.
3. Экспорт таблиц (`CopyAsMarkdownTable`, viewlet/список документов) идёт через `buildMarkdownTableFromDocs`/`buildMarkdownTableFromMetadata` - `plugins/converter-resources/src/markdown/tableBuilder.ts`, с кастомным форматированием значения через миксин `MarkdownValueFormatter` (у `Document` навешан `documents.function.FormatDocumentMarkdownValue` - `models/controlled-documents/src/index.ts`).

### 5. Сравнение версий (COMPARING)
1. `DocumentDiffViewer.svelte` поднимает второй `Y.Doc` для сравниваемой версии (`createTiptapCollaborationData`) и рендерит структурный diff через `CollaborationDiffViewer`/`StringDiffViewer` из `text-editor-resources` - `plugins/controlled-documents-resources/src/components/document/DocumentDiffViewer.svelte`.
2. Сам diff вычисляется библиотекой `rfc6902` (JSON Patch) над prosemirror JSON - `plugins/text-editor-resources/src/components/diff/diff.ts`, результат превращается в документ с insert/delete-марками (`recreate.ts`) и декорациями подсветки (`decorations.ts`).
3. Пакет `diffview` (unified-diff/`diff2html`) в этом сравнении **не участвует** - он используется для GitHub PR review (`services/github/github-resources/src/components/PullRequestDiff.svelte`) и для подсветки синтаксиса code-block в редакторе (`Highlight`, `packages/presentation/src/components/markup/CodeBlockNode.svelte`).

### 6. Inline-комментарии в QMS
1. Отдельное tiptap-расширение `QMSInlineCommentMark`/`QMSInlineCommentExtension` (не общий `inlineComment.ts`) подключено в редакторе через `editor-kit.ts` и используется в `EditDocContent.svelte`.
2. Комментарий создаёт `DocumentComment` (`extends ChatMessage`, поле `nodeId` привязывает к месту в тексте) - `plugins/controlled-documents/src/types.ts`.

## Фичи

### Обычные документы (`document`)
- **Шапка и меню документа.** Порядок как у задачи: ИИ, сводка реакций, ссылка (после копирования на 1.5 с галочка и «Скопировано»), «В боковую панель», «Ещё», затем боковые панели «Обратные ссылки» и «История» (отделены разделителем). Ширина текста - кнопка в правом поле контента (`maxWidthToggle="gutter"`). Меню «Ещё» одно для открытого документа и списков: раскладка в mixin `view.mixin.ActionMenu` на `document.class.Document` (открыть, новая вкладка, боковая панель; вложенный документ; блокировка, перенос; Копировать ▸ ссылку/Markdown, публичная ссылка, печать; удаление). - plugins/document-resources/src/components/EditDoc.svelte; models/document/src/index.ts.
- **Основной текст в поиске.** `contentField: 'content'` у `document.class.Document` (`models/server-document/src/index.ts`): текст содержимого - в `fulltextSummary`, заголовок и прочие атрибуты - в `fulltextExtra`. У `DocumentMeta` основного текста нет (тело - отдельный `ControlledDocument`), весь её текст в `fulltextExtra`.
- **Иерархия документов в teamspace.** Дерево с drag&drop (`DropMarker`/`DropArea`), блокировка документа при редактировании (`lockedBy`). - `plugins/document-resources/src/components/navigator/DocHierarchy.svelte`, `plugins/document-resources/src/components/EditDoc.svelte`.
- **История версий и восстановление содержимого.** RPC `getVersions`/`getVersionContent` на collaborator-сервере (снапшоты Y.Doc по имени `<objectId>-<objectAttr>-<timestamp>`), UI в сайдбаре History. FUSIO-1127. - `server/collaborator/src/rpc/methods/getVersions.ts`, `packages/presentation/src/collaborator.ts`, `plugins/document-resources/src/components/sidebar/History.svelte`.

### Совместное редактирование (`text-editor`)
- **Rich text на tiptap.** Заголовки, форматирование, ссылки, списки, таблицы, изображения; категории форматов `TextFormatCategory`. - `plugins/text-editor/src/types.ts`.
- **Вставка картинок из буфера и drop.** Файлы и base64-картинки из вставленного HTML (Google Docs, Word) загружаются через `attachFile`, в ydoc base64 не попадает; в редакторе без `attachFile` такая вставка отклоняется с ошибкой. FUSIO-1468, подробности - `docs/memory/editor-image-paste.md`. - `plugins/text-editor-resources/src/components/extension/shortcuts/imageUpload.ts`.
- **Упоминания по `@`.** `ReferenceExtension` + `Suggestion` + попап списка людей. Попап (`MentionPopup`) ищет по категориям `ObjectSearchCategory` с контекстом `mention` только по заголовку и идентификатору и с вхождением в любом месте слова: `searchFor(..., { searchIn: ['title', 'identifier'], infix: true })` -> `searchFulltext` с тем же `searchIn` и запросом `*слово*` (совпадения с начала слова выше); спотлайт ищет и по тексту, только с начала слова. - `plugins/text-editor-resources/src/components/extension/reference.ts`, `plugins/text-editor-resources/src/components/extension/suggestion.ts`, `plugins/text-editor-resources/src/components/MentionPopup.svelte`, `packages/presentation/src/search.ts`.
- **Доска рисования с undo.** Узел текста, открывающий попап-редактор с отдельным undo/redo. - `plugins/text-editor-resources/src/components/extension/drawingBoard.ts`.
- **Mermaid-диаграммы.** Code-block с языком `mermaid`: при вводе кода (через `/` → «Диаграмма») диаграмма рендерится live ниже редактора кода, код можно свернуть, оставив только картинку; первый клик выделяет диаграмму, повторный клик по выделенной открывает полноразмерный просмотр (`MermaidPopup`, только SVG, без редактирования), Delete удаляет диаграмму целиком. - `plugins/text-editor-resources/src/components/extension/codeSnippets/mermaid.ts`, `MermaidPopup.svelte`; подключение - `plugins/text-editor-resources/src/kits/editor-kit.ts`.
- **Вставка эмодзи.** Автоконвертация shortcode/эмотиконов (`:smile:`, `:)`) в emoji-узел при наборе текста и вставке (`EmojiExtension`); отдельная кнопка с попапом выбора эмодзи в тулбаре ref-инпутов (сообщения/комментарии). - `plugins/text-editor-resources/src/components/extension/emoji.ts`, `plugins/text-editor-resources/src/components/editor/actions.ts`.
- **Таблицы в тексте: refresh/diff/original data.** Таблица может обновляться из источника, показывать diff и исходные данные отдельными попапами. - `plugins/text-editor-resources/src/components/extension/table/actions/{refreshTable,showTableDiff,seeOriginalTableData}.ts`.
- **Совместная осведомлённость.** Курсоры/имена/цвета участников через awareness Hocuspocus. - `plugins/text-editor/src/types.ts`.
- **Reconnect grace для нестабильного WS.** После сна вкладки WS часто закрывается с кодом 1006 - ошибка пользователю показывается только через 5с, если не переподключилось. - `plugins/text-editor-resources/src/provider/utils.ts`.
- **Заметки на выделенном тексте.** Tiptap-марка `note` (не узел, не тред): выделение текста + кнопка "Заметка" в плавающей панели (`ConfigureNote`) открывает попап с текстом заметки и выбором из 9 цветовых вариантов (`NoteKind`); после отмеченного текста рисуется виджет-маркер `[]` (decoration), клик по нему показывает содержимое (`DisplayNotePopup`), повторное выделение и клик по значку - редактирование/удаление. - `NoteBaseExtension`/`NoteKind`, `foundations/core/packages/text/src/marks/noteBase.ts`; `NoteExtension`, `ConfigureNotePopup.svelte`/`DisplayNotePopup.svelte`, `plugins/text-editor-resources/src/components/extension/note.ts`; действие в тулбаре - `models/text-editor/src/index.ts:441`.
- **Встроенные комментарии к выделенному тексту.** Кнопка "Comment" в тулбаре редактора (`CreateInlineComment`) создаёт тред-комментарий, привязанный к выделению в тексте документа/описания задачи; выделение подсвечивается декорацией, открытый тред показывает `InlineCommentThread` с ответами. Отдельный механизм от QMS-меток (`QMSInlineCommentMark`, см. "Как работает" §6). - `InlineCommentCollaborationExtension`, `plugins/text-editor-resources/src/components/extension/inlineComment.ts`; подключение - `plugins/text-editor-resources/src/kits/editor-kit.ts`; кнопка - `models/text-editor/src/index.ts:458`; UI треда - `plugins/chunter-resources/src/components/inline-comment/InlineCommentThread.svelte`.

### Controlled Documents (QMS)
- **Версионирование major/minor.** Общий `seqNumber` на все версии одного логического документа. - `plugins/controlled-documents/src/types.ts`.
- **Три роли пространства.** Qualified User (review/approve/co-author), Manager (+create, категории, UpdateSpace), QARA (+archive, смена владельца). - `models/controlled-documents/src/roles.ts`.
- **Пространство "Default Documents".** `SpaceType` с 3 ролями и набором space-scoped прав. - `models/controlled-documents/src/spaceType.ts`.
- **Вложения: перенос между версиями + мягкое удаление.** `state: 'new'|'referenced'`, `deletedIn: {major,minor}|null`; `null` снимает пометку (восстановление). - `plugins/controlled-documents/src/types.ts`, `plugins/controlled-documents-resources/src/docutils.ts`.
- **Reason & Impact (change control).** Отдельная сущность `ChangeControl`, привязанная к версии документа, попадает в History. - `plugins/controlled-documents/src/types.ts`.
- **PDF/печать.** Серверная генерация PDF: действие `Print` создаёт public link на документ и вызывает `printToPDF()`, которая обращается к `services/print/pod-print` - сервис рендерит страницу headless Chrome (Puppeteer) и возвращает PDF, опционально подписывает через `signPDF`. Печатная вёрстка (шапка/футер, `@media print`) - `plugins/controlled-documents-resources/src/components/print/DocumentPrintTitlePage.svelte`, `plugins/controlled-documents-resources/src/components/document/EditDocContent.svelte`; сервис печати - `services/print/pod-print/src/print.ts`, клиентский вызов - `plugins/print/src/utils.ts`.
- **Интеграция с тренингами.** При переходе документа в Effective создаётся заявка на тренинг сотрудников (`DocumentTraining` миксин). - `plugins/controlled-documents/src/types.ts`, `server-plugins/controlled-documents-resources/src/index.ts`.
- **Автор и владелец документа.** `author` (подписант, попадает в PDF-экспорт) и `owner` (отвечает за документ весь ЖЦ) - разные поля; смена владельца через попап `ChangeOwnerPopup` (право ограничено ролью, проверка `canChangeDocumentOwner`/`isDocOwner`). - `plugins/controlled-documents/src/types.ts`, `plugins/controlled-documents-resources/src/components/document/popups/ChangeOwnerPopup.svelte`, `plugins/controlled-documents-resources/src/utils.ts`.
- **Фильтрация документов в Library.** `ClassFilters` на `documents.class.Document`: prefix, title, state, space, template, владелец/автор (`EmployeeFilter`), category, modifiedOn, labels, major/minor; набор видимых фильтров сужается `GetVisibleFilters`. Сохранение отфильтрованного списка как приватного/публичного вида - общий платформенный механизм `savedViews`. - `models/controlled-documents/src/index.ts`, `plugins/view-resources/src/{filter,savedViews}.ts`.
- **Создание документа из шаблона (мастер).** UI-мастер в 4 шага: пространство+родитель → шаблон → название/описание/обоснование → команда (Co-Authors/Reviewers/Approvers) → `Create Draft`; один и тот же мастер создаёт документы и в "Общей документации" (категория Quality Documents), и в пространстве продукта ("Техническая документация"). - `plugins/controlled-documents-resources/src/docutils.ts` (`createControlledDocFromTemplate`), nav-группы `GeneralDocumentation`/`TechnicalDocumentation` - `models/controlled-documents/src/index.ts`.
- **Шаблоны и категории документов.** `DocumentTemplates`/`Categories` - создание переиспользуемых шаблонов (префикс, авто-нумерация через `sequence`/`docPrefix`) и категорий для группировки документов. - `plugins/controlled-documents-resources/src/components/DocumentTemplates.svelte`, `plugins/controlled-documents-resources/src/components/Categories.svelte`, `plugins/controlled-documents/src/types.ts` (`DocumentTemplate`).
- **Экспорт в другой workspace.** Отдельный от markdown-экспорта механизм (`export`/`export-resources` пакеты) - копирование документов/пространства целиком между инстансами. - `models/controlled-documents/src/index.ts` (`ExportProjectDocuments`, `ExportDocumentsFromSpace`).

### Markdown / Converter
- **"Copy Document as Markdown".** Контекстное меню и тулбар (FUSIO-777). - `models/document/src/index.ts`, `plugins/view-resources/src/actionImpl.ts`.
- **Копирование таблиц как Markdown.** Включая таблицы связей (relationship). - `plugins/converter-resources/src/markdown/tableBuilder.ts`, `plugins/converter-resources/src/data/relationshipBuilder.ts`.
- **`MarkdownValueFormatter`.** Точка расширения для кастомного форматирования значения поля при экспорте (используется `ControlledDocument`). - `models/converter/src/index.ts`.

### Diff view
- **Unified/split-просмотр диффов.** Общий переиспользуемый пакет; в QMS не используется (см. "Как работает" п.5) - применяется в GitHub PR review и подсветке кода в редакторе. - `plugins/diffview/src/index.ts`, `plugins/diffview-resources/src/parser.ts` (`diff2html`).

## Пользовательская документация

| Фича | ru | en | Статус | Сверено | Расхождение |
| --- | --- | --- | --- | --- | --- |
| Шапка и меню документа | knowledge-management/documents | knowledge-management/documents | partial | 0.8.60 | не описана структура шапки/меню открытого документа (ИИ, реакции, копирование ссылки, боковая панель «История») |
| Основной текст в поиске | - | - | internal | - | |
| Иерархия документов в teamspace | knowledge-management/documents | knowledge-management/documents | partial | 0.8.60 | не описан drag&drop для изменения порядка/вложенности документов в дереве и блокировка документа при одновременном редактировании (`lockedBy`) |
| История версий и восстановление содержимого | - | - | off | - | не документируем |
| Rich text на tiptap | knowledge-management/documents, controlled-documents/editing-formatting | knowledge-management/documents, controlled-documents/editing-formatting | partial | 0.8.60 | частично выключено на проде: documents - в Controlled Documents недоступен, в обычных документах (wiki/teamspace) работает |
| Вставка картинок из буфера и drop | - | - | off | - | не документируем |
| Упоминания по `@` | knowledge-management/documents | knowledge-management/documents | ok | 0.8.60 | |
| Доска рисования с undo | knowledge-management/drawing-board | knowledge-management/drawing-board | ok | 0.8.60 | |
| Mermaid-диаграммы | knowledge-management/mermaid-diagrams | knowledge-management/mermaid-diagrams | ok | 0.8.60 | |
| Вставка эмодзи | - | - | off | - | не документируем |
| Заметки на выделенном тексте | knowledge-management/documents | knowledge-management/documents | ok | 0.8.60 | |
| Таблицы в тексте: refresh/diff/original data | - | - | off | - | не документируем |
| Совместная осведомлённость | knowledge-management/collaborative-editing | knowledge-management/collaborative-editing | ok | 0.8.60 | |
| Reconnect grace для нестабильного WS | - | - | internal | - | |
| Версионирование major/minor | controlled-documents/document-versions | controlled-documents/document-versions | off | - | выключено на проде: documents |
| Три роли пространства | - | - | off | - | не документируем |
| Пространство "Default Documents" | - | - | off | - | не документируем |
| Вложения: перенос между версиями + мягкое удаление | - | - | off | - | не документируем |
| Reason & Impact (change control) | controlled-documents/document-settings, controlled-documents/document-versions | controlled-documents/document-settings, controlled-documents/document-versions | off | - | выключено на проде: documents |
| PDF/печать | controlled-documents/editing-formatting | controlled-documents/editing-formatting | off | - | выключено на проде: documents |
| Интеграция с тренингами | additional-modules/trainings | additional-modules/trainings | off | - | выключено на проде: documents |
| Автор и владелец документа | controlled-documents/ownership-authorship | controlled-documents/ownership-authorship | off | - | выключено на проде: documents |
| Фильтрация документов в Library | controlled-documents/document-filtering | controlled-documents/document-filtering | off | - | выключено на проде: documents |
| Создание документа из шаблона (мастер) | controlled-documents/quality-documents, controlled-documents/technical-documentation | controlled-documents/quality-documents, controlled-documents/technical-documentation | off | - | выключено на проде: documents |
| Шаблоны и категории документов | controlled-documents/templates | controlled-documents/templates | off | - | выключено на проде: documents |
| Экспорт в другой workspace | - | - | off | - | не документируем |
| "Copy Document as Markdown" | - | - | off | - | не документируем |
| Копирование таблиц как Markdown | - | - | off | - | не документируем |
| `MarkdownValueFormatter` | - | - | internal | - | |
| Unified/split-просмотр диффов | - | - | off | - | не документируем |
| Встроенные комментарии к выделенному тексту | communication/inline-comments | communication/inline-comments | ok | 0.8.60 | |

## Куда смотреть, если нужно...

- Добавить новый триггер жизненного цикла QMS-документа - декларация в `server-plugins/controlled-documents/src/index.ts`, реализация в `server-plugins/controlled-documents-resources/src/index.ts`.
- Изменить права/роли пространства документов - `models/controlled-documents/src/{roles,permissions,spaceType}.ts`.
- Добавить поле в модель `ControlledDocument` - `plugins/controlled-documents/src/types.ts`, затем схема в `models/controlled-documents/src/types.ts`.
- Поменять формат markdown-экспорта таблицы - `plugins/converter-resources/src/markdown/tableBuilder.ts`.
- Добавить tiptap-расширение редактора - `plugins/text-editor-resources/src/kits/editor-kit.ts`
  + новый файл в `components/extension/`.
- Починить/расширить механизм совместного сравнения версий - `plugins/text-editor-resources/src/components/diff/{diff,recreate,decorations}.ts`.
- Изменить хранение/сохранение Y.Doc на сервере - `server/collaborator/src/storage/platform.ts`.
- Добавить RPC-метод collaborator-сервера - `server/collaborator/src/rpc/methods/`, регистрация в `rpc/methods/index.ts`.
- Изменить workflow вложений (soft-delete, копирование по версиям) - `plugins/controlled-documents-resources/src/docutils.ts` (`copyDocumentAttachments`).
- Добавить действие копирования в markdown для нового типа документа - `models/<pkg>/src/index.ts`, `CreateAction(view.actionImpl.CopyDocumentMarkdown, { contentClass, contentField })`.
- Изменить печатный вид (шапка/футер, `@media print`) - `plugins/controlled-documents-resources/src/components/print/`.

## Настройки и конфигурация

Env-переменные `server/collaborator` (`server/collaborator/src/config.ts`):

| Переменная | Назначение |
| --- | --- |
| `SECRET`, `SERVICE_ID` | Аутентификация сервиса на платформе |
| `COLLABORATOR_PORT` | Порт Hocuspocus-сервера (по умолчанию 3078) |
| `ACCOUNTS_URL` | URL account-сервиса |
| `STORAGE_RETRY_COUNT`/`STORAGE_RETRY_INTERVAL` | Ретраи load/save Y.Doc из blob-хранилища |
| `ACTIVITY_AGGREGATION_DELAY` | Окно агрегации `DocUpdateMessage` в activity (по умолчанию 5 мин) |

Клиент берёт URL и токен из платформенных метаданных `presentation.metadata.CollaboratorUrl` / `presentation.metadata.Token` (`plugins/text-editor-resources/src/provider/utils.ts`).

## Тесты

- Unit: `server/collaborator/src/__tests__/**` (storage adapter, rpc-методы, transformers), `plugins/converter-resources/src/__tests__/**` (markdown-таблицы, escape, форматтеры), `plugins/controlled-documents/src/__tests__/projectDocumentTree.test.ts`, `plugins/text-editor-resources/src/components/diff/__tests__/recreate.test.ts`, `plugins/text-editor-resources/src/__tests__/editorRegistry.spec.ts`.
- Sanity (обычные документы): `tests/sanity/tests/documents/{documents,documents-content,documents-print-preview,documents-link}.spec.ts`, page-объекты в `tests/sanity/tests/model/documents/`.
- QMS sanity (отдельный Playwright-контур, свой docker-compose и workspace `sanity-ws-qms`): `qms-tests/sanity/tests/documents/{REQ-*,ES-*,categories,templates}.spec.ts`, page-объекты в `qms-tests/sanity/tests/model/documents/`. Детали интеграции и известные флаки - `docs/memory/qms-tests-integration.md`.

## Связанные документы

- [Controlled Documents (QMS) - обзор функционала и покрытие тестами](../controlDocumentsOverview.md)
- [QMS sanity-тесты: интеграция, root-cause фиксы](../memory/qms-tests-integration.md)
- [../memory/clipboard-copy.md](../memory/clipboard-copy.md) - Clipboard copy pitfalls
