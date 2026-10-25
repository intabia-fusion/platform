# Drive, вложения, загрузка и превью файлов

> Сверено с кодом: коммит 39ae47eb6f, 2026-09-23.

Файловая подсистема платформы: `Drive` (пространство файлов/папок с версиями, аналог общего диска), `Attachment` (вложения к любому документу - чат, таск, задача и т.д.), общий загрузчик `uploader` (прогресс/retry/multipart) и конвейер превью/транскодирования (`pods/preview` для картинок/PDF/docx/кадров видео, `pods/media` + `foundations/stream` для HLS-транскодирования видео). Блобы физически лежат в `services/datalake` (Postgres + S3, дефолт) либо в `foundations/hulylake` (Rust, S3 + Postgres) при заданном `HULYLAKE_URL`.

## Где код

| Пакет | Путь | Роль |
| --- | --- | --- |
| `models/drive` | `models/drive/src` | Классы `TDrive`/`TResource`/`TFolder`/`TFile`/`TFileVersion`, права (`permissions.ts`), миграции |
| `plugins/drive` | `plugins/drive/src` | Типы, `createFolder`/`createFile`/`createFileVersion`/`restoreFileVersion` (`utils.ts`), `DriveEvents` (`analytics.ts`) |
| `plugins/drive-resources` | `plugins/drive-resources/src` | UI, `moveResources`/`uploadFilesToDrive`/`getFileTypeIcon` (`utils.ts`), навигация, actionImpl/function для actions |
| `plugins/drive-assets` | `plugins/drive-assets/lang` | Локализация |
| `server-plugins/drive` | `server-plugins/drive/src` | Контракт: triggers `OnFileVersionDelete`, `OnResourceChange`, функция `FindFolderResources` |
| `server-plugins/drive-resources` | `server-plugins/drive-resources/src` | Реализация: чистка blob при удалении версии, поиск файлов/папок для каскадного удаления, счётчики папок (`OnResourceChange` + `DriveMiddleware` в `server/server-pipeline/src/pipeline.ts`) |
| `models/attachment` | `models/attachment/src` | `TAttachment`/`TEmbedding`/`TPhoto`/`TDrawing`/`TSavedAttachments`, actions Pin/Unpin |
| `plugins/attachment` | `plugins/attachment/src` | Типы `Attachment`/`AttachmentMetadata`, вид и формат вложения (`category.ts`) |
| `plugins/attachment-resources` | `plugins/attachment-resources/src` | `createAttachments`/`attachmentsApplier`/`calculateAttachmentDimensions` (`utils.ts`), Svelte-компоненты: обёртки над китом в `components/file/`, просмотрщик, сайдбар, поле ввода |
| `plugins/attachment-assets` | `plugins/attachment-assets/lang` | Локализация |
| `server-plugins/attachment` | `server-plugins/attachment/src` | Контракт: trigger `OnAttachmentDelete` |
| `server-plugins/attachment-resources` | `server-plugins/attachment-resources/src` | Реализация: удаление blob + каскад `Drawing` при удалении Attachment, фасеты поиска (`facets.ts`) |
| `models/uploader` | `models/uploader/src` | `TUploadHandler`, системные обработчики `UploadFilesHandler`/`UploadFoldersHandler` |
| `plugins/uploader` | `plugins/uploader/src` | `FileUploadOptions`/`FileUploadCallback` (`types.ts`), `getDataTransferFiles`/`toFileWithPath` (`utils.ts`) |
| `plugins/uploader-resources` | `plugins/uploader-resources/src` | `uploadFiles`/`uploadFile` (RateLimiter, retry/cancel, `utils.ts`), стор `uploads` (`store.ts`), UI прогресс-бара |
| `plugins/uploader-assets` | `plugins/uploader-assets/lang` | Локализация |
| `plugins/image-cropper` | `plugins/image-cropper/src` | Только контракт плагина: `component.Cropper` |
| `plugins/image-cropper-resources` | `plugins/image-cropper-resources/src` | Реализация `Cropper.svelte` |
| `models/media`, `plugins/media`, `plugins/media-resources` | - | Устройства (камера/микрофон/динамики): `WorkbenchExtension`, `MediaPopup`, `CamStateButton`/`MicStateButton` |
| `pods/preview` | `pods/preview/src` | HTTP-сервис превью: image/doc(libreoffice)/pdf/video(ffmpeg)-провайдеры, диск-кэш |
| `pods/media` | `pods/media/src` | Kafka-мост: слушает `TxCUD`, публикует `stream.transcode.request`/принимает `stream.transcode.result` |
| `pods/link-preview` | `pods/link-preview/src` | HTTP-сервис OpenGraph-превью ссылок (`/details?q=`) |
| `services/datalake/pod-datalake` | `services/datalake/pod-datalake/src` | Blob store: Postgres-метаданные + S3, upload/multipart, каскадное и workspace-удаление |
| `foundations/server/packages/datalake` | `foundations/server/packages/datalake/src` | Серверный `StorageAdapter`-клиент к datalake (`storageAdapter.remove` и т.д.) |
| `foundations/core/packages/storage-client` | `foundations/core/packages/storage-client/src` | Клиентская абстракция `FileStorage`: `DatalakeStorage`/`HulylakeStorage`/`FrontStorage`, `uploadXhr`/`uploadMultipart` |
| `foundations/stream` | - | Go: TUS-приём видео + ffmpeg-транскодер в HLS; отдельно описан в `../stream_integration.md` |
| `packages/hls` | `packages/hls/src/components` | `HlsVideo.svelte` - плеер HLS (hls.js + Plyr) |

## Модель данных

| Класс | Смысл | Файл |
| --- | --- | --- |
| `TDrive extends TTypedSpace` | Диск = типизированное пространство с ролевой моделью (`TDefaultDriveTypeData implements RolesAssignment`) | `models/drive/src/index.ts` |
| `TResource` | Общий предок ресурса: `title` (FullText), `parent`, `path[]` (предки), `comments` | `models/drive/src/index.ts` |
| `TFolder extends TResource` | Папка | `models/drive/src/index.ts` |
| `TFile extends TResource` | Файл: `file: Ref<FileVersion>` (текущая версия), `version: number`, `versions: CollectionSize` | `models/drive/src/index.ts` |
| `TFileVersion extends AttachedDoc` | Версия в коллекции `'versions'`: `file: Ref<Blob>`, `size`, `type`, `lastModified`, `metadata`, `version` | `models/drive/src/index.ts` |
| `TAttachment extends TAttachedDoc` | Вложение к любому документу (коллекция `'attachments'`): `name`, `file: Ref<Blob>`, `size`, `type`, `lastModified`, `description`, `pinned`, `metadata` | `models/attachment/src/index.ts` |
| `TEmbedding` / `TPhoto` | Подтипы Attachment: встраивание в тело / фото с отдельным CollectionEditor `Photos` | `models/attachment/src/index.ts` |
| `TDrawing extends TDoc` | Произвольная аннотация: `parent`, `parentClass`, `content` | `models/attachment/src/index.ts` |
| `TSavedAttachments extends TPreference` | "Закладка" на Attachment | `models/attachment/src/index.ts` |
| `TUploadHandler extends TDoc` | Регистрация обработчика загрузки: `icon`/`label`/`order`/`category`/`handler` | `models/uploader/src/models.ts` |
| `blob.blob` (Postgres, datalake) | `workspace, name` (PK), `hash, location` (FK на `blob.data`), `parent`, `created_at`, `deleted_at` - таблица блобов с каскадом по `parent` | `services/datalake/pod-datalake/src/datalake/db.ts` |
| `blob.data` / `blob.meta` | Физические данные (`hash, location` PK, `size`/`filename`/`type`) и JSON-метаданные (`workspace, name` PK) | `services/datalake/pod-datalake/src/datalake/db.ts` |

