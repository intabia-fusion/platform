<script lang="ts">
  import { IconSize } from '@hcengineering/ui'

  export let size: IconSize
  export let fill: string = 'currentColor'
</script>

<svg class="svg-{size}" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M7 12L12 17L22 7" stroke={fill} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M12 12L17 7M2 12L7 17L2 12Z" stroke={fill} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
</svg>
