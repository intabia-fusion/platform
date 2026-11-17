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

/**
 * Longest first or last name the account service stores. Shares the email limit so every sign up
 * field has one: the form stops typing and pasting at it and reports a longer value instead of
 * cutting it; `signUp`/`signUpOtp` reject it.
 * @public
 */
export const MAX_PERSON_NAME_LENGTH = 254

/**
 * Longest email the account service accepts: the address limit of RFC 5321 4.5.3.1.3. The sign up
 * and login forms stop typing and pasting at it and report a longer value instead of cutting it;
 * `signUp`/`signUpOtp` reject it.
 * @public
 */
export const MAX_EMAIL_LENGTH = 254
