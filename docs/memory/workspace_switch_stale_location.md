# Forbidden `unknown-space` при создании задачи после смены воркспейса

Ветка `develop`, 2026-10-22.

- Ключи `localStorage` `platform_last_loc_<app>` и черновики (`presentation.metadata.Draft`) общие для всех воркспейсов.
  Читатели ключа приложения обязаны сверять `path[1]` (воркспейс): так делают `NavLink`, `restoreLocation`, `createTab`.
- `Workbench.syncLoc` при пустом `path[3]` брал space из этого ключа без проверки воркспейса. Путь: воркспейс A
  на не-трекере -> задача в B (в ключ пишется сырой URL `/tracker/333-15`) -> трекер в A -> `currentSpace = "333-15"`.
  `updateSpace` оставляет `currentSpace`, даже если space не нашёлся.
- `CreateIssue` писал `ProjectTargetPreference` в сырой `_space` до того, как `SpaceSelect` заменит невалидное значение
  проектом по умолчанию. Теперь запись идёт только для `currentProject`, найденного запросом.
