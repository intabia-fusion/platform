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

// Libraries mounted once by PlatformDesign.tenn (the entry document); everything else finds them by name.
// A library of several categories is a file that mounts one file per category: ui_kit.Actions.Button_primary_medium.
// A library of one category is that category file itself, without the category level: workbench.TopBar.
// Dependencies point down this list: base components first, the shell, then what is built from them.
// build fails on a category of library/ui-kit.js that is not listed here.
export const LIBS = [
  { name: 'ui_kit', categories: ['Actions', 'Forms', 'People', 'Status', 'TagsAndFilters', 'Icon'] }, // base components, icons
  { name: 'workbench', categories: ['Workbench'] }, // the application shell: top bar, rail, navigator, space header, shell frames
  { name: 'settings_kit', categories: ['Settings'] }, // forms and tables of settings pages (project and board settings)
  { name: 'tracker_kit', categories: ['Tracker'] }, // issue cards, boards, lists, issue page
  { name: 'chat_kit', categories: ['Chat'] },
  { name: 'login_kit', categories: ['Login'] }
]

export const libOf = (category) => LIBS.find((l) => l.categories.includes(category))
// A library of one category has no category level
export const isFlat = (lib) => lib.categories.length === 1
// File of a library, relative to the output folder: the mounted file of a multi-category library, else the category file
export const libFile = (lib, categoryFile) => (isFlat(lib) ? categoryFile(lib.categories[0]) : lib.name.replace(/_/g, '-') + '.lib.tenn')