## Как работает

1. **Загрузка файла в Drive (drag&drop).** `FileDropArea.svelte` -> `uploadFilesToDrive()` берёт файлы из `DataTransfer` через `getDataTransferFiles()` (`plugins/uploader/src/utils.ts`) -> `uploadFiles()` гонит их через `RateLimiter(maxParallelUploads ?? 10)` (`plugins/uploader-resources/src/utils.ts`) -> `storage.uploadFile()` шлёт в `DatalakeStorage`/`HulylakeStorage` -> по завершении вызывается `fileUploadCallback` (`plugins/drive-resources/src/utils.ts`), который при relative path сам создаёт недостающие подпапки (`findParent`) и создаёт `File`+`FileVersion` через `createFile()` (`plugins/drive/src/utils.ts`).
2. **Загрузка > 10 МБ.** `DatalakeStorage.uploadFile` при `file.size > 10MB` переключается на `uploadMultipart()` (`foundations/core/packages/storage-client/src/upload.ts`): S3-подобный протокол create/part(5 МБ)/complete/abort с retry на каждой стадии, эндпоинты `/upload/multipart/:workspace/:name[/part|/complete|/abort]` (`services/datalake/pod-datalake/src/server.ts`).
3. **Вложение к документу (чат и т.п.).** `createAttachments()` вызывает `uploadFile()` (одиночный файл, без общего прогресс-бара) и затем `client.addCollection(..., 'attachments', ...)` (`plugins/attachment-resources/src/utils.ts`). Диф между вложениями в UI и в БД считает `attachmentsApplier` (`plugins/attachment-resources/src/utils.ts`): создаёт недостающие, удаляет отвалившиеся, метит `savedBlobs` против сборки мусора.
4. **Транскодирование видео (Attachment/Drive -> HLS).** `pods/media` слушает Kafka `QueueTopic.Tx` (все `TxCUD`), на `TxCreateDoc` для `attachment.class.Attachment`/`Embedding`/`drive.class.FileVersion` с `type` вида `video/*` публикует `VideoTranscodeRequest` в топик `stream.transcode.request` (`pods/media/src/handler.ts`). Go-сервис `foundations/stream` тянет blob, гонит через ffmpeg в HLS-лесенку и грузит сегменты обратно в datalake, патчит метаданные исходного blob'а плейлистом/ thumbnail. Результат (`stream.transcode.result`) `pods/media` записывает в `metadata` документа: `hls` (плейлист и постер) и `durationSec` из `ffprobe`, если она известна (`handleTranscodeResult`, `WorkspaceClient.updateBlobMetadata`). Раньше `hls` писался рядом с `metadata`, поэтому читатели смотрят в оба места. Полный протокол, топики, именование артефактов - `../stream_integration.md` и `../memory/video-transcoding-storage.md`. На клиенте `AttachmentVideoPreview.svelte` берёт `getVideoMeta()` (`packages/presentation/src/preview.ts`) и рендерит через `HlsVideo.svelte` из `packages/hls`.
5. **Превью изображений/документов.** Клиент запрашивает `GET {PreviewUrl}/image/:transform/:workspace/:name` (`packages/presentation/src/preview.ts`). `pods/preview` определяет content-type блоба через `stat`, выбирает провайдер (`image`/`doc`(libreoffice->pdf)/`pdf`(poppler)/`video`(ffmpeg frame grab)/`octet`/`fallback`, `pods/preview/src/service.ts`), рендерит через sharp/libvips с форматом по `Accept` (avif/webp/jpeg/png, `pods/preview/src/server.ts`), результат кэширует на диск (`pods/preview/src/cache.ts`, `withCache`/`SingleFlight` против дублирующих запросов).
6. **Удаление.** `OnAttachmentDelete` (`server-plugins/attachment-resources/src/index.ts`; заодно удаляет `SavedAttachments` всех пользователей на это вложение, сирот прошлых удалений чистит миграция `remove-orphan-saved-attachments-v1`) и `OnFileVersionDelete` (`server-plugins/drive-resources/src/index.ts`) вызывают `storageAdapter.remove()`, который бьёт `DELETE /blob/:workspace/:name` в datalake - `db.deleteBlob` каскадно (BFS по `parent`) мягко удаляет всё поддерево, включая HLS-рендиции (подробности каскада и его дыры - `../memory/video-transcoding-storage.md`).
7. **Удаление workspace целиком (FUSIO-1339, новое).** Consumer `createWorkspaceCleaner` (`services/datalake/pod-datalake/src/workspace.ts`) слушает `QueueTopic.Workspace`; на событие `QueueWorkspaceEvent.Deleted` вызывает `datalake.deleteWorkspace()` (`services/datalake/pod-datalake/src/datalake/datalake.ts`), которое одним `UPDATE` мягко помечает все блобы воркспейса удалёнными (`db.ts`), без потрансзакционных Tx-событий.

## Фичи

### Drive

- **Версии файлов.** `createFile`/`createFileVersion`/`restoreFileVersion` - создание, добавление новой версии (`$inc` версии отдельным `update`, затем addCollection и обновление указателя `file` в одной `client.apply()`-транзакции) и откат на старую версию.
  - `createFileVersion`, `plugins/drive/src/utils.ts`.
- **Actions над версиями.** `RestoreFileVersion`, видимость через `CanUpdateFileVersion`; удаление версии доступно только для не-текущей (`$lookup.attachedTo.file !== p._id`).
  - `CanDeleteFileVersion`, `plugins/drive-resources/src/index.ts`.
- **Перемещение с пересчётом путей.** `moveResources` в одной `apply()`-транзакции переносит ресурсы и пересчитывает `path` всех вложенных потомков.
  - `moveResources`, `plugins/drive-resources/src/utils.ts`.
