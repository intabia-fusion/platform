# Controlled Documents (QMS) - Обзор функционала

Модуль управляемых документов (ISO 13485, 4.2.4) с точки зрения пользователя и QA. Источник: сценарии `qms-tests/sanity/tests/documents/` и page-объекты `qms-tests/sanity/tests/model/documents/`. Код-ориентированная карта модуля (пакеты, модель данных, потоки) - `docs/features/documents-qms.md`; этот документ его дополняет продуктовыми деталями и покрытием тестами, не повторяя их.

Документ состоит из двух частей:
- **Часть 1. Функционал** - что система умеет (то, что не покрыто или менее детализировано в `docs/features/documents-qms.md`).
- **Часть 2. Сценарии** - какие пользовательские потоки покрыты тестами.

---

## Часть 1. Функционал

### 1.1. Документы (CRUD)

Создание из шаблона, редактирование в совместном редакторе, удаление (-> DELETED), дочерние документы (иерархия в пространстве), несколько точек входа для создания (кнопка "New Doc", верхний правый угол, внутри пространства).

### 1.2. Версионирование

Major/Minor (v1.0, v1.1, v2.0, ...), выбор типа релиза (Major/Minor) на вкладке Release при выпуске, запись каждой версии в History.

### 1.3. Состояния документа (lifecycle)

`DocumentState`: DRAFT -> EFFECTIVE -> ARCHIVED (автоматически, когда выходит более новая Effective-версия) или OBSOLETE (вручную, действие "Mark as obsolete"; доступно владельцу документа или роли с правом ArchiveDocument, не требует новой версии) -> DELETED. `ControlledDocumentState` (поверх Draft/Effective до перехода в EFFECTIVE): IN_REVIEW, REVIEWED (промежуточное - конкретный рецензент уже одобрил, ждём остальных), IN_APPROVAL, APPROVED (ещё не EFFECTIVE, если дата вступления в силу отложена), REJECTED, TO_REVIEW (EFFECTIVE-документ с истёкшим `reviewInterval`, требует повторной рецензии).

### 1.4. Права на документ (rights)

Явный режим прав, переключаемый в UI: EDITING (редактирование), VIEWING (просмотр - в состояниях review/approval), COMPARING (сравнение версий).

### 1.5. Рецензирование (review)

Send for review с назначением рецензентов (в т.ч. прямо из Team-панели); Complete review требует ввода пароля (электронная подпись); после рецензии можно создать новый draft и продолжить работу.

### 1.6. Утверждение (approval)

Send for approval; Approve (пароль, -> EFFECTIVE) или Reject с причиной (-> REJECTED, причина видна в панели Approvals); внешние утверждающие (externalApprovers) для новых версий запрашиваются отдельно, ручным шагом; отложенная дата вступления в силу (Release tab) переводит документ в APPROVED до её наступления.

### 1.7. Комментарии

Inline-комментарии в тексте (в состоянии IN_REVIEW): popup с номером/статусом (Pending/Resolved)/автором/текстом/ответами, синхронная боковая панель (aside), ответы прямо из popup, резолв по одному или все сразу. Видимость кнопки резолва зависит от прав/состояния.

### 1.8. Reason & Impact (change control)

Отдельная вкладка на каждой версии: Description, Reason (включая вариант Custom со свободным текстом), Impact Analysis, Impacted Documents (пикер связанных документов). Поля сохраняются и попадают в History версии.

### 1.9. Сравнение версий (comparison)

Режим COMPARING сравнивает текущую версию с предыдущей: заголовок, контент (inline-подсветка добавленного/удалённого текста) и вложения (added/removed/unchanged).

### 1.10. Вложения (attachments)

Прикрепление в режиме редактирования, readonly в просмотре. Копируются при создании новой версии/из шаблона (помечаются "referenced"). Soft-delete: удаление "referenced"-вложения помечается версией (`deletedIn`), восстановимо в draft до отправки на approve; свежие ("new") вложения удаляются сразу. Preview-thumbnail для офисных файлов, FilePreview для текстовых.

### 1.11. PDF

Генерация, полноэкранный preview, открытие в новой вкладке и скачивание PDF действующего документа, с информацией о подписях рецензентов/утверждающих - детали генерации в `docs/features/documents-qms.md` ("PDF/печать"). Тесты в CI помечены skip - требуют канал `msedge`, не установлен.

### 1.12. История (History)

Вкладка на каждом документе: создание документа, выпуск версий, кастомные причины (Reason) и т.д., каждое событие привязано к конкретной версии.

### 1.13. Категории (Categories)

CRUD: title/code/description/вложение. Удаление блокируется, если есть связанные шаблоны (действие Delete отсутствует в меню). Фильтрация документов и шаблонов по категории. В модели `DocumentCategory` нет отдельного "external"-флага/типа - соответствующее имя категории в тестах ("External") обычное пользовательское значение поля `title`; отдельный продуктовый концепт внешних документов - класс пространства `ExternalSpace`, к категориям отношения не имеет.

### 1.14. Шаблоны (Templates)

Создание (space, title, description, code, category, reviewers, approvers, custom reason), удаление (-> DELETED), выход в Effective через тот же workflow утверждения, фильтрация по категории.

### 1.15. Роли и права (roles & permissions)

