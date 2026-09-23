# Кнопка записи залипает: /startRecord -> 409 already-running

Подтверждено логами stage `love-service-599d9797-cp5sz.log` (2026-09-01, meeting
`6a96c591705d15e7270663de`). Пользователь остановил транскрипцию раньше видеозаписи.

```
12:31:24.894  createPendingRecording  format:video
12:31:24.959  egress_started          EG_Wo2BZtRutmMK   <- видео
12:31:25.047  updateMeetingRecordingState  state:1 (Recording)
12:31:31.618  cancelPendingRecording  format:audio  EG_VhKAuqdee5V9
12:31:31.824  egress_ended            EG_VhKAuqdee5V9   <- АУДИО
12:31:31.857  updateMeetingRecordingState  state:2 (Finished)  <- сбросил флаг видео
12:31:34.587  warn: Video recording already in progress  EG_Wo2BZtRutmMK
```

## Первопричина

`services/love/src/webhook.ts` `egressEnded` сбрасывал `recordingState` в `Finished`
для egress **любого формата**. Аудио-egress (транскрипция, `.ogg`) живёт своей жизнью
и заканчивается раньше видео. Старт разделён по форматам корректно
(`startAudioRecording` трогает только `transcriptionState`), а конец - нет.

## Почему кнопка после этого залипала намертво

Два разных критерия «идёт ли запись»:

- `RecordingButton.svelte` рисовал красную кнопку по `currentVideoRecording !== undefined ||
  recordingState === Recording` - живой `PendingRecording` достаточно
- `loveClient.record` выбирал `/startRecord` vs `/stopRecord` только по `recordingState`

`PendingRecording` видео жив, флаг сброшен -> кнопка красная, каждое нажатие уходит в
`/startRecord` -> 409 `already-running`.

## Фиксы

1. `webhook.ts` - сбрасывать `recordingState` только для `format === 'video'`.
2. `loveClient.record(mm, isRecording)` - путь решает вызывающий; `RecordingButton`
   передаёт тот же признак, по которому рисует себя.
3. `recordings.ts` `startRecording` - на `already-running` чинит отставший документ
   (`updateMeetingRecordingState` глотает ошибки в catch, рассинхрон возможен и иначе).

## Про существующий тест

`recordings.test.ts` «reports a refusal when a recording is already running» проверял,
что сервер **возвращает** `already-running` - то есть фиксировал симптом как корректное
поведение. Клиентский рассинхрон не покрывал никто.

## Второй аудио-egress из гонки /transcription (2026-09-15)

`startAudioRecording` не имел сериализации, которая есть у видео (`startInFlight`): два
`/transcription(true)` в пределах одного round-trip (тест + авто-коннект ai-bot по
`startWithTranscription`) создавали две резервации и два egress на один митинг.
Разбор флака - в [sanity-flaky-tests.md](sanity-flaky-tests.md).

## Резервация через TxApplyIf (2026-09-15)

`startInFlight` - Map в памяти процесса, между репликами love не работает. Заменён на
`WorkspaceClient.createPendingRecording`: проверка "слот занят" и вставка уходят одним `TxApplyIf`
со scope `love:recording:<meeting>:<format>` и двумя `notMatch` (у `notMatch` нет `$or`: строка
с `egressId` или свежая резервация моложе grace). `ApplyTxMiddleware` держит scope-lock на время
проверки и записи - атомарно в пределах транзактора воркспейса. Проигравший перечитывает слот и
получает `already-running`.

Отвергнуто: детерминированный `_id` `${meetingId}-${format}` с упором в PK. Освобождать слот пришлось
бы удалением строки, а строка `cancelled` ещё ждёт `egress_ended` - удалить её значит не прикрепить
файл записи. Плюс удаление+вставка устаревшей строки снова гонка. Вставка в PG - обычный `INSERT` без
`ON CONFLICT` (`postgres/src/storage.ts`, `insert` -> `upload(..., false)`).

### Два инварианта резервации

**`notMatch` обязан совпадать с `findRunningRecording` строка в строку.** Каждая клауза `alive` в
`createPendingRecording` - это одно из условий, по которым процессор считает запись живой, включая
проверку возраста для легаси-строк без `status` (там тоже нужен `egressId` либо возраст моложе
grace). Клауза строже процессора = строка, которую проверка на входе игнорирует, навсегда
блокирует слот, и митинг нельзя записать больше никогда.

Тест не сверяет форму запроса, а гоняет таблицу строк через оба предиката: `findRunningRecording`
вызывается напрямую через прототип, `notMatch` применяется `findProperty` (`matchQuery` требует
Hierarchy с зарегистрированным классом). Расхождение падает само.

**`createPendingRecording` кидает наружу намеренно:** `undefined` значит "слот занят", и получивший
его вызывающий бросает запись насовсем; недоступный транзактор так интерпретировать нельзя. Цена -
ловить throw на границе очереди: кейс `QueueMeetingEvent.started` в `main.ts` без try/catch роняет
консьюмер, а он передоставляет упавшее сообщение без ограничений и блокирует весь топик (инцидент
20260915-152705: 636 вебхуков доставлено, 0 обработано). Неудачный автостарт стоит одной записи,
throw стоит топика.
