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

// Compose api stand is the default; a k8s stand exports PLATFORM_URL (with-stand-env.sh).

export const PlatformUrl: string =
  process.env.PLATFORM_URL ?? process.env.API_TESTS_URL ?? process.env.PLATFORM_URI ?? 'http://localhost:8183'
