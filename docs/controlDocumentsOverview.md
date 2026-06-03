# Controlled Documents (QMS) - Обзор функционала

Документ собран на основе sanity-тестов `qms-tests/sanity/tests/documents/` и page-объектов
`qms-tests/sanity/tests/model/documents/`. Описывает модуль управляемых документов (ISO 13485, 4.2.4),
ориентированный на QMS-сценарии (Quality Management System).

Документ состоит из двух частей:
- **Часть 1. Функционал (features)** - что система умеет (возможности).
- **Часть 2. Сценарии (scenarios)** - какие пользовательские потоки покрыты тестами.

---

## Часть 1. Функционал

### 1.1. Документы (CRUD)

- Создание документа из шаблона (template) с заголовком, кодом (DOC-N), категорией.
- Редактирование контента документа (коллаборативный редактор).
- Удаление документа (переход в статус DELETED).
- Дочерние документы (child documents) - иерархия документов внутри пространства.
- Создание документа из разных точек входа: кнопка "New Doc", верхний правый угол, внутри пространства.

### 1.2. Версионирование

- Major/Minor версии (v1.0, v1.1, v2.0, ...).
- Выпуск новой версии (Draft new version) - доступен только владельцу документа.
- Выбор типа релиза (Major / Minor) на вкладке Release при выпуске.
- Автоматический перевод предыдущей версии в ARCHIVED (Obsolete) при выпуске новой.
- Статус ревизии (revision status) отслеживается; каждая версия имеет запись в History.
- Документ хранит major/minor, seqNumber (общий для всех версий одного логического документа).

### 1.3. Состояния документа (lifecycle)

- DRAFT - черновик, редактируется.
- IN_REVIEW - на рецензии (права становятся VIEWING).
- IN_APPROVAL - на утверждении (права становятся VIEWING).
- APPROVED - утверждён, но ещё не вступил в силу (при отложенной дате).
- EFFECTIVE - действующий.
- REJECTED - отклонён.
- ARCHIVED (Obsolete) - устаревший.
- DELETED - удалён.

### 1.4. Права на документ (rights)

Документ имеет явный режим прав, переключаемый в UI:
- EDITING - редактирование.
- VIEWING - просмотр (в состояниях review/approval).
- COMPARING - сравнение версий.

### 1.5. Workflow рецензирования (review)

- Отправка документа на рецензию (Send for review) с назначением рецензентов.
- Добавление рецензентов из Team-панели.
- Прохождение рецензии (Make review / Complete review) - требует ввода пароля (электронная подпись).
- После рецензии можно создать новый черновик и продолжить работу.

### 1.6. Workflow утверждения (approval)

- Отправка на утверждение (Send for approval) с назначением утверждающих.
- Утверждение (Approve) - требует ввода пароля (электронная подпись), переводит в EFFECTIVE.
- Отклонение (Reject) с указанием причины - переводит в REJECTED, причина видна в панели Approvals.
- Внешние утверждающие (externalApprovers) - для новых версий требуется ручной запрос.
- Отложенная дата вступления в силу (Release tab, setEffectiveDate) - документ становится APPROVED,
  а EFFECTIVE - по наступлении даты.

### 1.7. Комментарии

- Inline-комментарии в тексте документа (в состоянии IN_REVIEW).
- Всплывающий popup комментария: номер, статус (Pending/Resolved), автор, текст, ответы.
- Ответы на комментарии (reply) прямо из popup.
- Боковая панель комментариев (aside) с теми же данными.
- Резолв комментариев (по одному / все сразу - Resolve all).
- Видимость кнопки резолва зависит от прав/состояния.

### 1.8. Reason & Impact (change control)

Отдельная вкладка на каждом документе:
- Description (описание).
- Reason (причина изменения), включая вариант "Custom" со свободным текстом.
- Impact Analysis (анализ влияния).
- Impacted Documents (связанные затронутые документы - пикер).
- Все поля сохраняются и попадают в History версии.