- **Загрузка папками с авто-созданием структуры.** Drag&drop папки -> relative path из `FileWithPath` -> `fileUploadCallback`/`findParent` находит существующие подпапки или создаёт недостающие рекурсивно.
  - `plugins/drive-resources/src/utils.ts`.
- **Сетка и список Drive.** Сетка (`GridView` -> `GridItem`): папки отдельным блоком над файлами, файлы - кит `FileCard` в ширину ячейки, как вкладка «Документы» браузера чата. Выбор следует и за указателем (стрелки начинают с него), но подсвечен только выбранный стрелками: иначе карточка оставалась бы подсвеченной, когда указатель ушёл.
  - Карточка файла: обложка, имя в две строки, размер, дата, «Скачать» и автор внизу. Обложка - картинка, кадр видео (`hls.thumbnail`, его пишет медиа-сервис рядом с `metadata`, а не в нём) или первая страница документа (`filePreview`, `src/preview.ts`, хелперы `pictureImage`/`pageImage` из attachment-resources, значок - `formatBadge` из `@hcengineering/attachment`). Пока картинка или кадр грузятся, под ними `metadata.thumbnail.blurhash` (`filePreview` -> `FileCover`); картинка проявляется целиком, а не полосами.
  - Видео - `VideoCover`: кадр и плашка «▶ 0:42» слева внизу (кадр без метки читается как фото). Длительность - `metadata.durationSec` версии: её пишет браузер при загрузке (`blobVideoMetadata`, plugins/view-resources/src/blob.ts; у записи экрана её в заголовке нет) и уточняет транскодер. У старых версий без неё длительность суммируют из `#EXTINF` плейлиста одного качества, найденного по главному (`hls.source`, `src/video.ts`): только для видимых карточек (и заново, если плейлист появился, пока карточка на экране) и только при `#EXT-X-ENDLIST`. Без плейлиста плашка - один «▶».
  - Аудио - кит `AudioCover` в слоте `cover`: знак звука и длительность; запись запускается в открытом файле, как у остальных карточек.
  - Папки - `FolderTile` без обложки: `FolderGlyph` (контурная папка в цвете бренда `--button-brand-BackgroundColor` на фоне бренда 10%, в тонированном квадрате размера значка формата у файлов), имя и содержимое («4 папки · 12 файлов», «Пусто») из счётчиков самой папки (`FolderContents.svelte`). Порядок внутри блока - как у вида; страница без папок выглядит так же. Клик открывает, меню - правым кликом. Порядок пунктов меню задают группы действий в `models/drive`: «Переименовать», «Переместить» (`edit`) | «Скачать», «Копировать ссылку» (`other`) | «Удалить» (`remove`, последним).
  - Список: у имени файла (`FilePresenter`) - `FileIcon`: миниатюра 24 px у картинки и видео с кадром, у остальных квадратный значок формата кита того же размера (`FileBadge variant="row"`), поэтому имена начинаются в одну колонку. У папки (`FolderPresenter`) - `FolderGlyph` `small` того же размера. Первые страницы документов в списке не запрашиваются, чтобы длинный список не заставлял сервис превью рендерить каждый документ.
- **Счётчики папки.** `folders`/`files` на `Folder` (скрытые, только чтение; считаются только непосредственно вложенные) ведёт серверный триггер `OnResourceChange` (`server-plugins/drive-resources`, `txMatch`: создание, удаление и обновление `File`/`Folder`). Триггер асинхронный (`isAsync`), счётчики догоняют ответ.
  - Создание - родителю `$inc` +1, удаление - -1 (родитель берётся из `removedMap`; родителя, удалённого вместе с содержимым, пропускает), перенос (`parent` в обновлении) - прежнему родителю -1, новому +1. Изменения одной пачки складываются в одно `$inc` на папку.
  - Прежнего родителя кладёт в `meta.fromParent` `DriveMiddleware` (`server/server-pipeline/src/pipeline.ts`; до записи, как `fromStatus` у `WorkflowMiddleware`): один запрос по `_id` на пачку, присланное клиентом значение сбрасывается.
  - Существующие папки пересчитывает миграция `count-folder-contents` (`groupBy` по `parent`, модель 0.8.17); `tryMigrate` выполняет её один раз, повторный пересчёт - только после удаления её документа `core.class.MigrationState`. Пустое поле читается как 0.
  - В списке колонка размера - `ResourceSizePresenter`: размер у файла, «3 папки · 12 файлов» / «Пусто» у папки; у сохранивших свою раскладку колонок (`ViewletPreference` целиком заменяет конфиг модели) осталась старая колонка `$lookup.file.size` и прочерк у папок.
- **Пустая папка.** `FolderBrowser` выбирает между видом и заглушкой по счётчикам папки.
  - При `folders + files > 0` на папке сразу показывает вид, без запроса. При нуле и в корне Диска проверяет запросом с `limit: 1` (ошибшийся счётчик не прячет файлы) и до ответа не показывает ни вида, ни заглушки.
  - Пустая папка без поиска и фильтров вместо вида показывает `BlankView` с `drop`: «Перетащите файлы сюда · или нажмите, чтобы выбрать», клик открывает `uploadFilesToDrivePopup`. При наведении пунктир в цвете бренда с нейтральной заливкой, при перетаскивании зона заливается брендом (`FileDropArea` отдаёт `dragover` в слот, его собственная подсветка выключена `overlay={false}`).
  - Без права загрузки - простой `BlankView` «В папке пока нет файлов». Пустой результат поиска или фильтра остаётся пустым видом.
- **Поиск.** `queryFile`/`queryFolder` по `title $like %...%`, лимит 200, категории для search/mention/spotlight.
  - `plugins/drive-resources/src/index.ts`.
- **Права и шаринг.** Space-права `CreateFile`/`UpdateFile`/`RemoveFile`/`CreateFolder`/ `UpdateFolder`/`RemoveFolder`, workspace-запрет `ForbidCreateDrive` (forbid).
  - `definePermissions`, `models/drive/src/permissions.ts`.
- **Комментарии на файлах.** `File` получает mixin `activity.mixin.ActivityDoc` + `ActivityExtension`.
  - `models/drive/src/index.ts`.
- **Метрики.** `DriveEvents.FileUploaded`/`FolderCreated`/`DriveCreated` - `plugins/drive/src/analytics.ts`.

### Attachments

- **Гостевой доступ.** `createAccessLevel: AccountRole.Guest` на класс Attachment - вложения читаемы без входа. - `models/attachment/src/index.ts`.
- **Расчёт размеров картинки в чате (FUSIO-486).** `calculateAttachmentDimensions`/`getImageDimensions`: лимит в rem по размеру (`medium` - 18rem, `x-large` - 25rem), поправка на DPR, вписывание `contain`; для `auto` и без размеров в метаданных - 300x300. Отдельного потолка для квадратных нет; `LinkCard` размеры считает сам.
  - `plugins/attachment-resources/src/utils.ts`, тесты `src/__tests__/dimensions.test.ts`.
