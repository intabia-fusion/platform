# Penpot 2.18.3: особенности Plugin API и RPC

Область: [Penpot: макеты интерфейса](../penpot.md)

- Auto-width текст измеряется только на странице, открытой в редакторе. Если её создать через `penpot.openPage()` и сразу рисовать, тексты остаются 1x1, а flex-раскладка сжимается. Поэтому `kit.page` ждёт, пока `penpot.currentPage.id` сменится, и ещё 1 с, а `kit.settle` вызывает `zoomToFitAll` и ждёт 4 с.
- `penpot.createText('')` возвращает `null`, и следующий `applyToText` падает с `:applyToText`. `kit.text('')` вместо текста отдаёт пустой board.
- Когда board добавляется во flex-родителя, его собственный `flex.horizontalSizing`/`verticalSizing` сбрасывается в `fix`. `kit.add` после `appendChild` выставляет sizing заново.
- `penpotUtils.createVariantContainer` требует минимум два компонента. С одним падает "created container has no `variants`".
- Если удалить token set и в том же вызове создать сет с тем же именем, будет "A set with the same name already exists". `library/ui-kit.js` обновляет токены на месте (`syncSet`).
- RPC `export-binfile` отвечает потоком SSE. Архив лежит по `~#uri` в последнем событии `end`.
- `import-binfile` multipart: поле `version` строкой не проходит валидацию (`[:enum 1 3]`), его не передают.
- MCP в compose работает в multi-user режиме: одно подключение плагина на MCP-ключ. Вторая вкладка отклоняется ("Duplicate connection for given user token", `PluginBridge.ts` в `penpot/mcp/packages/server`), и `execute_code` идёт в первую. Поэтому `design:up`/`design:build` в headless-браузере работают только при закрытых вкладках Penpot.
- MCP-сервер отвечает HTTP 413 на тело `tools/call` больше ~100 КБ. Поэтому `penpot.mjs run` кладёт токены (~38 КБ) в `storage.TOKENS` отдельным вызовом, а из kit и скриптов при отправке убирает строки-комментарии и отступы.
- Фоновую вкладку браузер замораживает. Плагин тогда отвечает "suspended, no heartbeat"; devtools-протокол на этой вкладке тоже не отвечает (`Network.enable timed out`). Будит только клик человека по вкладке.
- У flex-board, созданного без `addFlexLayout`, `shape.flex === null`, а не `undefined`.
- Вызов API комментариев из плагина (`page.findCommentThreads`) после `addCommentThread` в той же вкладке завесил редактор: задача MCP ушла в таймаут 120 с, потом пропал heartbeat. RPC `get-comment-threads`/`get-comments` отвечают сразу, поэтому `design:diff` читает комментарии через них.
- Плагин отвечает на упавшую или просроченную задачу MCP обычным текстом "Tool execution failed: ..." (не isError), а скрипт после таймаута 120 с продолжает работать. Раньше `build` этого не замечал и запускал следующий скрипт поверх. Теперь `runScript` в `penpot.mjs` ждёт метку конца в `storage` (до 10 минут) и прерывает сборку на ошибке скрипта или на "suspended". Скрипт одного экрана по-прежнему лучше держать в пределах 2 досок.
