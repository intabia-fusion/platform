<script lang="ts">
  import { IconSize } from '@hcengineering/ui'

  export let size: IconSize
  export let fill: string = 'currentColor'
</script>

<svg class="svg-{size}" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M5 12L10 17L20 7" stroke={fill} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
</svg>
