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

/** Content taller than `limit` is cropped with a fade; the button under it shows the rest. */
export interface ShowMoreProps {
  /** Height in pixels the content is cropped to; 240 by default. */
  limit?: number
  /** Bindable; whether cropped content is shown in full. Opens by itself when Tab moves focus below the crop. */
  open?: boolean
  /** Shows the content in full, with no cropping and no button (an editor, a preview that grows by itself). */
  disabled?: boolean
  /**
   * `false` crops without the button: a table cell that must keep its height. Put only text in it: nothing opens the
   * cropped rest, so a link or a button below the crop would take the focus and stay invisible.
   */
  expandable?: boolean
}

export interface ShowMoreEvents {
  /** The new open state, after a click on the button or focus moving below the crop. */
  toggle: CustomEvent<boolean>
}
