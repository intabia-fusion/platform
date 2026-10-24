// FUSIO-1613: board with a tooltip on the "Настройки доски" button: the entry into the settings.
// Runs after 02-board-view.js on the same page; split because one script has 120 s.
await kit.page('2. Доска (to-be)', { keep: true })

// The only way into the board settings: the button in the header
const entry = boardView('Доска - вход в настройки', 0, 1200)
kit.at(entry.main, tipBox('Настройки доски: колонки, дорожки, фильтры, цвета', 350), entry.main.width - 57 - 350, 52)

await kit.settle()
return [entry.frame.id]
