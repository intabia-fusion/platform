<!--
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
-->
<script lang="ts">
  // Draws a tree recorded from the Penpot screen scripts: kit components as visual components, primitives as flex divs.
  import Button from '../kit/Actions/Button.svelte'
  import Menu from '../kit/Actions/Menu.svelte'
  import ButtonGroup from '../kit/Actions/ButtonGroup.svelte'
  import Dialog from '../kit/Actions/Dialog.svelte'
  import KitWizardDialog from '../kit/Actions/KitWizardDialog.svelte'
  import SegmentedControl from '../kit/Actions/SegmentedControl.svelte'
  import Tabs from '../kit/Actions/Tabs.svelte'
  import ClassicButton from '../kit/Actions/ClassicButton.svelte'
  import Modal from '../kit/Actions/Modal.svelte'
  import WizardBar from '../kit/Actions/WizardBar.svelte'
  import WizardDialog from '../kit/Actions/WizardDialog.svelte'
  import Checkbox from '../kit/Forms/Checkbox.svelte'
  import EditBox from '../kit/Forms/EditBox.svelte'
  import Input from '../kit/Forms/Input.svelte'
  import Dropdown from '../kit/Forms/Dropdown.svelte'
  import Radio from '../kit/Forms/Radio.svelte'
  import SearchInput from '../kit/Forms/SearchInput.svelte'
  import SelectButton from '../kit/Forms/SelectButton.svelte'
  import TextArea from '../kit/Forms/TextArea.svelte'
  import TextInput from '../kit/Forms/TextInput.svelte'
  import Toggle from '../kit/Forms/Toggle.svelte'
  import Icon from '../kit/Icon.svelte'
  import LoginAction from '../kit/Login/LoginAction.svelte'
  import LoginBackTitle from '../kit/Login/LoginBackTitle.svelte'
  import LoginButton from '../kit/Login/LoginButton.svelte'
  import LoginCard from '../kit/Login/LoginCard.svelte'
  import LoginCheckbox from '../kit/Login/LoginCheckbox.svelte'
  import LoginCode from '../kit/Login/LoginCode.svelte'
  import LoginField from '../kit/Login/LoginField.svelte'
  import LoginForm from '../kit/Login/LoginForm.svelte'
  import LoginLinks from '../kit/Login/LoginLinks.svelte'
  import LoginOtpHeader from '../kit/Login/LoginOtpHeader.svelte'
  import LoginPage from '../kit/Login/LoginPage.svelte'
  import LoginProviders from '../kit/Login/LoginProviders.svelte'
  import LoginStatus from '../kit/Login/LoginStatus.svelte'
  import LoginTabs from '../kit/Login/LoginTabs.svelte'
  import LoginTitle from '../kit/Login/LoginTitle.svelte'
  import LoginWorkspace from '../kit/Login/LoginWorkspace.svelte'
  import Avatar from '../kit/People/Avatar.svelte'
  import DateSeparator from '../kit/Chat/DateSeparator.svelte'
  import Message from '../kit/Chat/Message.svelte'
  import MessageInput from '../kit/Chat/MessageInput.svelte'
  import NewMarker from '../kit/Chat/NewMarker.svelte'
  import FormRow from '../kit/Settings/FormRow.svelte'
  import GridRow from '../kit/Settings/GridRow.svelte'
  import SectionTitle from '../kit/Settings/SectionTitle.svelte'
  import Section from '../kit/Settings/Section.svelte'
  import SettingRow from '../kit/Settings/SettingRow.svelte'
  import SettingsLayout from '../kit/Settings/SettingsLayout.svelte'
  import Table from '../kit/Settings/Table.svelte'
  import Count from '../kit/Status/Count.svelte'
  import Callout from '../kit/Status/Callout.svelte'
  import EmptyState from '../kit/Status/EmptyState.svelte'
  import KitStatusIcon from '../kit/Status/KitStatusIcon.svelte'
  import Steps from '../kit/Status/Steps.svelte'
  import Notice from '../kit/Status/Notice.svelte'
  import PriorityIcon from '../kit/Status/PriorityIcon.svelte'
  import StatusChip from '../kit/Status/StatusChip.svelte'
  import StatusIcon from '../kit/Status/StatusIcon.svelte'
  import Chip from '../kit/TagsAndFilters/Chip.svelte'
  import FilterChip from '../kit/TagsAndFilters/FilterChip.svelte'
  import KitChip from '../kit/TagsAndFilters/KitChip.svelte'
  import QuickFilter from '../kit/TagsAndFilters/QuickFilter.svelte'
  import Swatch from '../kit/TagsAndFilters/Swatch.svelte'
  import Tag from '../kit/TagsAndFilters/Tag.svelte'
  import ColumnHeader from '../kit/Tracker/ColumnHeader.svelte'
  import IssueCard from '../kit/Tracker/IssueCard.svelte'
  import IssueGroup from '../kit/Tracker/IssueGroup.svelte'
  import IssueList from '../kit/Tracker/IssueList.svelte'
  import IssuePage from '../kit/Tracker/IssuePage.svelte'
  import NewIssuePopup from '../kit/Tracker/NewIssuePopup.svelte'
  import IssueRow from '../kit/Tracker/IssueRow.svelte'
  import KanbanColumn from '../kit/Tracker/KanbanColumn.svelte'
  import AppRail from '../kit/Workbench/AppRail.svelte'
  import Breadcrumbs from '../kit/Workbench/Breadcrumbs.svelte'
  import KitNavGroup from '../kit/Workbench/KitNavGroup.svelte'
  import KitNavItem from '../kit/Workbench/KitNavItem.svelte'
  import Navigator from '../kit/Workbench/Navigator.svelte'
  import PanelHeader from '../kit/Workbench/PanelHeader.svelte'
  import Sidebar from '../kit/Workbench/Sidebar.svelte'
  import SpaceHeader from '../kit/Workbench/SpaceHeader.svelte'
  import TopBar from '../kit/Workbench/TopBar.svelte'
  import Workbench from '../kit/Workbench/Workbench.svelte'
  import { railApps, sidebarWidgets } from '../kit/Workbench/apps'
  import type { RNode } from './recorder'

  export let node: RNode
  // Flex direction of the parent box, for 'fill' sizes
  export let parentDir: string | undefined = undefined

  const align: Record<string, string> = { start: 'flex-start', end: 'flex-end', center: 'center', stretch: 'stretch' }
  const justify: Record<string, string> = { ...align, 'space-between': 'space-between' }

  function shadow (x: Record<string, any>): string {
    const { color, opacity } = x.color
    const alpha = Math.round(opacity * 255)
      .toString(16)
      .padStart(2, '0')
    return `${x.style === 'inner-shadow' ? 'inset ' : ''}${x.offsetX}px ${x.offsetY}px ${x.blur}px ${x.spread}px ${color}${alpha}`
  }

  // 'fill' sizes follow the parent: along its axis a flex share, across it a stretch
  function fillStyle (p: Record<string, any>, parent: string | undefined): string[] {
    const s: string[] = []
    if (p.hs === 'fill') {
      s.push(parent === 'row' ? 'flex:1 1 0;min-width:0;width:auto' : 'align-self:stretch;width:auto')
    }
    if (p.vs === 'fill') {
      s.push(parent === 'column' ? 'flex:1 1 0;min-height:0;height:auto' : 'align-self:stretch;height:auto')
    }
    return s
  }

  function boxStyle (
    p: Record<string, any>,
    shadows: Array<Record<string, any>> | undefined,
    parent: string | undefined
  ): string {
    const s = ['box-sizing:border-box', 'flex:none']
    if (p.dir !== undefined) {
      s.push('display:flex', `flex-direction:${p.dir}`, `align-items:${align[p.align ?? 'start']}`)
      s.push(`justify-content:${justify[p.justify ?? 'start']}`)
    } else s.push('position:relative')
    if (p.gap !== undefined) s.push(`gap:${p.gap}px`)
    if (p.pad !== undefined) s.push(`padding:${p.pad.map((v: number) => `${v}px`).join(' ')}`)
    if (p.wrap === true) s.push('flex-wrap:wrap')
    s.push(p.hs === 'auto' ? 'width:fit-content' : `width:${p.w}px`)
    s.push(p.vs === 'auto' ? 'height:fit-content' : `height:${p.h}px`)
    if (p.fill !== undefined) s.push(`background-color:${p.fill}`)
    if (p.stroke !== undefined) s.push(`border:${p.strokeW ?? 1}px ${p.strokeStyle ?? 'solid'} ${p.stroke}`)
    if (p.radius !== undefined) s.push(`border-radius:${p.radius}px`)
    if (p.clip !== false) s.push('overflow:hidden')
    s.push(...fillStyle(p, parent))
    if (shadows !== undefined) s.push(`box-shadow:${shadows.map(shadow).join(',')}`)
    return s.join(';')
  }

  function textStyle (p: Record<string, any>): string {
    const s = [`font-size:${p.size ?? 14}px`, `font-weight:${p.weight ?? 400}`, `line-height:${p.lh ?? 1.25}`]
    s.push(`color:${p.color ?? 'var(--theme-caption-color)'}`)
    if (p.upper === true) s.push('text-transform:uppercase')
    if (p.align !== undefined) s.push(`text-align:${p.align}`)
    s.push(p.w !== undefined ? `width:${p.w}px;white-space:pre-wrap` : 'white-space:pre')
    return s.join(';')
  }

  $: placed = { ...node, at: undefined }
  $: kids = (name: string | undefined): RNode[] => node.children.filter((k) => k.slot === name)
  $: main = node.children.find((k) => k.slot === 'main')
  $: panel = node.children.find((k) => k.slot === 'panel')
  $: content = node.children.find((k) => k.c === 'slot' && k.slot === undefined)
  let p: any
  $: p = node.props
  $: apps = (p.apps ?? railApps.map((a) => ({ ...a, selected: a.app !== undefined && a.app === p.app }))) as any[]
  $: widgets = (p.widgets ?? sidebarWidgets).map((icon: string) => ({ icon, selected: icon === p.selected }))
