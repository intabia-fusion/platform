# Push входящего звонка: VoIP

Область: [Уведомления](../features/notifications.md), [Встречи](../features/office-meetings.md)

- На `apns-voip://` уходит только живой звонок. iOS (с iOS 13) завершает приложение, которое не сообщило о VoIP push в CallKit (`reportNewIncomingCall`) до выхода из `didReceiveIncomingPush`, а после нескольких таких случаев перестаёт доставлять ему VoIP. Поэтому ни dismiss, ни `call-cancel`, ни просроченный звонок туда не идут - отмена звонка на iOS только background push на `apns://`.
- PushKit-токен принадлежит topic `<bundle>.voip`. Обычный push на него APNs отклоняет с `DeviceTokenNotForTopic`, а pod-notification считает такой ответ мёртвым токеном и удаляет подписку (`dead` в `apnsRequest`, mobile.ts) - одна ошибка маршрутизации стирает VoIP-подписку.
- Push звонка не удерживается (`holdsPush` в services/notifications/src/module/notification.ts): удержание ждёт чтения до 60 с, а звонок звонит 45 с (`CALL_RING_MS`).
- TTL `UserMeetingInvite` (30 с) для холодного старта не узкое место: звонящий продлевает invite heartbeat-ом раз в 15 с, пока ждёт (`renewOutgoingInvites`, plugins/love-resources/src/invites.ts).
