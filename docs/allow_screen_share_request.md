# Запрос на шаринг экрана (Request Screen Share)

## Проблема
Сейчас если один участник уже делится экраном, другие участники не могут запросить шаринг у него. Кнопка "Share Screen" просто отключается (disabled) когда `screenSharingState === ScreenSharingState.Remote`.

## Текущее поведение
- Пользователь нажимает кнопку шаринга
- Если кто-то уже шарит - кнопка disabled
- Нет возможности запросить текущего шарящего передать управление

## Желаемое поведение
1. При нажатии на кнопку шаринга когда кто-то уже шарит - показывать запрос
2. Текущий шарящий получает уведомление с вариантами:
   - "Передать шаринг" - остановить свой шаринг и разрешить другому
   - "Отклонить" - оставить текущий шаринг
3. После передачи - новый участник начинает шарить автоматически

## Варианты реализации

### Вариант 1: Data Messages (рекомендуется)
Использовать LiveKit Data Messages для отправки запроса напрямую между участниками.

**Преимущества:**
- Быстро работает (P2P через WebRTC data channel)
- Не требует изменений в backend
- Работает в реальном времени

**Реализация:**
```typescript
// Отправка запроса
lk.localParticipant.publishData(
  encoder.encode(JSON.stringify({
    type: 'request-screen-share',
    from: participantIdentity,
    timestamp: Date.now()
  })),
  { reliable: true }
)

// Получение запроса
lk.on(RoomEvent.DataReceived, (payload, participant) => {
  const data = JSON.parse(decoder.decode(payload))
  if (data.type === 'request-screen-share') {
    // Показать notification с кнопками
  }
})
```

### Вариант 2: Сигнальный сервер (через love service)
Отправлять запрос через REST API love service.

**Преимущества:**
- Можно сохранять историю запросов
- Работает даже если участник временно offline

**Недостатки:**
- Требует изменений в backend
- Задержка (HTTP round-trip)

### Вариант 3: Room Metadata
Использовать `Room.setMetadata()` для передачи информации о запросе.

**Преимущества:**
- Простая реализация
- Все видят запрос

**Недостатки:**
- Конфликты если несколько человек запрашивают одновременно
- Требует server-side обработки для изменения metadata

## Рекомендуемый подход
**Вариант 1 (Data Messages)** - самый быстрый и надежный для этого use case.

## Файлы для изменения

### Frontend:
- `plugins/love-resources/src/components/meeting/controls/ShareScreenButton.svelte` - изменить логику disabled и добавить отправку запроса
- `plugins/love-resources/src/liveKitClient.ts` - добавить обработку DataReceived событий
- `plugins/love-resources/src/components/meeting/` - создать компонент уведомления о запросе

### UI Компоненты:
- Новый компонент `ScreenShareRequestPopup.svelte` - показывать текущему шарящему
- Новый компонент `ScreenShareRequestIndicator.svelte` - показывать запрашивающему статус

### Хранение состояния:
- Добавить store для отслеживания pending requests
- Добавить таймаут на запрос (например, 30 секунд)

## Дополнительные улучшения качества шаринга

### Увеличить FPS для шаринга экрана
В `liveKitClient.ts` изменить:
```typescript
screenShareEncoding: {
  maxBitrate: 10_000_000,  // Увеличить до 10 Mbps
  maxFramerate: 30,        // Увеличить до 30 fps
  priority: 'high'
}
```

### Опционально: выбор качества шаринга
Добавить в `ShareSettingPopup.svelte` слайдер или пресеты:
- "Стандарт" (720p@15fps, 3 Mbps)
- "Высокое" (1080p@30fps, 7 Mbps) 
- "Ультра" (4K@30fps, 15 Mbps)

## Этапы реализации
1. **Phase 1**: Базовая функциональность запроса через Data Messages
   - Добавить отправку запроса
   - Добавить обработку и показ notification
   - Добавить передачу шаринга

2. **Phase 2**: UI/UX улучшения
   - Добавить таймауты
   - Добавить звуковое уведомление
   - Добавить список ожидающих запросов

3. **Phase 3**: Улучшение качества
   - Добавить настройки качества шаринга
   - Оптимизация bitrate под тип контента

## Связанные файлы
- `plugins/love-resources/src/liveKitClient.ts`
- `plugins/love-resources/src/components/meeting/controls/ShareScreenButton.svelte`
- `plugins/love-resources/src/components/ShareSettingPopup.svelte`
- `plugins/love-resources/src/components/SharingStatePopup.svelte`

## Примечания
- Нужно обработать edge case: если текущий шарящий отключился - разрешить шарить другим
- Нужно ограничить количество одновременных запросов от одного пользователя
- Рассмотреть возможность "очереди" на шаринг для организованных демонстраций
