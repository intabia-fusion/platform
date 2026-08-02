<script lang="ts">
  export let size: 'small' | 'medium' | 'large'
  const fill: string = 'currentColor'
</script>

<svg class="svg-{size}" {fill} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <path
    d="M4 13.5V3M4 3L1.5 6M4 3L6.5 6M8.75 3.75H14.25M8.75 6.75H13.25M8.75 9.75H12.25M8.75 12.75H11.25"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