- **Голосовые вложения (FUSIO-866).** Ресурс `attachment.component.VoiceAttachmentPresenter` (миксин `ObjectPresenter` на `AudioTranscribe`) - `file/VoiceAttachment.svelte`: полоса `AudioBar` и расшифровка под ней, правка расшифровки - пункт «Редактировать» контекстного меню (только автору, когда расшифровка готова): текст меняется на поле в рамке поля ввода с крестиком и галочкой внутри, прямо в ленте и той же ширины; Enter сохраняет, Esc отменяет, Shift+Enter - новая строка. Пока расшифровка идёт - крутилка. Не удалась (или сервис вернул пустой текст) - под полосой ничего: повторить её нельзя, а голосовое и так слушается.
- **Вложения в сообщении.** `AttachmentGroup` раскладывает вложения отдельными блоками по виду (`getAttachmentCategory(...).kind`): медиа, документы, аудио (столбцом, `AttachmentList stacked`), ссылки. Внутри блока - по `createdOn`, разные виды не делят одну строку (`compareAsInMessage`, `utils.ts`; в том же порядке плитки при правке сообщения в `AttachmentRefInput`, добавленные при правке - после них).
  - Просмотрщик, открытый из сообщения, листает все его файлы сквозь группы в порядке раскладки: картинки и видео, затем файлы, затем аудио (`AttachmentGroup` передаёт общий `openViewer`, `showAttachmentsViewer` в utils.ts); ссылки пропускаются - они открывают сайт. Отдельный `AttachmentList` (пересланное сообщение) листает свои файлы.
  - `AttachmentPreview` рисует картинку и видео; на наведении кит `MediaToolbar`: у картинки только «Скачать» (открывается она кликом), у видео «Открыть» и «Скачать» (клик по видео запускает воспроизведение). Картинка, которую браузер не рисует (PSD: категория не `Media`), показывается как файл.
  - Картинка (`AttachmentImagePreview`) грузится, когда впервые попадает на экран, и выгружается, уйдя от видимой области дальше запаса (`Image` `margin`, запас `persistentLazyObserver`): полэкрана на компьютере, два экрана на тач-экране. С запасом по умолчанию 20% она при обычной прокрутке назад стояла пустой до повторной загрузки. На тач-экране у картинки и видео панели нет (`MediaToolbar` без `showOnTouch`): тап открывает просмотрщик со «Скачать» в шапке; у видео тап ловит прозрачная кнопка `.tap-open` поверх плеера, иначе он запустил бы воспроизведение на месте.
  - Документ - `file/FileCard.svelte` (первая страница от сервиса превью или крупный значок формата), аудиофайл - `file/AudioAttachment.svelte`, превью ссылки - `file/LinkCard.svelte`. Размер карточек известен до загрузки, лента не прыгает.
  - Остальные действия - в контекстном меню правым кликом (`file/menu.ts`, `showAttachmentMenu`); удаление файла проверяет права пространства и `readonly` (`file/permissions.ts`) и спрашивает подтверждение. «Скачать» на карточках видно при наведении (на устройствах без наведения - всегда).
- **Аудио.** Один `<audio>` на приложение (`sharedPlayback()`, `packages/ui/src/ui-kit/audio/playback.ts`): играет одна запись, запуск другой останавливает текущую. Плеер записи ключуется по файлу (`id` = `file`): карточка в сообщении, в поиске и в боковой панели показывает одно воспроизведение. Запись останавливается через 300 мс после того, как с экрана пропала последняя её карточка. Остановленная запись помнит место до перезагрузки страницы: карточка показывает время и сыгранную часть волны, «Play» продолжает с него, доигранная до конца начинается сначала. Скорость (по кругу 0,5× → 0,75× → 1× → 1,5× → 2×, по умолчанию 1×) одна на все записи и хранится в `localStorage`; кнопка скорости справа от линии, видна у текущей записи и при наведении на плеер. Волна считается из самого файла, когда карточка попала в экран: до 4 МБ и 10 минут (у файла без известной длины она сперва читается из заголовка), не больше двух файлов разом, один раз за сессию; файл больше 4 МБ или неизвестного размера играет на линии без волны, длину для него читает `loadDuration` из заголовка. Волна и линия - ползунки: стрелки двигают на 5 с, Home/End - в начало и конец.
- **Файл в цитате ответа.** `file/MiniPreview.svelte` (`AttachmentMiniPreview`) рядом с цитатой над вводом и в окне пересылки (`ReplyToMessagePresenter`): квадрат 2.5rem - картинка или кадр видео (кит `FileImage`), первая страница (кит `PageThumb`; не нарисовалась - событие `error`, и вместо узкого листа квадратный бейдж), иначе цветной бейдж формата (кит `FileBadge`, у голосового - VOICE). Без текста в сообщении вместо «Вложения» - имя первого файла (у голосового - «Голосовое сообщение») и «+N» за остальные. Голосовое определяет `isVoiceAttachment` (utils.ts), общий с плиткой.
- **Плитки во вводе и в описаниях.** `file/AttachmentTile.svelte` (кит `FileTile`) - в `AttachmentRefInput`, `AttachmentsGrid`, слоте вложений `CreateIssue`, диалогах создания (организация, продукт, тест-кейс, категория документа), Gmail и попапе вложений. Размер `scale`: `medium` во вводе и окнах создания, `large` в описаниях и активности. Картинка и видео - миниатюра, файл - первая страница, аудио играет на месте, ссылка - вид `link` (детали грузит сама плитка).
  - Загрузка - `file/uploads.ts` (`UploadQueue`): у каждого файла с начала своя плитка с именем, размером и полосой прогресса (`progress` у `FileTile`, `onProgress` через `uploadFile` presentation), картинка сразу видна из локального файла. Грузятся три файла разом; сохранённые встают в черновик в порядке добавления, плитка остаётся на месте. Крестик отменяет загрузку файла, ошибка остаётся на плитке (`failed` и «Повторить»; при лимите хранилища - `StorageLimitReached` без повтора).
  - Выбор, перетаскивание (с подсветкой поля) и вставка идут через одну очередь; перетаскивание работает и там, где `enableAttachments={false}` прячет только сетку (окна создания). Окна создания, которые рисуют вложения сами, получают очередь событием `uploads` и рисуют `AttachmentTiles`.
  - Неотправленный файл автор убирает всегда (`draft` у `AttachmentTile`), запрет удаления в пространстве касается сохранённых. Крестик удаления - в правом верхнем углу при наведении; файл удаляется с подтверждением, превью ссылки - без.
  - Файлы, брошенные во время отправки, уходят в следующий черновик. При смене объекта без черновика (`skipAttachmentsPreload=false`) неотправленные файлы прежнего не переезжают на новый.
  - Во вводе чата отправка заблокирована, пока есть незагруженные файлы (подсказка на кнопке); `AttachmentStyledBox.createAttachments` ждёт загрузку и сохраняет без упавших.
  - Превью ссылок не задерживают отправку: `loadLinks` запоминает сообщение, в котором набрана ссылка, и прикрепляет к нему превью, пришедшее после отправки; если ввод ушёл на другой объект без отправки, превью удаляется.
  - Превью получают только ссылки, которых не было в тексте, когда ввод открыл сообщение или черновик (`knownLinks` в `AttachmentRefInput`): при редактировании у старых ссылок превью не дублируется и удалённое не возвращается. Удалённое в черновике превью тоже не появляется снова. Больше трёх превью у сообщения не бывает, считаются уже прикреплённые и загружаемые.
