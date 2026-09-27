# Первый вход в пространство: онбординг

Онбординг состоит из трёх частей: виджет-чек-лист в правой боковой панели, пустые состояния списков и настройка "Onboarding" в аккаунте. Карточки объявляют модели приложений, состояние хранится в персональном `OnboardingPreference`.

## Виджет-чек-лист

`OnboardingWidget.svelte` (`plugins/workbench-resources`, `workbench.ids.OnboardingWidget`, тип `Flexible`).

- Вверху строка прогресса "N из M" и одна вводная строка (`workbench.string.OnboardingIntro`).
- Карточки берутся из модели (`workbench.class.OnboardingCard`), фильтруются и группируются в `getOnboardingGroups` (`plugins/workbench-resources/src/onboarding.ts`) - эту же функцию использует счётчик в настройках, поэтому числа совпадают.
- Карточка видна, если роль аккаунта не ниже `accessLevel`, а её приложение не скрыто (`Application.hidden`, `ExcludedApplications`, `HiddenApplication`) и доступно роли (`isAllowedToRole`).
- Карточки сортируются по `order` и группируются по `application` в порядке первого появления. Каждая группа с приложением начинается с синтетического шага "Открыть <приложение>" (id `<appId>:open`), он отмечается, когда пользователь открыл приложение.
- Порядок групп: Чат, Задачи, Документы, Диск, Встречи (Planner), Звонки (Office). Группа без приложения (приглашение) идёт первой для роли `AccountRole.Owner` и последней для остальных.
- В группе полное описание и кнопки показывает только первая невыполненная карточка; следующие невыполненные показывают заголовок приглушённо. Выполненные остаются зачёркнутыми.
- Галочку можно поставить и снять вручную.

## Карточки

| Группа | Карточка | Действие (та же строка i18n, что у реальной кнопки) | Автозавершение |
|---|---|---|---|
| без приложения | Пригласите команду | пункт "Пригласить в пространство" в меню `profile-button` | вручную (приглашения лежат в account DB, сигнала в БД пространства нет) |
| Чат | Чаты | `NewChannel`, `NewDirectChat` (меню `chat-new-button`) | `chunter.class.ChatMessage` |
| Чат | Спросите ИИ Юлю | `TalkToYulia` (`ai-chat-button`) | вручную (аккаунт бота определяется асинхронно в `ai-bot-resources`, от которого `workbench-resources` не зависит) |
| Задачи | Создайте проект | `CreateProject` | `tracker.class.Project` |
| Задачи | Добавьте задачу | `NewIssue` (или `ResumeDraft`, если есть черновик) | `tracker.class.Issue` |
| Документы | Создайте пространство документов | `CreateTeamspace` | `document.class.Teamspace` |
| Документы | Напишите документ | `CreateDocument` | `document.class.Document` |
| Диск | Создайте диск | `CreateDrive` | `drive.class.Drive` |
| Диск | Загрузите файл | `uploader.string.UploadFiles` | `drive.class.File` |
| Планер | Встречи и события | `CreateEvent`, подсветка `calendar-grid` | `calendar.class.Event` |
| Офис | Звонки | без действий | `love.class.MeetingMinutes` с текущим аккаунтом в `members` |

Карточки создания требуют `accessLevel: AccountRole.User`, поэтому гостям не показываются.

## Действия и spotlight

`OnboardingAction.target` (`selector`, опциональные `application`, `hint`, `menu`) вместо диалога показывает ссылку "Показать: <название>". `runTarget`:

- переходит в приложение, ждёт элемент (`waitForElement`) и при необходимости раскрывает навигатор;
- если элемент в выпадающем меню `HeaderButton` (`data-id` начинается с `header-menu `) или у цели `menu: true`, подсказка называет пункт меню: `OnboardingOpenMenuHint` с названием действия;
- если элемента нет (нет прав или скрыт), показывает уведомление `OnboardingTargetUnavailable`.

Пользователь нажимает кнопку сам, платформа ничего не делает за него.

## Автозавершение (`doneWhen`)

`OnboardingCardDoneWhen`: `_class` и опциональный `byMember`. Виджет держит живой запрос `limit: 1` по каждой карточке: `{ createdBy: { $in: account.socialIds } }` (или `{ members: account.uuid }` при `byMember`) плюс `createdOn: { $gte: startedAt }`. Запросы стартуют, когда `OnboardingPreference.startedAt` известен.

## Хранение: `OnboardingPreference`

Персональный `Preference`, создаётся лениво.

- `showHints`, `autoOpened`, `completed` (id карточек и шагов `<appId>:open`).
- `startedAt` - момент первого открытия; ставится при создании, для старых записей при первом открытии виджета; "Начать заново" обновляет его. Данные, созданные раньше, не засчитываются.
- `dismissed` - id, которые пользователь снял после выполнения; автоотметка их пропускает, "Начать заново" очищает.
- `progress` - первые timestamp'ы по ключам `opened`, `hintsOff`, `<cardId>:done`, `<cardId>:<actionLabel>`, только для аналитики.

## Автооткрытие и настройки

- `maybeAutoOpenOnboarding` (`Workbench.svelte`, `onMount`) открывает виджет один раз, если `autoOpened !== true` и `showHints !== false`; в автоматизированных браузерах (`navigator.webdriver`) не открывает.
- Ручной возврат: `workbench.function.OpenOnboarding` из настройки "Onboarding" и меню аккаунта.
- Настройка "Onboarding" (`OnboardingSettings.svelte`, `plugins/setting-resources`): тумблер подсказок на пустых экранах, счётчик через `countOnboarding`, "Открыть панель", "Начать заново" (`completed: []`, `dismissed: []`, новый `startedAt`).

## Пустые состояния

`view.mixin.EmptyStateInfo` в моделях приложений (`title`, `description`, `createLabel`) показывают `List.svelte`, `Table.svelte`, `Chat.svelte`, `SpaceView.svelte`; кнопки создания видны при включённых подсказках (`onboardingHints`). Описания проектов, задач, пространств документов, документов и дисков используются и как описания карточек. `drive.string.EmptyStateFilesDescription` называет кнопку загрузки точной строкой `uploader.string.UploadFiles`.

## Как добавить карточку

`builder.createDoc(workbench.class.OnboardingCard, core.space.Model, {...}, <id из plugin.ts модели>)`: `application`, `label`, `description` (одно предложение), `order`, `actions`, `accessLevel`, `doneWhen`. Название действия берётся из той же строки i18n, что у реальной кнопки, `target.selector` целится в её `data-id`. Цепочку шагов одного приложения делают отдельными карточками с соседними `order`, у каждой свой `doneWhen`, точно соответствующий её действию.