### 1.9. Сравнение версий (comparison)

- Режим COMPARING - сравнение текущей версии с предыдущей.
- Inline-подсветка добавленного/удалённого текста (diff-маркеры).
- Сравнение заголовка, контента и (добавлено) вложений между версиями.

### 1.10. Вложения (attachments)

- Прикрепление файлов к документу (в режиме редактирования), readonly в просмотре.
- Soft-delete: удаление "referenced"-вложений помечается версией (deletedIn), с возможностью
  восстановления в draft до отправки на approve. Свежие ("new") вложения удаляются сразу.
- Копирование вложений при создании новой версии / из шаблона (помечаются "referenced").
- Preview-картинка (thumbnail) для офисных файлов; FilePreview для текстовых (.log/.txt/...).
- Diff вложений в режиме сравнения (added/removed/unchanged).

### 1.11. PDF

- Генерация PDF действующего документа.
- Полноэкранный preview PDF.
- Открытие PDF в новой вкладке.
- В PDF отображается информация о подписях рецензентов и утверждающих (электронная подпись).
- (Тесты PDF в CI помечены skip - требуют канал MS Edge.)

### 1.12. История (History)

- Вкладка History на каждом документе.
- События: создание документа, выпуск версий, кастомные причины (Reason) и т.д.
- Привязка событий к конкретной версии.

### 1.13. Категории (Categories)

- Создание категории (title, code, description, вложение).
- Редактирование (описание, вложения).
- Удаление; блокируется, если есть связанные шаблоны (action "Delete" отсутствует).
- Категория External для внешних документов.
- Поиск/фильтрация документов по категории.

### 1.14. Шаблоны (Templates)

- Создание шаблона (space, title, description, code, category, reviewers, approvers, custom reason).
- Удаление шаблона (статус DELETED).
- Действующий (Effective) шаблон через workflow утверждения.
- Фильтрация шаблонов по категории.

### 1.15. Роли и права (roles & permissions)

Три роли пространства (см. `models/controlled-documents/src/roles.ts`):
- **Qualified User** - Review, Approve, CoAuthor (создавать документы не может).
- **Manager** - + Create Document, управление категориями, UpdateSpace.
- **QARA** - + Archive Document, UpdateDocumentOwner (максимум прав).

- Создание ролей и настройка прав владельцем workspace.
- Права space-scoped: ReviewDocument, ApproveDocument, CoAuthorDocument, CreateDocument,
  ArchiveDocument, UpdateDocumentOwner, Create/Update/DeleteDocumentCategory.
- Member-only пользователь не может быть назначен approver/reviewer/co-author.

### 1.16. Участники документа

Поля на ControlledDocument: author, owner, reviewers[], approvers[], externalApprovers[], coAuthors[].
- Смена author (владельцем, в draft).
- Смена owner (QARA, на effective-документе) - меняет, кому доступна кнопка "Draft new version".

### 1.17. Пространства и контроль доступа

- Создание пространства документов (folder/teamspace), в т.ч. приватного (private toggle).
- Приватные пространства: невидимы для не-членов.
- Member-only: не видит пространство в селекторе создания, не может создавать/редактировать/удалять.
- Manager: может создавать и удалять документы в своём пространстве.
- Workspace admin: может добавить пользователя в приватное пространство.

### 1.18. Аутентификация / управление пользователями

- Негативные кейсы входа (неверный email/пароль/несуществующий аккаунт).
- Workspace owner может исключить пользователя (kick) - пользователь становится Inactive.
- Не-владелец не видит опцию kick.

### 1.19. Целостность контента

- Текст документа не меняется со временем (tool does not influence content).
- Точное сохранение разделов/заголовков/параграфов между сессиями и при переходах состояний.

---

## Часть 2. Поддерживаемые сценарии (покрытие тестами)

### Документы (CRUD)