- **Вложения черновика.** Черновик сообщения хранит только загруженные файлы (`<id сообщения>_files` в `DraftController`); документы `Attachment` создаются при отправке, перед сообщением, голосовое (`AudioTranscribe`) тоже, и расшифровка начинается после отправки. При редактировании добавленные и убранные вложения применяются по «Сохранить», отмена их не трогает. Убранный из черновика файл удаляется из хранилища. Вложения, чьего документа уже нет (черновики прежней схемы и классы без коллекции вложений), удаляет миграция `remove-orphan-attachments-v1` (models/attachment/src/migration.ts): родителя ищет по `_id` в доменах класса и его наследников; вложение, чей класс исчез из модели, тоже удаляется. Удаление сырое, поэтому работу `OnAttachmentDelete` она делает сама: закладки, рисунки и файл в хранилище; файл остаётся, если на него ссылается другое вложение (копии делят файл). Если что-то удалено, миграция просит переиндексацию вложений с нуля (`reindex(domain, classes, clean)`): сырое удаление индекс не трогает. - `plugins/attachment-resources/src/components/AttachmentRefInput.svelte`.
- **Превью ссылки.** Композер сохраняет OpenGraph-данные (`fetchLinkPreviewDetails`, под `link-preview`) вложением `application/link-preview`: JSON в файле, заголовок, описание, картинка и адрес - в `metadata`. В сообщении - `file/LinkCard.svelte` (кит `LinkCard`): широкая картинка под текстом в пропорции 1.91, маленькая или высокая - слева от текста, без картинки - только текст. Раскладку выбирает `linkLayout` по `metadata`, поэтому размер известен до загрузки JSON; JSON (`loadLinkDetails`, раз за сессию) заполняет строку сайта. Без текста в `metadata` карточка держит место под заголовок и две строки описания; если детали не загрузились, там адрес, а у вложения без адреса - «Превью ссылки недоступно». Клик открывает ссылку (только `http(s)`), «Открыть / Скопировать ссылку / Убрать» - в меню (`showLinkMenu`); автор сообщения убирает превью крестиком без подтверждения, ссылка в тексте остаётся.
  - `packages/presentation/src/link-preview.ts`, `plugins/attachment-resources/src/components/file/link.ts`.
- **Превью в сайдбаре.** Виджет `attachment.ids.PreviewWidget` (`PreviewWidget.svelte`) + `openFilePreviewInSidebar` создаёт вкладку с иконкой по типу контента; размер файла едет в данных вкладки. Клик по файлу (`openAttachment`) открывает просмотрщик, в сайдбар - пунктом меню файла и кнопкой в шапке просмотрщика. Шапка - та же `FileHeader`, что у просмотрщика: значок, имя, «формат · размер» | скачать, открыть в окне | закрыть вкладку. Тело - `FilePreview` по размеру панели: PDF и текст во всю ширину, аудио - `AudioPreview` (его же получает окно), без просмотрщика - кит `FileNoPreview`.
  - `plugins/attachment-resources/src/utils.ts`.
- **Diff-применение вложений.** `attachmentsApplier` - `createAttributeApplier(..., 'attachments')`, создаёт/удаляет вложения по разнице с текущим состоянием, `savedBlobs` защищает от GC.
  - `plugins/attachment-resources/src/utils.ts`.
