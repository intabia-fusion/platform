# Аренда бэкапа и ревизия индекса (FUSIO-1339)

Причина: бэкап-под и архивация workspace-service оба зовут `backup()` в одно хранилище; индекс
`backup.json.gz` грузится в начале прогона и перезаписывается целиком после каждого домена - кто
записал последним, тот и прав. В CI (`ws-tests/sanity` archive.spec.ts) восстановление прочитало
частичный индекс пода и потеряло задачу. Баг был на develop, стенд `ws-tests` просто впервые получил
бэкап-под.

- Аренда: колонки `backup_lease_until`/`backup_lease_owner` (v45/v46), RPC `updateBackupLease`.
  `getPendingWorkspace` не отдаёт archiving/migration/restore/deletion при живой аренде.
- Продление, вернувшее `false`, сразу отменяет бэкап (`isCanceled`): пространство ушло из `active`,
  архивация ждёт. Ошибки сети терпятся дважды (60 с из TTL 150 с).
- `writeBackupInfo` (замыкание в `backup()`) перед каждой записью индекса перечитывает его и сверяет
  `revision`; чужая ревизия -> отмена без записи. `lastRevision` переписывается после каждого
  внутреннего перечитывания (`checkBackupIntegrity`, compact), иначе ложный конфликт.
- `result.result = true` после цикла доменов раньше ставилось безусловно - отменённый прогон считался
  успешным. Теперь `!canceled()`; архивация шлёт `archiving-backup-done` только при `true`, иначе повтор.
- Перед `checkBackupIntegrity`/`compactBackup` и перед финальной записью стоит `revisionIsOurs`; чужая
  ревизия -> прогон выходит, `blob-info.json.gz` и размеры не пишутся. Не защищено только время работы
  самих функций `utils.ts` (там же синхронный gzip) - его закрывает аренда. Проверка ревизии - чтение и
  запись без CAS; полностью окно закрывает только условная запись S3 (`If-Match`).
- Раскатка: если account ещё без RPC (`UnknownMethod`), под один раз предупреждает и бэкапит без
  аренды - бэкапы на время деплоя не встают.
- Тесты `service.ts` с fake timers: `clearInterval` импортирован из `node:timers`, jest его не
  подменяет - мокать модуль `node:timers`, иначе фейковый интервал не чистится.
- Аренду берёт только периодический под (`doBackup(..., withLease=true)` из очереди `BackupWorker`).
  workspace-service бэкапит через тот же `BackupWorker.doBackup` (`doBackupWorkspace`), но уже в
  `archiving-backup`/`migration-backup`, где захват невозможен - с арендой архивация висела вечно
  (CI `workspace-blobs.test.ts`: "never reached mode 'archived', last: archiving-backup").
