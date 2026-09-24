# AI harness: прогресс запроса и отмена

Область: [AI](../features/ai.md)

## Транспорт прогресса - AIRequest, а не TypingIndicator

`pulse.TypingIndicator` умеет только `status: IntlString` без параметров - счётчик токенов через него не пробросить. Прогресс и отмена делят один документ `AIRequest` (домен `DOMAIN_AI`, space чата): `objectId` (чат/тред) + `iteration`, статус `'cancelled'`.

- Под пишет: `WorkspaceClient.requestHooks` (`workspace/workspaceClient.ts`) - апдейт на каждом раунде модели.
- Под читает: `findOne(AIRequest, {_id})` между раундами (RestClient, liveQuery на поде нет) - `isRequestCancelled`, `workspace/workspaceClient.ts`.
- UI: `plugins/chunter-resources/src/components/AIRequestProgress.svelte`, liveQuery `{objectId, status:'processing'}`.

`createAIRequest` (`workspace/workspaceClient.ts`) берёт `space` параметром - space чата, куда бот и так пишет ответ. Раньше искал `contact.class.PersonSpace` от имени бота, который её не видит (space приватный), и тихо возвращал `undefined` - AIRequest не создавался вовсе. Ошибка `createDoc` теперь глушится (`ctx.warn`) - телеметрия не должна стоить пользователю ответа.

## Отмена = переиспользование ветки "кончились итерации"

`runToolCalls` (`llms/toolLoop.ts`) при исчерпании `MAX_TOOL_ITERATIONS` уже уходит в финальный раунд без тулов; отмена делает `break` из цикла до выполнения тулов и идёт той же веткой - ноль новой логики сборки ответа.

## Все три провайдера на одном цикле

`openai.ts` раньше крутил SDK `client.beta.chat.completions.runTools` - свой цикл внутри SDK, куда хуки не доходили. Переведён на `runToolCalls` через `chatToolStep`. При переносе всплыло: биллинг у SDK-пути шёл один раз в конце, а `chatToolStep` биллит каждый раунд - финальный `billUsage` пришлось убрать, иначе двойной счёт.

## Связанные документы

- [`../features/ai.md`](../features/ai.md)
- [`../ai-harness.md`](../ai-harness.md)
- [`ai_bot_proactive.md`](ai_bot_proactive.md)