- **Категория и поиск вложений.** `getAttachmentCategory(type, name, voice)` раскладывает вложение по виду (`media`/`file`/`audio`/`link`) и формату (pdf, таблица, архив, голосовое...) по расширению (браузер и так выводит MIME из него), без известного расширения - по семейству MIME (`image/`, `video/`, `audio/`, `text/`, pdf); превью ссылки - по своему MIME; голосовое (`AudioTranscribe`) всегда `voice`. Подпись и цвет формата - `formatBadge` (результат идёт прямо в кит `FileBadge`), `formatShortLabels` (цвета `formatColors` внутри `category.ts`): подпись - расширение файла (до 4 букв), без имени - короткая подпись формата, у голосового всегда «VOICE» (контейнер webm или m4a зависит от устройства записи и слушателю ничего не говорит); кит `FileBadge` берёт до 5 букв, пятибуквенную подпись мельче. Сервер кладёт вид и формат в индекс фасетами (`AttachmentSearchFacets`, `SearchPresenter.facets` на `Attachment` и `AudioTranscribe`), для превью ссылки дописывает в `fulltextExtra` заголовок и описание страницы (`SearchFacets.extra`). Вложение сообщения чата индексируется под чатом сообщения (`rootObject` - канал, DM или объект обсуждения; у ответа в треде - чат треда). Расшифровка голосового (`AudioTranscribe.text`) индексируется как основной текст. Поиск и ленты - вкладки браузера чата, см. [chat.md](chat.md) п.12. - `plugins/attachment/src/category.ts`, `server-plugins/attachment-resources/src/facets.ts`, `server/indexer/src/indexer/indexer.ts`.
- **Просмотрщик.** `FileViewer` (`packages/presentation/src/components/viewer/FileViewer.svelte`) открывают `AttachmentPreviewPopup` и `showFileViewer` (версии файла в Drive, резюме в рекрутинге, файл и картинка в редакторе, «открыть в окне» виджета превью). `showAttachmentPreviewPopup(value, props, onClose)` (`utils.ts`) передаёт `props` во `FileViewer`, например `navigation` и `extraActions`.
  - Окно: как модал (фон `--theme-popup-color`, рамка `--theme-popup-divider`, скругление `--large-BorderRadius`, тень `--global-modal-Shadow*`) с отступом 1.5rem от краёв поверх затемнения `--global-media-OverlayColor`; клик мимо окна и Escape закрывают. У картинок и видео в тёмной теме текст и иконки окна светлые (`--global-on-media-TextColor`), значок формата в шапке лежит на сплошной плашке (`plate`).
  - Шапка (`FileHeader.svelte`, общая с сайдбаром): значок формата, имя, «формат · размер» | рисование (у картинок-вложений), скачать, `extraActions` («К сообщению» в просмотре из поиска чата, `plugins/chunter-resources/src/search/viewer.ts`), «В сайдбар» (расширение `FilePreviewPopupActions`) | Esc, закрыть.
  - Оригинал картинки рисуется в обычной яркости (`dynamic-range-limit: standard`): сначала показывается уже загруженная копия из сетки, а у фото с iPhone в ней нет HDR-карты (сервис превью её отбрасывает), и оригинал в HDR вспыхивал бы ярче.
  - Листание: при заданном `navigation` работают клавиши ←/→ и круглые стрелки по бокам у любого файла. Картинка и видео ужимаются под стрелки (`paged`), документ (PDF, текст) остаётся во всю ширину, стрелки лежат поверх его полей.
  - Картинка: масштаб колесом с Ctrl или щипком, кнопками и `+`/`-`/`0`, двойной клик приближает, приближенную можно тащить. Рамка получает размер оригинала из `metadata.originalWidth/originalHeight` до загрузки. Пока оригинал грузится, в рамке уже загруженная на странице копия того же файла (картинка с этим blob id в `currentSrc`, обычно карточка, из которой открыли) - только если пропорции совпадают с оригиналом в пределах ±2%, иначе `thumbnail.blurhash`; оригинал проявляется поверх по `load`. Без размеров в метаданных оригинал скрыт до загрузки, после неё рамка берёт `naturalWidth/Height` (метаданные бывают неверны, например у фото, повёрнутого EXIF). Картинка с рисунками открывается модельным `ImageViewer`.
  - PDF - просмотрщик браузера, страница вписана целиком (`view: 'Fit'` у view `PDFViewer` -> `EmbeddedPDF`, `#view=Fit`): по ширине окна во весь экран лист выходит огромным. В сайдбаре и других местах - по ширине (`FitH`, по умолчанию).
  - DOCX - `DOCXViewer` (print-resources): спиннер на время конвертации, без неё - «нет превью» со скачиванием.
  - Текст и JSON - `TextViewer`, типы из `textContentTypes` (`plugins/view/src/content.ts`: `text/*`, JSON и `+json`, XML, YAML, JS, sh, SQL - браузеры дают текстовым файлам и `application/`-типы). Тот же список решает, рисовать ли файл «листом» (`isTextFile`); шаблоны со `*` сравнивает `matchContentType` (presentation, без регулярки, `+` в типе - обычный символ). JSON до 2 МБ с отступами и с начала, лог - с конца. Markdown (`.md`, `.markdown`, `text/markdown`) до 100 КБ показывается оформленным (`markdownToMarkup` -> `MessageViewer`, колонка 48rem); переключатель «Просмотр | Исходник» (две кнопки `ghost`, как в шапке панели) плавает в углу на непрозрачной подложке без рамки, иконки и их цвет как в шапке просмотрщика (`icons/Picture`, `icons/Code`); после клика мышью кнопка снимает фокус, выбор помнится в `localStorage` (`viewer.markdown.source`). Больше 100 КБ - исходник с пояснением: разбор растёт быстрее размера, и каждый узел - компонент. Markdown, как JSON, читается с начала, если файл обрезан по 256 КБ.
  - Пояснения в тексте - строка посреди пунктирной линии (`.mark`): «без оформления» сверху, «показаны первые/последние N КБ · Показать всё» там, где текст обрывается (снизу у документа, сверху у лога). Длинные строки переносятся (`pre-wrap`), горизонтальной прокрутки нет. Чек-листы (`todoList`/`taskList`) `MessageViewer` рисует только для чтения: флажок в обёртке `inert`, а не `readonly`, иначе серый квадрат прячет галочку.
  - В панели файла Диска (`EditFile`) текст идёт без рамки и без своей прокрутки (`TextViewer` `frame: false`, `scroll: false` -> `TextFlow`): прокручивается вся панель, а не блок внутри неё.
  - Аудио - `file/AudioPreview.svelte` (проп `viewer`). Тип без просмотрщика, битая картинка, текст, который не скачался, и файл без адреса - кит `FileNoPreview` (у последних двух с подписью `ui.string.PreviewFailed`). Его же рисует `FilePreview`, когда сервис превью не отдал миниатюру из `metadata.thumbnail` (`thumbnailFailed`): вместо вечной крутилки.
  - Иконка скачивания в карточках, меню, на панели медиа, в шапке просмотрщика (`FileViewer`) и сайдбара (`PreviewWidget`) - `ui.icon.Download` (на тот же символ ведут chunter и text-editor `Download`); в сайдбаре `ui.icon.OpenFile` («Открыть в окне»), в просмотрщике `ui.icon.Minus` / `ui.icon.Plus` (масштаб картинки). Скачивание - `downloadFile` (`packages/presentation/src/file.ts`).
- **Вложение в строку.** `attachment.component.AttachmentPresenter` - `file/AttachmentLabel.svelte`: значок формата и имя, клик открывает просмотрщик, удаление в меню. Это ссылка на файл: Ctrl/Cmd-клик и средний клик открывают его во вкладке, перетаскивание в редактор вставляет файл (`application/contentType`, как у `FileCard`). Им показаны строки таблицы «Вложения» (`AttachmentRowPresenter`), вложения описания канала, сравнение и удалённые вложения в документах. В активности новое вложение - плитка под заголовком, удалённые - одной строкой: «Удалено», название коллекции и имена через запятую (`DocUpdateMessageContent`).
- **Компоненты.** Карточки, плитки, плеер и превью ссылок - кит `@hcengineering/ui/kit` на простых данных (см. [ui-kit.md](../ui-components/ui-kit.md)). Обёртки в `attachment-resources/src/components/file/` превращают вложение в пропсы (`blob.ts`: значок и источники картинок через `getBlobRef`) и добавляют меню, просмотрщик и права. Файлы читаются простым `fetch` по `getFileUrl`: фронт и хранилище - один origin, cookie сессии уходит сама.
- **Storybook.** Кит - истории «Media/File», «Media/Audio», «Media/Link cards», «Overview/Icons» (`dev/storybook/src/ui-kit/`); вложения целиком - «Attachments/Overview», «Attachments/Viewer» и «Attachments/Sidebar» (`dev/storybook/src/attachments`) на настоящих компонентах с пустой моделью (`mock.ts`).
- **Видео-превью через HLS.** `AttachmentVideoPreview.svelte` берёт HLS-метаданные blob'а и рендерит плеер из `packages/hls`. Плеер стартует с оригинала (`HLS_START_BANDWIDTH` в `HlsVideo.svelte`), иначе hls.js берёт первый сегмент из 720p.

### Uploader