</script>

{#if node.at !== undefined}
  <div class="at" style:left="{node.at.x}px" style:top="{node.at.y}px"><svelte:self node={placed} /></div>
{:else if node.c === 'box'}
  <div style={boxStyle(p, node.shadows, parentDir)}>
    {#each node.children as child (child.id)}<svelte:self node={child} parentDir={p.dir} />{/each}
  </div>
{:else if node.c === 'text'}
  <span style={textStyle(p)}>{p.chars}</span>
{:else if node.c === 'Icon'}
  <Icon name={p.name} size={p.size} color={p.color} />
{:else if node.c === 'Workbench'}
  <div class="stage">
    <Workbench workspace={p.workspace} tab={p.tab} account={p.account} {apps} {widgets} panel={panel !== undefined}>
      <svelte:fragment slot="navigator"><Navigator {...p.nav} /></svelte:fragment>
      <div class="slot main-slot">
        {#if main}{#each main.children as child (child.id)}<svelte:self node={child} />{/each}{/if}
      </div>
      <svelte:fragment slot="panel">
        <div class="slot">
          {#if panel}{#each panel.children as child (child.id)}<svelte:self node={child} />{/each}{/if}
        </div>
      </svelte:fragment>
    </Workbench>
    {#each node.children.filter((k) => k.slot === undefined) as child (child.id)}<svelte:self node={child} />{/each}
  </div>
{:else if node.c === 'LoginPage'}
  <div class="stage">
    <LoginPage copyright={p.copyright} width={node.width} height={node.height}>
      {#each node.children as child (child.id)}<svelte:self node={child} />{/each}
    </LoginPage>
  </div>
{:else if node.c === 'LoginCard'}
  <LoginCard
    >{#each node.children as child (child.id)}<svelte:self node={child} />{/each}</LoginCard
  >
{:else if node.c === 'LoginForm'}
  <LoginForm pad={p.pad}
    >{#each node.children as child (child.id)}<svelte:self node={child} />{/each}</LoginForm
  >
{:else if node.c === 'LoginTabs'}
  <LoginTabs {...p} />
{:else if node.c === 'LoginTitle'}
  <LoginTitle {...p} />
{:else if node.c === 'LoginField'}
  <LoginField {...p} />
{:else if node.c === 'LoginStatus'}
  <LoginStatus {...p} />
{:else if node.c === 'LoginButton'}
  <LoginButton {...p} />
{:else if node.c === 'LoginProviders'}
  <LoginProviders {...p} />
{:else if node.c === 'LoginCheckbox'}
  <LoginCheckbox {...p} />
{:else if node.c === 'LoginLinks'}
  <LoginLinks {...p} />
{:else if node.c === 'LoginAction'}
  <LoginAction {...p} />
{:else if node.c === 'LoginOtpHeader'}
  <LoginOtpHeader {...p} />
{:else if node.c === 'LoginCode'}
  <LoginCode {...p} />
{:else if node.c === 'LoginWorkspace'}
  <LoginWorkspace {...p} />
{:else if node.c === 'LoginBackTitle'}
  <LoginBackTitle {...p} />
{:else if node.c === 'TopBar'}
  <div class="sized" style:width="{node.width}px" style:height="{node.height}px"><TopBar tab={p.tab} /></div>
{:else if node.c === 'AppRail'}
  <div class="sized" style:width="{node.width}px" style:height="{node.height}px">
    <AppRail workspace={p.workspace} account={p.account} {apps} />
  </div>
{:else if node.c === 'Navigator'}
  <div class="sized" style:width="{node.width}px" style:height="{node.height}px">
    <div class="antiPanel-navigator no-print landscape border-left">
      <div class="antiPanel-wrap__content hulyNavPanel-container"><Navigator {...p} /></div>
    </div>
  </div>
{:else if node.c === 'Sidebar'}
  <div class="sized" style:width="{node.width}px" style:height="{node.height}px"><Sidebar {widgets} /></div>
{:else if node.c === 'SpaceHeader'}
  <SpaceHeader {...p} customTitle={kids('title').length > 0}>
    <svelte:fragment slot="title"
      >{#each kids('title') as child (child.id)}<svelte:self node={child} />{/each}</svelte:fragment
    >
    <svelte:fragment slot="actions"
      >{#each kids('actions') as child (child.id)}<svelte:self node={child} />{/each}</svelte:fragment
    >
    <svelte:fragment slot="filters"
      >{#each kids('filters') as child (child.id)}<svelte:self node={child} />{/each}</svelte:fragment
    >
  </SpaceHeader>
{:else if node.c === 'PanelHeader'}
  <PanelHeader {...p}>
    <svelte:fragment slot="actions"
      >{#each kids('actions') as child (child.id)}<svelte:self node={child} />{/each}</svelte:fragment
    >
  </PanelHeader>
{:else if node.c === 'Modal'}
  <Modal {...p}
    >{#each node.children as child (child.id)}<svelte:self node={child} />{/each}</Modal
  >
{:else if node.c === 'WizardDialog'}
  <WizardDialog {...p}
    >{#each node.children as child (child.id)}<svelte:self node={child} />{/each}</WizardDialog
  >
{:else if node.c === 'WizardBar'}
  <WizardBar {...p} />
{:else if node.c === 'DateSeparator'}
  <DateSeparator {...p} />
{:else if node.c === 'NewMarker'}
  <NewMarker {...p} />
{:else if node.c === 'Message'}
  <Message {...p} />
{:else if node.c === 'MessageInput'}
  <div style:width="{node.width}px"><MessageInput {...p} /></div>
{:else if node.c === 'GridRow'}
  <GridRow {...p}
    >{#each node.children as child (child.id)}<svelte:self node={child} />{/each}</GridRow
  >
{:else if node.c === 'EditBox'}
  <EditBox {...p} />
{:else if node.c === 'ClassicButton'}
  {#if node.children.length > 0}
    <ClassicButton {...p}
      >{#each node.children as child (child.id)}<svelte:self node={child} />{/each}</ClassicButton
    >
  {:else}
    <ClassicButton {...p} />
  {/if}
{:else if node.c === 'SettingsLayout'}
  <SettingsLayout {...p}>
    <svelte:fragment slot="actions"
      >{#each kids('actions') as child (child.id)}<svelte:self node={child} />{/each}</svelte:fragment
    >
    <svelte:fragment slot="subLead"
      >{#each kids('subLead') as child (child.id)}<svelte:self node={child} />{/each}</svelte:fragment
    >
    {#if content}{#each content.children as child (child.id)}<svelte:self node={child} />{/each}{/if}
  </SettingsLayout>
{:else if node.c === 'Table'}
  <Table {...p}>
    <svelte:fragment slot="cell" let:cell><svelte:self node={cell} /></svelte:fragment>
  </Table>
{:else if node.c === 'Chip'}
  <Chip
    >{#each node.children as child (child.id)}<svelte:self node={child} />{/each}</Chip
  >
{:else if node.c === 'FormRow'}
  <FormRow {...p}
    >{#each node.children as child (child.id)}<svelte:self node={child} />{/each}</FormRow
  >
{:else if node.c === 'Button'}
  <Button {...p} />
{:else if node.c === 'Menu'}
  <Menu items={p.items} width={p.width} />
{:else if node.c === 'Checkbox'}
  <Checkbox {...p} />
{:else if node.c === 'Input'}
  <Input {...p} />
{:else if node.c === 'Radio'}
  <Radio {...p} />
{:else if node.c === 'Toggle'}
  <Toggle {...p} />
{:else if node.c === 'TextInput'}
  <TextInput {...p} />
{:else if node.c === 'TextArea'}
  <TextArea {...p} />
{:else if node.c === 'SelectButton'}
  <SelectButton {...p} />
{:else if node.c === 'Dropdown'}
  <Dropdown {...p} />
{:else if node.c === 'SearchInput'}
  <SearchInput {...p} />
{:else if node.c === 'SettingRow'}
  {#if kids('details').length > 0}
    <SettingRow {...p}>
      {#each kids(undefined) as child (child.id)}<svelte:self node={child} />{/each}
      <svelte:fragment slot="details"
        >{#each kids('details') as child (child.id)}<svelte:self node={child} />{/each}</svelte:fragment
      >
    </SettingRow>
  {:else}
    <SettingRow {...p}
      >{#each kids(undefined) as child (child.id)}<svelte:self node={child} />{/each}</SettingRow
    >
  {/if}
{:else if node.c === 'Section'}
  {#if kids('actions').length > 0}
    <Section {...p}>
      {#each kids(undefined) as child (child.id)}<svelte:self node={child} />{/each}
      <svelte:fragment slot="actions"
        >{#each kids('actions') as child (child.id)}<svelte:self node={child} />{/each}</svelte:fragment
      >
    </Section>
  {:else}
    <Section {...p}
      >{#each kids(undefined) as child (child.id)}<svelte:self node={child} />{/each}</Section
    >
  {/if}
{:else if node.c === 'Callout'}
  {#if kids('actions').length > 0}
    <Callout {...p}>
      <svelte:fragment slot="actions"
        >{#each kids('actions') as child (child.id)}<svelte:self node={child} />{/each}</svelte:fragment
      >
    </Callout>
  {:else}
    <Callout {...p} />
  {/if}
{:else if node.c === 'KitStatusIcon'}
  <KitStatusIcon {...p} />
{:else if node.c === 'Steps'}
  <Steps {...p} />
{:else if node.c === 'EmptyState'}
  <EmptyState {...p} />
{:else if node.c === 'KitChip'}
  <KitChip {...p} />
{:else if node.c === 'Dialog'}
  <Dialog {...p}
    >{#each node.children as child (child.id)}<svelte:self node={child} />{/each}</Dialog
  >
{:else if node.c === 'KitWizardDialog'}
  <KitWizardDialog {...p}
    >{#each node.children as child (child.id)}<svelte:self node={child} />{/each}</KitWizardDialog
  >
{:else if node.c === 'Tabs'}
  <Tabs {...p} />
{:else if node.c === 'SegmentedControl'}
  <SegmentedControl {...p} />
{:else if node.c === 'ButtonGroup'}
  <ButtonGroup {...p} />
{:else if node.c === 'KitNavItem'}
  <KitNavItem {...p} />
{:else if node.c === 'KitNavGroup'}
  <KitNavGroup {...p}
    >{#each node.children as child (child.id)}<svelte:self node={child} />{/each}</KitNavGroup
  >
{:else if node.c === 'Breadcrumbs'}
  <Breadcrumbs {...p} />
{:else if node.c === 'Avatar'}
  <Avatar {...p} />
{:else if node.c === 'SectionTitle'}
  <SectionTitle {...p} />
{:else if node.c === 'Count'}
  <Count {...p} />
{:else if node.c === 'Notice'}
  <Notice {...p} />
{:else if node.c === 'PriorityIcon'}
  <PriorityIcon {...p} />
{:else if node.c === 'StatusChip'}
  <StatusChip {...p} />
{:else if node.c === 'StatusIcon'}
  <StatusIcon {...p} />
{:else if node.c === 'FilterChip'}
  <FilterChip {...p} />
{:else if node.c === 'QuickFilter'}
  <QuickFilter {...p} />
{:else if node.c === 'Swatch'}
  <Swatch {...p} />
{:else if node.c === 'Tag'}
  <Tag {...p} />
{:else if node.c === 'ColumnHeader'}
  <ColumnHeader {...p} />
{:else if node.c === 'IssueCard'}
  <IssueCard {...p} />
{:else if node.c === 'IssueRow'}
  <IssueRow {...p} />
{:else if node.c === 'IssueGroup'}
  <IssueGroup {...p} />
{:else if node.c === 'IssueList'}
  <IssueList {...p} />
{:else if node.c === 'NewIssuePopup'}
  <div style:width="{node.width}px" style:height="{node.height}px"><NewIssuePopup {...p} /></div>
{:else if node.c === 'IssuePage'}
  <div class="sized" style:width="{node.width}px" style:height="{node.height}px"><IssuePage {...p} /></div>
{:else if node.c === 'KanbanColumn'}
  <KanbanColumn {...p} />
{:else}
  <div class="unknown">{node.c}</div>
{/if}

<style>
  .at {
    position: absolute;
    z-index: 1;
  }
  .stage {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .slot {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  /* Absolute children are placed from the outer edge of the bordered panel, as in the Penpot kit; flow children stay inside the border */
  .main-slot {
    box-sizing: border-box;
    width: calc(100% + 2px);
    height: calc(100% + 2px);
    margin: -1px;
    padding: 1px;
  }
  .sized {
    position: relative;
    overflow: hidden;
  }
  .unknown {
    color: red;
  }
</style>