- TESTS-123: создать документ из HR-шаблона, проверить заголовок.
- TESTS-124: отредактировать контент, проверить сохранение.
- TESTS-127: удалить документ -> статус DELETED.
- TESTS-125: создать дочерний документ -> статус DRAFT.
- TESTS-352: создать пространство и документ внутри, проверить оба.

### Владение документом

- TESTS-126: владелец меняет author на другого пользователя (draft).
- TESTS-155: QARA меняет owner на effective-документе; старый владелец теряет "Draft new version", новый получает.

### Рецензирование

- TESTS-134: отправить draft на рецензию (добавить рецензента) -> IN_REVIEW, права VIEWING.
- TESTS-139: полный цикл рецензии - контент, send for review, комментарий, complete review, новый draft, резолв.
- TESTS-206: end-to-end на двух пользователях - комментарии автора и рецензента, резолв, повторная рецензия,
  отправка на approval и approve до EFFECTIVE; проверка события History.

### Утверждение

- TESTS-135: отправить draft на утверждение -> IN_APPROVAL, права VIEWING.
- TESTS-137: send for approval + approve -> EFFECTIVE, панель Approvals показывает успех.
- TESTS-138: send for approval + reject с причиной -> REJECTED, причина видна в панели.
- TESTS-383: категория + шаблон, отправка шаблона на approval, approve вторым пользователем -> EFFECTIVE,
  шаблон виден по фильтру категории.

### Комментарии

- TESTS-136: inline-комментарии в IN_REVIEW, complete review, резолв, повторное редактирование (полный жизненный цикл).
- TESTS-161: элементы popup комментария - добавить inline-комментарий, ответить в popup, проверить
  ID/статус/автора/текст/ответ в popup и в правой панели.

### Версионирование

- TESTS-325: создать -> approve до v1.0 EFFECTIVE -> minor (v1.1, v1.2) и major (v2.0, v3.0) с reason/impact,
  проверить событие History каждой версии.
- TESTS-384: создать -> approve до v1.0 EFFECTIVE -> minor v1.1; v1.0 автоматически ARCHIVED (obsolete).
- TESTS-380: документ с "Custom" reason, approve, новая версия; custom-текст в History для v1.0.

### Сравнение версий

- TESTS-140: после рецензии и правок - режим COMPARING, подсветка добавленного/удалённого текста (diff-маркеры).

### Reason & Impact

- TESTS-205: заполнить все поля Reason & Impact (description, reason, analysis, impacted documents),
  approve до EFFECTIVE, проверить сохранение.
- TESTS-380: выбрать "Custom" reason при создании; проверить сохранение в History (см. также Версионирование).

### PDF (в CI - skip, требуют MS Edge)

- TESTS-271: скачать PDF effective-документа.
- TESTS-272: полноэкранный preview PDF.
- TESTS-273: открыть PDF в новой вкладке, визуальное сравнение.
- TESTS-277: PDF с подписями рецензента и утверждающего (Edge, рецензия одним пользователем).
- TESTS-386: PDF с подписями reviewer+approver (поток на двух пользователях).
- TESTS-387: approve с паролем (электронная подпись), затем preview PDF.
- TESTS-393: имена reviewer и approver видны в Team-панели после EFFECTIVE.
- TESTS-394: участники команды effective-документа не редактируются (Team-панель readonly).
- TESTS-162: approve с отложенной датой (Release "in 15 minutes") -> статус APPROVED (ещё не EFFECTIVE).

### Категории

- TESTS-131: создать категорию (title/code/description/attachment), проверить в списке.
- TESTS-132: отредактировать описание и добавить вложение.
- TESTS-133: удалить категорию.
- TESTS-215: нельзя удалить категорию со связанным шаблоном (action Delete отсутствует).
- TESTS-298: создать категорию из верхнего правого угла (альт. точка входа).

### Шаблоны

