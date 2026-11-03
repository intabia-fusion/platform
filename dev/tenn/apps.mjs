//
// Copyright © 2026 Intabia Fusion.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//

// Product structure of PlatformDesign.tenn: application > category > screens, by the frame names of the screen scripts.
// The applications are those of the platform (plugins/workbench-resources, the plugins tracker, chunter, setting, login);
// the order of screens in a category is the order of the grid, variants and the steps of a flow stay side by side.
// The taxonomy lists every frame of SOURCE: one that is not listed has no place, so a new screen needs a decision.

// design.json file whose pages are placed by this taxonomy; the other screen files are design tasks (FUSIO-...)
export const SOURCE = 'Intabia Screens'

// Frames of SOURCE that are samples of library components (workbench.TopBar, AppRail, Navigator, Sidebar, SpaceHeader):
// they live in the workbench library, not on a screen
export const LIBRARY_PARTS = ['Status bar', 'Application rail', 'Navigator', 'Widget bar', 'Space header']

export const APPS = [
  {
    name: 'Workbench',
    categories: {
      Shell: ['Application shell', 'Shell with side panel']
    }
  },
  {
    name: 'Tracker',
    categories: {
      Boards: [
        'Kanban board', 'Стало - канбан', 'Стало - канбан с дорожками', 'Доска - вид', 'Доска - выбор доски',
        'Доска - вход в настройки', 'Доска - статусы без колонки', 'Доска - статусы колонки'
      ],
      'Board settings': [
        'Настройка доски - Основное', 'Настройка доски - Участники и доступ', 'Настройка доски - Колонки',
        'Настройка доски - Дорожки', 'Настройка доски - Быстрые фильтры', 'Настройка доски - Цвета карточек'
      ],
      'Issue lists': ['Issues list', 'My issues list'],
      Issue: ['Issue page', 'New issue popup'],
      'Project settings': [
        'Настройки проекта - Основное', 'Настройки проекта - Участники и доступ', 'Настройки проекта - Задачи',
        'Настройки проекта - Задачи, чат справа', 'Настройки проекта - Статусы', 'Настройки проекта - Workflow',
        'Настройки проекта - Архивация'
      ],
      'Board card states': [
        'Доска - наведение и фокус', 'Аннотации - наведение и фокус', 'Доска - перетаскивание', 'Аннотации - перетаскивание'
      ],
      'Project boards': [
        'Задачи проекта - 1. сегменты у заголовка', 'Задачи проекта - 2. кнопки в строке фильтров',
        'Задачи проекта - 3. кнопка "Доски (N)"', 'Аннотации - кнопки досок проекта',
        'Вариант 4 - доски на месте заголовка', 'Вариант 4 - доски не влезают, меню', 'Вариант 4 - меню досок проекта'
      ],
      'Create project': [
        'Создание проекта - Шаг 1. Основное', 'Создание проекта - Шаг 1. Ошибка идентификатора',
        'Создание проекта - Шаг 2. Участники и доступ', 'Создание проекта - Шаг 3. Задачи',
        'Создание проекта - Шаг 4. Workflow', 'Создание проекта - Шаг 4. Workflow - у типа нет workflow',
        'Создание проекта - Шаг 5. Сводка', 'Создание проекта на основе - Шаг 1. Основное',
        'Создание проекта на основе - Шаг 1. Выбор проекта-основы', 'Создание проекта на основе - Шаг 2. Что взять из основы',
        'Создание проекта на основе - Шаг 2. У основы нет шаблонов и workflow', 'Создание проекта на основе - Шаг 3. Участники из основы',
        'Создание проекта на основе - Шаг 6. Сводка'
      ]
    }
  },
  { name: 'Chat', categories: { Channels: ['Channel'] } },
  { name: 'Settings', categories: { Workspace: ['General', 'Members'] } },
  {
    name: 'Login',
    categories: {
      'Sign in': [
        'Вход по паролю', 'Вход по паролю: заполнено', 'Вход по паролю: неверный пароль', 'Вход через провайдера',
        'Вход по коду', 'Вход по коду: ввод кода', 'Вход: только провайдеры'
      ],
      'Sign up': [
        'Регистрация', 'Регистрация: заполнено', 'Регистрация по коду', 'Регистрация: подтверждение почты',
        'Регистрация завершена'
      ],
      'Password recovery': ['Восстановление пароля', 'Восстановление пароля: новый пароль', 'Смена пароля'],
      'Link confirmation': [
        'Подтверждение: проверка ссылки', 'Подтверждение: уже зарегистрированы',
        'Подтверждение: ссылка недействительна', 'Вход по ссылке', 'Как вас зовут'
      ],
      Workspaces: ['Выбор рабочего пространства', 'Нет рабочих пространств', 'Создание рабочего пространства'],
      Invitations: [
        'Приглашение', 'Приглашение: регистрация', 'Приглашение: срок истёк', 'Приглашение: нет свободных мест',
        'Приглашение: обработка'
      ]
    }
  }
]

// Frames of the source pages by name, placed by APPS: [{ name, categories: [{ name, frames }] }]
export function placeFrames (pages) {
  const byName = new Map()
  for (const frames of pages.values()) {
    for (const f of frames) {
      if (byName.has(f.name)) throw new Error(`apps: frame "${f.name}" is defined twice in ${SOURCE}`)
      byName.set(f.name, f)
    }
  }
  const used = new Set()
  for (const n of LIBRARY_PARTS) {
    if (!byName.has(n)) throw new Error(`apps: no frame "${n}" in ${SOURCE}`)
    used.add(n)
  }
  const apps = APPS.map((a) => ({
    name: a.name,
    categories: Object.entries(a.categories).map(([name, list]) => ({
      name,
      frames: list.map((n) => {
        const f = byName.get(n)
        if (f === undefined) throw new Error(`apps: ${a.name} / ${name}: no frame "${n}" in ${SOURCE}`)
        if (used.has(n)) throw new Error(`apps: frame "${n}" is placed twice`)
        used.add(n)
        return f
      })
    }))
  }))
  const lost = [...byName.keys()].filter((n) => !used.has(n))
  if (lost.length > 0) throw new Error(`apps: frames of ${SOURCE} not in any application (add them to dev/tenn/apps.mjs): ${lost.join(', ')}`)
  return apps
}

// File of an application, relative to the output folder: Tracker -> apps/tracker.tenn
export const appFile = (name) => 'apps/' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.tenn'
