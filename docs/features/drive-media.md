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
| `server-plugins/drive` | `server-plugins/drive/src` | Контракт: trigger `OnFileVersionDelete`, функция `FindFolderResources` |
| `server-plugins/drive-resources` | `server-plugins/drive-resources/src` | Реализация: чистка blob при удалении версии, поиск файлов/папок для каскадного удаления |
| `models/attachment` | `models/attachment/src` | `TAttachment`/`TEmbedding`/`TPhoto`/`TDrawing`/`TSavedAttachments`, actions Pin/Unpin |
| `plugins/attachment` | `plugins/attachment/src` | Типы `Attachment`/`AttachmentMetadata` |
| `plugins/attachment-resources` | `plugins/attachment-resources/src` | `createAttachments`/`attachmentsApplier`/`calculateAttachmentDimensions` (`utils.ts`), 54 Svelte-компонента (превью, voice, link preview) |
| `plugins/attachment-assets` | `plugins/attachment-assets/lang` | Локализация |
| `server-plugins/attachment` | `server-plugins/attachment/src` | Контракт: trigger `OnAttachmentDelete` |
| `server-plugins/attachment-resources` | `server-plugins/attachment-resources/src` | Реализация: удаление blob + каскад `Drawing` при удалении Attachment |
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
4. **Транскодирование видео (Attachment/Drive -> HLS).** `pods/media` слушает Kafka `QueueTopic.Tx` (все `TxCUD`), на `TxCreateDoc` для `attachment.class.Attachment`/`Embedding`/`drive.class.FileVersion` с `type` вида `video/*` публикует `VideoTranscodeRequest` в топик `stream.transcode.request` (`pods/media/src/handler.ts`). Go-сервис `foundations/stream` тянет blob, гонит через ffmpeg в HLS-лесенку и грузит сегменты обратно в datalake, патчит метаданные исходного blob'а плейлистом/ thumbnail. Полный протокол, топики, именование артефактов - `../stream_integration.md` и `../memory/video-transcoding-storage.md`. На клиенте `AttachmentVideoPreview.svelte` берёт `getVideoMeta()` (`packages/presentation/src/preview.ts`) и рендерит через `HlsVideo.svelte` из `packages/hls`.
5. **Превью изображений/документов.** Клиент запрашивает `GET {PreviewUrl}/image/:transform/:workspace/:name` (`packages/presentation/src/preview.ts`). `pods/preview` определяет content-type блоба через `stat`, выбирает провайдер (`image`/`doc`(libreoffice->pdf)/`pdf`(poppler)/`video`(ffmpeg frame grab)/`octet`/`fallback`, `pods/preview/src/service.ts`), рендерит через sharp/libvips с форматом по `Accept` (avif/webp/jpeg/png, `pods/preview/src/server.ts`), результат кэширует на диск (`pods/preview/src/cache.ts`, `withCache`/`SingleFlight` против дублирующих запросов).
6. **Удаление.** `OnAttachmentDelete` (`server-plugins/attachment-resources/src/index.ts`) и `OnFileVersionDelete` (`server-plugins/drive-resources/src/index.ts`) вызывают `storageAdapter.remove()`, который бьёт `DELETE /blob/:workspace/:name` в datalake - `db.deleteBlob` каскадно (BFS по `parent`) мягко удаляет всё поддерево, включая HLS-рендиции (подробности каскада и его дыры - `../memory/video-transcoding-storage.md`).
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
- **Поиск.** `queryFile`/`queryFolder` по `title $like %...%`, лимит 200, категории для search/mention/spotlight.
  - `plugins/drive-resources/src/index.ts`.
- **Права и шаринг.** Space-права `CreateFile`/`UpdateFile`/`RemoveFile`/`CreateFolder`/ `UpdateFolder`/`RemoveFolder`, workspace-запрет `ForbidCreateDrive` (forbid).
  - `definePermissions`, `models/drive/src/permissions.ts`.
- **Комментарии на файлах.** `File` получает mixin `activity.mixin.ActivityDoc` + `ActivityExtension`.
  - `models/drive/src/index.ts`.
- **Метрики.** `DriveEvents.FileUploaded`/`FolderCreated`/`DriveCreated` - `plugins/drive/src/analytics.ts`.

### Attachments

- **Гостевой доступ.** `createAccessLevel: AccountRole.Guest` на класс Attachment - вложения читаемы без входа. - `models/attachment/src/index.ts`.
- **Расчёт размеров картинки в чате (FUSIO-486).** `calculateAttachmentDimensions`/ `getImageDimensions`: rem-лимиты по размерам, square-cap 6rem для квадратных, DPR, contain/cover.
  - `plugins/attachment-resources/src/utils.ts`, тесты `src/__tests__/dimensions.test.ts`.
- **Голосовые вложения (FUSIO-866).** `VoicePlayer.svelte`/`VoiceAttachmentPresenter.svelte`.
- **Инлайн-превью ссылок/картинок во вводе.** `AttachmentRefInput.svelte`.
- **Превью в сайдбаре.** Виджет `attachment.ids.PreviewWidget` + `openFilePreviewInSidebar` создаёт вкладку с иконкой по типу контента.
  - `plugins/attachment-resources/src/utils.ts`.
- **Diff-применение вложений.** `attachmentsApplier` - `createAttributeApplier(..., 'attachments')`, создаёт/удаляет вложения по разнице с текущим состоянием, `savedBlobs` защищает от GC.
  - `plugins/attachment-resources/src/utils.ts`.
- **Link preview в тексте.** `fetchLinkPreviewDetails`/`canDisplayLinkPreview` тянут OpenGraph-данные с пода `link-preview`, рендерятся `LinkPreviewCard.svelte`/`LinkPreviewImage.svelte` и т.д.
  - `packages/presentation/src/link-preview.ts`, используется в `AttachmentRefInput.svelte`.
- **Видео-превью через HLS.** `AttachmentVideoPreview.svelte` берёт HLS-метаданные blob'а и рендерит плеер из `packages/hls`.

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