- **Реестр обработчиков.** `UploadFilesHandler` (order 1001) / `UploadFoldersHandler` (order 1002), категория `'files'`. - `models/uploader/src/index.ts`.
- **Параллельная загрузка с лимитом.** `uploadFiles` создаёт все записи прогресса сразу, затем грузит через `RateLimiter(maxParallelUploads ?? 10)`; callback `onFileUploaded` идёт через отдельный `RateLimiter(1)` (последовательно). - `plugins/uploader-resources/src/utils.ts`.
- **Retry/cancel по файлу.** `fileUpload.retry`/`fileUpload.cancel` (AbortController, вычитание прогресса из общей суммы). - `plugins/uploader-resources/src/utils.ts`.
- **Лимит хранилища.** Сервер отвечает 413 -> `StorageLimitError.isStorageLimit` -> `uploader.string.StorageLimitReached` тостом. - `foundations/core/packages/storage-client/src/upload.ts`.
- **Multipart-загрузка больших файлов.** Порог 10 МБ, чанк 5 МБ, S3-подобный протокол с retry на каждой стадии (create/part/complete), abort при ошибке, покрыта тестами (`foundations/core/packages/storage-client/src/__tests__/upload.test.ts`). - `foundations/core/packages/storage-client/src/upload.ts`.
- **Drag&drop папок.** `getDataTransferFiles` рекурсивно обходит `FileSystemEntry` (`webkitGetAsEntry`/`createReader`), `toFileWithPath` вешает `relativePath`.
  - `plugins/uploader/src/utils.ts`.

### Preview pod

- **Провайдеры по content-type.** `image`/`doc` (libreoffice -> PDF) / `pdf` (poppler pdftoppm) / `video` (ffmpeg frame grab) / `octet` / `fallback`; первый подходящий выигрывает.
  - `pods/preview/src/service.ts`.
- **Формат по Accept-заголовку клиента.** avif/webp/jpeg/png, порядок - первое совпадение в списке `prefferedImageFormats`, значит реальный выбор диктует порядок в Accept браузера/клиента.
  - `pods/preview/src/server.ts`. Замеры цены каждого формата - `../memory/preview_bench.md`.
- **Диск-кэш + single-flight.** `CACHE_PATH`/`CACHE_SIZE`/`CACHE_GC_INTERVAL`, LRU-эвикция; параллельные запросы на один и тот же thumbnail схлопываются через `SingleFlight`.
  - `pods/preview/src/cache.ts`, `pods/preview/src/singleflight.ts`, `pods/preview/src/config.ts`.
- **Кастомный базовый образ.** `Dockerfile` использует `intabiafusion/preview-base` (ffmpeg/libreoffice/poppler внутри). - `pods/preview/Dockerfile`.

### Media pod и транскодирование

- **Мост Tx -> Kafka.** Слушает `QueueTopic.Tx`, фильтрует по `objectClass` (`Attachment`/`Embedding`/`FileVersion`) и `video/*` (кроме HLS-плейлиста/сегментов самих себя), публикует запрос на транскодирование. - `pods/media/src/handler.ts`.
- Полный конвейер (ffmpeg-лесенка качества, именование HLS-артефактов, billing-учёт рендиций, три дыры каскадного удаления) - `../memory/video-transcoding-storage.md`; жёстко заданные настройки транскодера (preset, CRF) - `../stream_service_hardening.md`.

### Link preview pod

- **OpenGraph-парсинг ссылок.** `GET /details?q=<url>` возвращает title/description/image/icon для карточки ссылки в чате. - `pods/link-preview/src/parse.ts`, `parseLinkPreviewDetails`.

### Datalake

- **Каскадное удаление по `parent`.** `db.deleteBlob` - BFS, мягко удаляет всё поддерево (родитель
  + HLS-рендиции). - `services/datalake/pod-datalake/src/datalake/db.ts` (см. `../memory/video-transcoding-storage.md` про дыры этого каскада).
- **Удаление воркспейса целиком (FUSIO-1339).** Consumer на `QueueTopic.Workspace`, событие `QueueWorkspaceEvent.Deleted` -> один `UPDATE ... SET deleted_at = now() WHERE workspace = $1` без построчных Tx; повтор события безвреден (уже помеченные строки пропускаются). Физически файлы не трогаются.
  - `services/datalake/pod-datalake/src/workspace.ts`, `datalake/datalake.ts`, `datalake/db.ts`; тест `src/__tests__/workspace.test.ts`.
- **Учёт использования по типу.** `getWorkspaceStats`/`getWorkspaceStatsByType` считают `derivedCount`/`derivedSize` (`FILTER (WHERE parent IS NOT NULL)`) - отделяют сгенерированные рендиции от исходников в `StorageBreakdown.svelte`. Детали - `../memory/video-transcoding-storage.md`.

### Хранилище блобов: три клиента

- **`createFileStorage`.** Выбирает бэкенд по конфигу: `DatalakeStorage` если задан `datalakeUrl`, иначе `HulylakeStorage` если задан `hulylakeUrl`, иначе `FrontStorage` (через `server/front`) как дефолтный фолбэк. - `foundations/core/packages/storage-client/src/client/index.ts`.

### Image cropper

- **Только контракт в `plugins/image-cropper`**, реальный компонент `Cropper.svelte` - в `plugins/image-cropper-resources/src/components/Cropper.svelte`.

## Пользовательская документация

| Фича | ru | en | Статус | Сверено | Расхождение |
| --- | --- | --- | --- | --- | --- |
| Версии файлов | knowledge-management/drive | knowledge-management/drive | partial | 0.8.60 | не описан откат на старую версию (`restoreFileVersion`) и удаление отдельной версии |
| Actions над версиями | - | - | plan | - | |
| Перемещение с пересчётом путей | knowledge-management/drive | knowledge-management/drive | ok | 0.8.60 | |
| Загрузка папками с авто-созданием структуры | knowledge-management/drive | knowledge-management/drive | partial | 0.8.60 | не описана загрузка папки целиком drag&drop с автосозданием недостающих подпапок - страница описывает только загрузку отдельных файлов и ручное создание папки |
| Поиск | - | - | plan | - | |
| Права и шаринг | knowledge-management/drive | knowledge-management/drive | partial | 0.8.60 | не описаны конкретные права по ролям (CreateFile/UpdateFile/RemoveFile и т.п.) и запрет создания дисков (`ForbidCreateDrive`) - только общие настройки владельцев/приватности/автоприсоединения |
| Комментарии на файлах | knowledge-management/drive | knowledge-management/drive | ok | 0.8.60 | |
| Метрики | - | - | internal | - | |
| Гостевой доступ | - | - | internal | - | |
| Расчёт размеров картинки в чате (FUSIO-486) | - | - | internal | - | |
| Голосовые вложения (FUSIO-866) | - | - | plan | - | |
| Инлайн-превью ссылок/картинок во вводе | - | - | plan | - | |
| Превью в сайдбаре | - | - | plan | - | |
| Diff-применение вложений | - | - | internal | - | |
| Link preview в тексте | - | - | plan | - | |
| Видео-превью через HLS | - | - | plan | - | |
| Реестр обработчиков | - | - | internal | - | |
| Параллельная загрузка с лимитом | - | - | internal | - | |
| Retry/cancel по файлу | - | - | plan | - | |
| Лимит хранилища | - | - | plan | - | |
| Multipart-загрузка больших файлов | - | - | internal | - | |
| Drag&drop папок | knowledge-management/drive | knowledge-management/drive | partial | 0.8.60 | страница описывает только drag&drop отдельных файлов в область загрузки, не упоминает загрузку папки целиком |
| Провайдеры по content-type | - | - | internal | - | |
| Формат по Accept-заголовку клиента | - | - | internal | - | |
| Диск-кэш + single-flight | - | - | internal | - | |
| Кастомный базовый образ | - | - | internal | - | |
| Мост Tx -> Kafka | - | - | internal | - | |
| OpenGraph-парсинг ссылок | - | - | internal | - | |
| Каскадное удаление по `parent` | - | - | internal | - | |
| Удаление воркспейса целиком (FUSIO-1339) | - | - | internal | - | |
| Учёт использования по типу | - | - | internal | - | |
| `createFileStorage` | - | - | internal | - | |
| Только контракт в `plugins/image-cropper` | - | - | internal | - | |