Три роли пространства (`models/controlled-documents/src/roles.ts`):
- **Qualified User** - ReviewDocument, ApproveDocument, CoAuthorDocument (создавать документы не может).
- **Manager** - плюс CreateDocument, Create/Update/DeleteDocumentCategory, core.UpdateSpace.
- **QARA** - плюс ArchiveDocument, UpdateDocumentOwner (сверх полного набора Manager; максимум прав).

Создание ролей и настройка прав - владельцем workspace. Member-only пользователь не может быть назначен approver/reviewer/co-author.

### 1.16. Участники документа

Поля на `ControlledDocument`: author, owner, reviewers[], approvers[], externalApprovers[], coAuthors[]. Смену author делает владелец, в draft. Смену owner делает роль QARA, на effective-документе - определяет, кому доступна кнопка "Draft new version".

### 1.17. Пространства и контроль доступа

Приватные пространства невидимы не-членам и не показываются им в селекторе создания документа. Member-only не может создавать/редактировать/удалять в пространстве, где не состоит. Manager может создавать и удалять документы в своём пространстве. Workspace admin может добавить пользователя в приватное пространство.

### 1.18. Аутентификация / управление пользователями

Негативные кейсы входа (неверный email/пароль/несуществующий аккаунт) дают одно и то же сообщение об ошибке. Workspace owner может исключить пользователя (kick) - пользователь становится Inactive; опция kick недоступна не-владельцу.

### 1.19. Целостность контента

Текст документа не меняется сам по себе между сессиями и переходами состояний - точное сохранение разделов/заголовков/параграфов проверяется тестами.

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
- TESTS-206: end-to-end на двух пользователях - комментарии автора и рецензента, резолв, повторная рецензия, отправка на approval и approve до EFFECTIVE; проверка события History.

### Утверждение

- TESTS-135: отправить draft на утверждение -> IN_APPROVAL, права VIEWING.
- TESTS-137: send for approval + approve -> EFFECTIVE, панель Approvals показывает успех.
- TESTS-138: send for approval + reject с причиной -> REJECTED, причина видна в панели.
- TESTS-383: категория + шаблон, отправка шаблона на approval, approve вторым пользователем -> EFFECTIVE, шаблон виден по фильтру категории.

### Комментарии

- TESTS-136: inline-комментарии в IN_REVIEW, complete review, резолв, повторное редактирование (полный жизненный цикл).
- TESTS-161: элементы popup комментария - добавить inline-комментарий, ответить в popup, проверить ID/статус/автора/текст/ответ в popup и в правой панели.

### Версионирование

- TESTS-325: создать -> approve до v1.0 EFFECTIVE -> minor (v1.1, v1.2) и major (v2.0, v3.0) с reason/impact, проверить событие History каждой версии.
- TESTS-384: создать -> approve до v1.0 EFFECTIVE -> minor v1.1; v1.0 автоматически ARCHIVED (obsolete).
- TESTS-380: документ с "Custom" reason, approve, новая версия; custom-текст в History для v1.0.

### Сравнение версий

- TESTS-140: после рецензии и правок - режим COMPARING, подсветка добавленного/удалённого текста (diff-маркеры).

### Reason & Impact

- TESTS-205: заполнить все поля Reason & Impact (description, reason, analysis, impacted documents), approve до EFFECTIVE, проверить сохранение.
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

## Приложение. Возможности из page-объектов

- **Rights**: `checkCurrentRights` / `changeCurrentRight` - режимы EDITING / VIEWING / COMPARING.
- **Compare**: `changeCurrentRight(COMPARING)` + `checkComparingTextAdded/Deleted`.
- **Team**: `addReviewersFromTeam` / `addApproversFromTeam` - добавление прямо из Team-панели.
- **Send for approval**: `sendForApproval(releaseType, version, reason, impact, ...)` - составной хелпер: draft новой версии -> выбор Major/Minor -> Reason & Impact -> отправка -> approve вторым пользователем -> History.
- **Электронная подпись**: `confirmSubmission` / `confirmApproval` / `confirmRejection(reason)` / `completeReview` / `clickApproveButtonAndFillPassword` - все требуют ввода пароля.
- **Ownership**: `buttonDraftNewVersion` виден только владельцу.
- **Private space**: `fillDocumentAndSetMemberPrivate(name)` - teamspace с приватным toggle.
- **Restrictions**: `checkTeamMembersReviewerCoauthorApproverNotExists` - member-only не в списках.
- **Release**: `DocumentReleasePage.setEffectiveDate(shortcut)` - отложенная дата (APPROVED, не EFFECTIVE).
- **Reason & Impact**: Description, Reason, Impact Analysis, Impacted Documents.
- **History**: `checkHistoryEventExist` / `checkIfHistoryVersionExists` - проверка событий и версий.
- **Comments**: `checkCommentInPopupById` / `checkCommentInPanelById` / `resolveAllComments` / `addReplyInPopupByCommentId` / `checkCommentCanBeResolved`.
- **Navigation**: `selectControlDocumentSubcategory` - My Document / Library / Templates / Categories / General.
- **Templates**: `createTemplate` - многошаговый мастер (space, title, description, code, custom reason, category, reviewers, approvers).
- **Categories**: редактирование описания, вложения, `checkMoreActionNotExist` (Delete заблокирован).

## Связанные документы

- [Документы и QMS (controlled documents) - код-карта](features/documents-qms.md)
- [QMS sanity-тесты: интеграция, root-cause фиксы](memory/qms-tests-integration.md)
