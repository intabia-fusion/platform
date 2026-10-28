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

/** Three dots in a wave inside the typing mark. */
export interface TypingDotsProps {
  /** Stops the wave, for dots kept in the layout while hidden. */
  paused?: boolean
}

/** An object icon or avatar (default slot) with the typing mark over its bottom-right corner. */
export interface TypingIndicatorProps {
  /** Shows the mark; it pops out of the corner and covers the presence dot. */
  typing?: boolean
}
