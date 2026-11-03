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

// The URL of the api test stand the suites run against. The Kubernetes `api`
// stand (https://api.fusion.localhost, port from STAND_HTTPS_PORT) is the
// default; deployment/kubernetes/scripts/with-stand-env.sh resolves the
// configured stand (runtime/kubeconfig/context/namespace from stand:configure)
// and exports these variables.

export const PlatformUrl: string =
  process.env.PLATFORM_URL ?? process.env.API_TESTS_URL ?? process.env.PLATFORM_URI ?? 'https://api.fusion.localhost'
