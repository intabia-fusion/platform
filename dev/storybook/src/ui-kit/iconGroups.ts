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

/** Kit icons by meaning, keys of `ui.icon`; a key in no group shows up under Other. */
export const iconGroups: Array<{ title: string, keys: string[] }> = [
  {
    title: 'Arrows',
    keys: [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUpRight',
      'ArrowFatUp',
      'ArrowUpLines',
      'ArrowBendUpLeft',
      'ArrowBendUpRight',
      'ArrowUturnLeft',
      'ArrowUturnRight',
      'ArrowElbowLeftUp',
      'ArrowClockwise',
      'ArrowCounterClockwise',
      'ArrowsClockwise',
      'ArrowsHorizontal',
      'ArrowsLeftRight',
      'Shuffle',
      'ArrowsMove',
      'ArrowIn',
      'ArrowOut',
      'ArrowInSquare',
      'ArrowSquareOut',
      'ArrowsOut',
      'ArrowsIn',
      'ArrowsInCorners',
      'ArrowsOutLineHorizontal',
      'ArrowsInLineHorizontal'
    ]
  },
  {
    title: 'Chevrons and carets',
    keys: [
      'ChevronUp',
      'ChevronDown',
      'ChevronLeft',
      'ChevronLeftLarge',
      'ChevronRight',
      'ChevronRightLarge',
      'ChevronDoubleRight',
      'ChevronUpSmall',
      'ChevronDownSmall',
      'ChevronRightSmall',
      'CaretUpFill',
      'CaretDownFill',
      'CaretRightFill'
    ]
  },
  {
    title: 'Create and edit',
    keys: [
      'Plus',
      'PlusCircle',
      'Minus',
      'Equals',
      'Cross',
      'Copy',
      'CopyPlus',
      'Clipboard',
      'PencilLine',
      'PencilFill',
      'PencilSquare',
      'NotePencil',
      'NotepadPencil',
      'Feather',
      'Scribble',
      'Eraser',
      'Trash',
      'Archive',
      'Download',
      'CloudDownload',
      'CloudUpload',
      'BoxArrowUp'
    ]
  },
  {
    title: 'Search, filter and settings',
    keys: ['Search', 'DatabaseSearch', 'Funnel', 'Crosshair', 'Sliders', 'SlidersHorizontal', 'Gear']
  },
  {
    title: 'Menus, handles and keys',
    keys: ['DotsHorizontal', 'DotsVertical', 'DotsSixVertical', 'GripVertical', 'Separator', 'Command', 'Option']
  },
  {
    title: 'Status and feedback',
    keys: [
      'Check',
      'CheckSmall',
      'CheckSingle',
      'CheckDouble',
      'CheckCircle',
      'CheckCircleFill',
      'CheckCircleSmallFill',
      'CheckSquare',
      'CrossCircle',
      'CrossCircleFill',
      'CrossCircleSmallFill',
      'QuestionCircle',
      'QuestionCircleSmallFill',
      'InfoCircle',
      'ExclamationCircle',
      'ExclamationSquareFill'
    ]
  },
  {
    title: 'Marks and reactions',
    keys: [
      'Star',
      'StarFill',
      'Bookmark',
      'BookmarkFill',
      'Bookmarks',
      'PushPin',
      'PushPinFill',
      'Tag',
      'Tags',
      'Sparkle',
      'Lightning',
      'Smiley',
      'SmileyPlus',
      'Bell',
      'BellSlash'
    ]
  },
  {
    title: 'Shapes and progress',
    keys: [
      'Circle',
      'CircleDot',
      'CircleGapDot',
      'CircleDashed',
      'CircleQuarters',
      'CircleHalfFill',
      'CirclesThree',
      'Ellipse',
      'Rectangle',
      'SquareFill',
      'Diamond',
      'LineSegment',
      'Steps'
    ]
  },
  {
    title: 'Text and code',
    keys: [
      'TextT',
      'TextAa',
      'TextAaSquare',
      'TextLines',
      'TextLinesSquare',
      'TextAlignLeft',
      'TextIndent',
      'TextOutdent',
      'BulletList',
      'ListCheck',
      'ListSquares',
      'At',
      'Hash',
      'Translate',
      'Code'
    ]
  },
  {
    title: 'Files and documents',
    keys: [
      'File',
      'Files',
      'FileArrowIn',
      'FilePlay',
      'OpenFile',
      'Document',
      'Folder',
      'FolderLine',
      'FolderOpenFill',
      'FolderTab',
      'NotebookArrows',
      'NotebookQuestion',
      'Books',
      'Receipt',
      'Image',
      'Paperclip',
      'Link'
    ]
  },
  {
    title: 'Messages and mail',
    keys: [
      'Bubble',
      'BubbleDots',
      'BubblePlus',
      'BubblePerson',
      'BubbleArrowRight',
      'Bubbles',
      'BubblesSquare',
      'Envelope',
      'EnvelopeFill',
      'Mailbox',
      'Tray',
      'PaperPlane',
      'PaperPlaneRight',
      'PhonePlus'
    ]
  },
  {
    title: 'People',
    keys: [
      'Person',
      'PersonCircle',
      'PersonPlus',
      'PersonCross',
      'PersonRefresh',
      'PersonSearch',
      'People',
      'PeopleFill',
      'PeopleGroup',
      'IdCard'
    ]
  },
  {
    title: 'Time and calendar',
    keys: ['Clock', 'ClockCounterClockwise', 'Calendar', 'CalendarX']
  },
  {
    title: 'Calls and media',
    keys: [
      'Mic',
      'MicOff',
      'Camera',
      'CameraOff',
      'ScreenShare',
      'ScreenShareStop',
      'Wifi',
      'PlayFill',
      'PauseFill',
      'DoorOpen',
      'DoorSlash',
      'DoorKnock'
    ]
  },
  {
    title: 'Layout and views',
    keys: [
      'Layout',
      'LayoutSplit',
      'PanelLeft',
      'PanelRight',
      'PanelRightLine',
      'PanelRightFill',
      'WindowText',
      'Windows',
      'Table',
      'TableCells',
      'Grid',
      'Kanban',
      'Layers',
      'LayersFill',
      'LayersStack',
      'LayersSlash'
    ]
  },
  {
    title: 'Structure and data',
    keys: [
      'Hierarchy',
      'TreeNodes',
      'Branch',
      'Network',
      'Path',
      'Graph',
      'ChartSquare',
      'Database',
      'HardDrive',
      'CloudTree',
      'Cube',
      'CubeArrowLeft',
      'CubeArrowRight'
    ]
  },
  {
    title: 'Security and access',
    keys: ['Lock', 'LockFill', 'LockOpen', 'LockOpenLine', 'Key', 'ShieldHalf', 'Eye', 'EyeSlash']
  },
  {
    title: 'Places and things',
    keys: [
      'House',
      'HouseFill',
      'Building',
      'MapPin',
      'Signpost',
      'Globe',
      'GlobeStand',
      'Briefcase',
      'BriefcasePlay',
      'GraduationCap',
      'Palette',
      'Sun'
    ]
  }
]
