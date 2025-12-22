<!-- Copyright © 2025 Hardcore Engineering Inc. -->
<!-- -->
<!-- Licensed under the Eclipse Public License, Version 2.0 (the "License"); -->
<!-- you may not use this file except in compliance with the License. You may -->
<!-- obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0 -->
<!-- -->
<!-- Unless required by applicable law or agreed to in writing, software -->
<!-- distributed under the License is distributed on an "AS IS" BASIS, -->
<!-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. -->
<!-- -->
<!-- See the License for the specific language governing permissions and -->
<!-- limitations under the License. -->

<script lang="ts">
  import { IconSize } from '@hcengineering/ui'

  export let size: IconSize = 'small'
  export let fill: string = 'currentColor'
</script>

<svg class="svg-{size}" fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <defs>
    <clipPath id="clip0_16_12297">
      <rect width="24" height="24" fill="white" />
    </clipPath>
  </defs>

  <g clip-path="url(#clip0_16_12297)">
    <path
      d="M8.99997 12.0001H5.41397C5.21622 12.0001 5.02292 11.9414 4.85851 11.8315C4.6941 11.7216 4.56596 11.5654 4.49029 11.3827C4.41462 11.2 4.39482 10.999 4.43339 10.8051C4.47196 10.6111 4.56716 10.4329 4.70697 10.2931L11.293 3.70709C11.4805 3.51962 11.7348 3.41431 12 3.41431C12.2651 3.41431 12.5194 3.51962 12.707 3.70709L19.293 10.2931C19.4328 10.4329 19.528 10.6111 19.5666 10.8051C19.6051 10.999 19.5853 11.2 19.5096 11.3827C19.434 11.5654 19.3058 11.7216 19.1414 11.8315C18.977 11.9414 18.7837 12.0001 18.586 12.0001H15V15.0001H8.99997V12.0001V12.0001Z"
      stroke={fill}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path d="M9 21H15" stroke={fill} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M9 18H15" stroke={fill} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </g>
</svg>
