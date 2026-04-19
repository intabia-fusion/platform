//
// Copyright © 2026 Intabia Fusion.
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

process.env.ACCOUNTS_URL = process.env.ACCOUNTS_URL ?? 'http://localhost:3000'
process.env.LIVEKIT_PROJECT = process.env.LIVEKIT_PROJECT ?? 'test-project'
process.env.LIVEKIT_HOST = process.env.LIVEKIT_HOST ?? 'http://localhost:7880'
process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'test-api-key'
process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? 'test-api-secret'
process.env.SECRET = process.env.SECRET ?? 'test-secret'
