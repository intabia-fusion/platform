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

// Hand-drawn 16x16 stroke icons of the design kit, by short name. Other names go through the product sprites (Icon.svelte).
export const kitIcons: Record<string, string> = {
  calendar: '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
  component:
    '<path d="M8 2l2.5 2.5L8 7 5.5 4.5zM8 9l2.5 2.5L8 14l-2.5-2.5zM4.5 5.5L7 8l-2.5 2.5L2 8zM11.5 5.5L14 8l-2.5 2.5L9 8z"/>',
  milestone: '<path d="M3 14V2.5h8l-1.5 3 1.5 3H3"/>',
  clip: '<path d="M10.5 5L6 9.5a1.4 1.4 0 0 0 2 2L13 6.5a2.8 2.8 0 0 0-4-4L4 7.5a4.2 4.2 0 0 0 6 6l3.5-3.5"/>',
  comment: '<path d="M2.5 3.5h11v7.5h-6L4.5 13.5V11h-2z"/>',
  clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2 1.3"/>',
  subissues: '<path d="M4 2.5v8.5h7M4 6.5h7"/><circle cx="12" cy="6.5" r="1"/><circle cx="12" cy="11" r="1"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  chevronR: '<path d="M6 3.5L10.5 8 6 12.5"/>',
  chevronD: '<path d="M3.5 6L8 10.5 12.5 6"/>',
  chevronL: '<path d="M10 3.5L5.5 8l4.5 4.5"/>',
  merge: '<path d="M3 3h4v10H3zM9 3h4v10H9z"/>',
  more: '<circle cx="3.5" cy="8" r=".9"/><circle cx="8" cy="8" r=".9"/><circle cx="12.5" cy="8" r=".9"/>',
  list: '<path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.5M2.5 8h.5M2.5 12h.5"/>',
  board:
    '<rect x="2" y="2.5" width="3.5" height="11" rx="1"/><rect x="7" y="2.5" width="3.5" height="7" rx="1"/><path d="M12 2.5h2v5h-2z"/>',
  timeline: '<circle cx="8" cy="8" r="5.5"/><path d="M8 8l3-3"/>',
  sort: '<path d="M4 3v10M2 11l2 2 2-2M8 4h6M8 7h4.5M8 10h3"/>',
  sliders: '<path d="M2.5 5h11M2.5 11h11"/><circle cx="6" cy="5" r="1.6"/><circle cx="10" cy="11" r="1.6"/>',
  filter: '<path d="M2.5 3h11L9.2 8.3V13l-2.4-1.2V8.3z"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>',
  check: '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/><path d="M5.5 8l2 2 3.5-4"/>',
  tick: '<path d="M3.5 8.5l3 3 6-7"/>',
  gear: '<circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>',
  drag: '<circle cx="6" cy="4" r=".8"/><circle cx="10" cy="4" r=".8"/><circle cx="6" cy="8" r=".8"/><circle cx="10" cy="8" r=".8"/><circle cx="6" cy="12" r=".8"/><circle cx="10" cy="12" r=".8"/>',
  star: '<path d="M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3 4.3 13.3l.8-4.1L2 6.3l4.2-.5z"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 9h5.6l.7-9"/>',
  x: '<path d="M4 4l8 8M12 4l-8 8"/>',
  warn: '<path d="M8 2.5l6 10.5H2z"/><path d="M8 6.5v3M8 11v.3"/>',
  eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  users:
    '<circle cx="6" cy="5.5" r="2.3"/><path d="M2 13c.4-2.4 2-3.6 4-3.6s3.6 1.2 4 3.6M10.5 3.5a2.2 2.2 0 0 1 0 4.2M12 9.6c1.2.5 1.9 1.6 2.1 3.4"/>',
  person:
    '<circle cx="8" cy="8" r="6.5" stroke-dasharray="2 1.5"/><circle cx="8" cy="6.5" r="2"/><path d="M4.5 12c.8-1.6 2-2.3 3.5-2.3s2.7.7 3.5 2.3"/>',
  palette:
    '<path d="M8 2a6 6 0 1 0 0 12c1 0 1.3-.8.9-1.5-.5-.8 0-1.8 1-1.8H12a2 2 0 0 0 2-2C14 5 11.3 2 8 2z"/><circle cx="5" cy="7" r=".8"/><circle cx="7.5" cy="4.8" r=".8"/><circle cx="10.5" cy="5.5" r=".8"/>',
  layout: '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M2.5 6h11M6 6v7.5"/>',
  lanes: '<path d="M2 4.5h12M2 8h12M2 11.5h12"/>'
}
