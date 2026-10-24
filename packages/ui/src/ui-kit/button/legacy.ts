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

// Temporary: selectors still get a legacy string width from tables and forms; removed with the legacy Button.

/** Width of the grid wrapper for a legacy `width`; content-sized widths need no wrapper. */
export function fromLegacySelectWidth (width: string | undefined): string | undefined {
  return width === undefined || ['min-content', 'fit-content', 'max-content', 'auto', 'unset'].includes(width)
    ? undefined
    : width
}
