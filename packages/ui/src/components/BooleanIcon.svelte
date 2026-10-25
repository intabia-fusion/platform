<script lang="ts">
  import ui from '../plugin'
  import Icon from './Icon.svelte'

  export let value: any
</script>

<div class="container" class:yes={value === true} class:no={value === false}>
  <Icon
    icon={value === true
      ? ui.icon.CheckCircleSmallFill
      : value === false
        ? ui.icon.CrossCircleSmallFill
        : ui.icon.QuestionCircleSmallFill}
    size="small"
  />
</div>

<style lang="scss">
  .container {
    display: flex;
    color: var(--theme-dark-color);
    &.yes {
      color: var(--bg-positive-default);
    }
    &.no {
      color: var(--bg-negative-default);
    }
  }
</style>