- TESTS-129: создать шаблон (category/code/reviewers/approvers), проверить заголовок и метаданные в DRAFT.
- TESTS-181: создать и удалить шаблон -> DELETED.
- TESTS-382: создать категорию, создать шаблон с (external) категорией, шаблон виден по коду категории.

### Роли и права

- TESTS-341: workspace owner видит права ролей Manager/QARA/Qualified User в Settings > Default Documents.
- TESTS-342: право "Add/Update document owner" выключено для всех трёх ролей.
- TESTS-338: member-only пользователь не появляется в выпадающем списке approver.

### Пространства и доступ

- TESTS-381: создать пространство документов, проверить в навигации.
- TESTS-391: не-член пространства не видит space/teamspace после исключения из members.
- TESTS-402: не-член (manager-пользователь) не видит space, из которого исключён.
- TESTS-403: member-only не может назначить себя reviewer/co-author/approver при редактировании.
- TESTS-404: member-only не может создать документ (space не показан, нет кнопки Edit).
- TESTS-405: space manager может удалить созданный им документ -> DELETED.
- TESTS-347: пользователь с ролью Manager создаёт документ кнопкой "New Doc"; owner - менеджер, не админ.
- TESTS-390: workspace admin добавляет пользователя в приватное пространство; пользователь видит space.
- TESTS-406: member-only не видит space в селекторе создания документа.

### Аутентификация / пользователи

- TESTS-392: несуществующий аккаунт -> "Account not found or credentials incorrect".
- TESTS-396: верный email + неверный пароль -> та же ошибка.
- TESTS-397: неверный email + верный пароль -> та же ошибка.
- TESTS-388: workspace owner исключает пользователя -> Inactive.
- TESTS-389: не-владелец не видит опцию "Kick employee".

### Целостность контента

- TESTS-214: открыть ранее созданный документ, проверить неизменность заголовка/метаданных/разделов.
- TESTS-399: записать большой параграф, approve; редактор содержит точный текст после перехода.

---

## Приложение. Ключевые возможности из page-объектов

- **Rights**: `checkCurrentRights` / `changeCurrentRight` - режимы EDITING / VIEWING / COMPARING.
- **Compare**: `changeCurrentRight(COMPARING)` + `checkComparingTextAdded/Deleted`.
- **Team**: `addReviewersFromTeam` / `addApproversFromTeam` - добавление прямо из Team-панели.
- **Send for approval**: `sendForApproval(releaseType, version, reason, impact, ...)` - составной хелпер:
  draft новой версии -> выбор Major/Minor -> Reason & Impact -> отправка -> approve вторым пользователем -> History.
- **Электронная подпись**: `confirmSubmission` / `confirmApproval` / `confirmRejection(reason)` / `completeReview` /
  `clickApproveButtonAndFillPassword` - все требуют ввода пароля.
- **Ownership**: `buttonDraftNewVersion` виден только владельцу.
- **Private space**: `fillDocumentAndSetMemberPrivate(name)` - teamspace с приватным toggle.
- **Restrictions**: `checkTeamMembersReviewerCoauthorApproverNotExists` - member-only не в списках.
- **Release**: `DocumentReleasePage.setEffectiveDate(shortcut)` - отложенная дата (APPROVED, не EFFECTIVE).
- **Reason & Impact**: Description, Reason, Impact Analysis, Impacted Documents.
- **History**: `checkHistoryEventExist` / `checkIfHistoryVersionExists` - проверка событий и версий.
- **Comments**: `checkCommentInPopupById` / `checkCommentInPanelById` / `resolveAllComments` /
  `addReplyInPopupByCommentId` / `checkCommentCanBeResolved`.
- **Navigation**: `selectControlDocumentSubcategory` - My Document / Library / Templates / Categories / General.
- **Templates**: `createTemplate` - многошаговый мастер (space, title, description, code, custom reason,
  category, reviewers, approvers).
- **Categories**: редактирование описания, вложения, `checkMoreActionNotExist` (Delete заблокирован).