## Куда смотреть, если нужно...

- Добавить новый формат превью (например heic) -> `pods/preview/src/providers/*`, `pods/preview/src/utils/*` (уже есть `heic.ts`, `bmp.ts`).
- Изменить лимит параллельных загрузок по умолчанию -> `DEFAULT_MAX_PARALLEL_UPLOADS`, `plugins/uploader-resources/src/utils.ts`.
- Изменить порог/размер чанка multipart-загрузки -> `foundations/core/packages/storage-client/src/upload.ts`.
- Добавить новый content-type для транскодирования видео -> `shouldTranscode`/ `transcodeIgnoredContentTypes`, `pods/media/src/handler.ts`.
- Поменять качество/CRF/пресет транскодера -> `foundations/stream/internal/pkg/profile/profile.go` (см. `../stream_service_hardening.md`).
- Добавить действие над File/Folder в Drive -> `plugins/drive-resources/src/index.ts` (actionImpl) + `models/drive/src/index.ts` (createAction).
- Изменить, что происходит при удалении вложения/версии на сервере -> триггеры `server-plugins/attachment-resources/src/index.ts` / `server-plugins/drive-resources/src/index.ts`.
- Переключить бэкенд блобов клиента -> `createFileStorage`, `foundations/core/packages/storage-client/src/client/index.ts`.
- Изменить схему таблиц datalake -> миграции в `services/datalake/pod-datalake/src/datalake/db.ts` (`getMigrations()`), не трогать `init_tables_01` напрямую.
- Добавить обработку нового Kafka-события воркспейса в datalake -> `services/datalake/pod-datalake/src/workspace.ts`.
- Поменять расчёт размеров картинки-вложения в чате -> `calculateAttachmentDimensions`/ `getImageDimensions`, `plugins/attachment-resources/src/utils.ts`.

## Настройки и конфигурация

| Переменная | Кто читает | Файл | Смысл |
| --- | --- | --- | --- |
| `PREVIEW_URL` | front/desktop -> клиент | `server/front/src/starter.ts`, `desktop/src/ui/platform.ts` | Базовый URL пода превью |
| `LINK_PREVIEW_URL` | front/desktop -> клиент | `server/front/src/starter.ts` | Базовый URL пода link-preview |
| `DATALAKE_URL` | front/desktop -> клиент | `server/front/src/starter.ts` | Приоритетный бэкенд блобов (см. `createFileStorage`) |
| `HULYLAKE_URL` | front/desktop -> клиент | `server/front/src/starter.ts` | Резервный бэкенд блобов, используется только если `DATALAKE_URL` пуст |
| `PORT`/`SECRET`/`SERVICE_ID` | pods/preview | `pods/preview/src/config.ts` | Стандартные для пода |
| `CACHE_ENABLED`/`CACHE_PATH`/`CACHE_SIZE`/`CACHE_GC_INTERVAL` | pods/preview | `pods/preview/src/config.ts` | Диск-кэш thumbnail'ов (МБ, секунды) |
| `DB_URL` | services/datalake | `services/datalake/pod-datalake/src/config.ts` | Postgres/CockroachDB для метаданных блобов |
| `BUCKETS` | services/datalake | `services/datalake/pod-datalake/src/config.ts` (`parseBucketsConfig`) | S3-бакеты формата `name,location|url?accessKey=...&secretKey=...&region=...` |

## Тесты

- Unit: `plugins/attachment-resources/src/__tests__/dimensions.test.ts` (расчёт размеров картинки), `pods/preview/src/__tests__/singleflight.test.ts` и bench `src/__tests__/bench/sharp.bench.test.ts` (см. `../memory/preview_bench.md`), `pods/link-preview/src/__tests__/parse.test.ts`, `services/datalake/pod-datalake/src/__tests__/{workspace,upload-delta,limits,middleware}.test.ts`, `foundations/core/packages/storage-client/src/__tests__/{upload,datalake-storage,hulylake-storage, front-storage,create-file-storage,integration}.test.ts`.
- Sanity (Playwright): `tests/sanity/tests/drive/{drive,video,preview}.spec.ts` (CRUD/версии, видео-транскодирование end-to-end, превью image/docx/video через живой pods/preview), `tests/sanity/tests/tracker/attachments.spec.ts` (вложения к issue), `tests/sanity/tests/API/Datalake.ts` (статистика воркспейса через `/_datalake`, поллинг рендиций).
- Известный стенд-гэп: `pods/media` не был в `tests/docker-compose.yaml` до 2026-09-17 - без него видео не транскодируется в sanity-стенде (сейчас добавлен, подробности - `../memory/video-transcoding-storage.md`).

## Связанные документы

- `../stream_integration.md` - полная схема интеграции `foundations/stream` (TUS upload, ffmpeg, Kafka-топики, конфиг-переменные).
- `../stream_service_hardening.md` - надёжность стрим-сервиса на k8s, таблица CRF-профилей транскодера, hardcoded настройки кодирования.
- `../memory/video-transcoding-storage.md` - полная цепочка "видео -> HLS", биллинг-учёт рендиций, три дыры каскадного удаления, гэп sanity-стенда.
- `../memory/preview_bench.md` - что показал бенчмарк sharp/libvips в pods/preview (avif vs webp, concurrency, память).
- `office-meetings.md` - там же описаны `models/media`/`plugins/media-resources` в контексте митингов и `plugins/recorder-resources` (экранная запись, аплоад в Drive через TUS).
