import {
  type AccountUuid,
  PersonId,
  WorkspaceDataId,
  WorkspaceUuid,
  type AccountRole,
  type Timestamp,
  type SocialId as SocialIdBase,
  PersonUuid,
  type WorkspaceMode,
  Person,
  WorkspaceInfo,
  AccountInfo,
  IntegrationKind
} from '@hcengineering/core'

export interface LoginInfo {
  account: AccountUuid
  name?: string
  socialId?: PersonId
  token?: string
}

export interface EndpointInfo {
  internalUrl: string
  externalUrl: string
  region: string
}
export interface WorkspaceVersion {
  versionMajor: number
  versionMinor: number
  versionPatch: number
}

export interface LoginInfoWorkspace {
  url: string
  dataId?: WorkspaceDataId
  mode: WorkspaceMode
  version: WorkspaceVersion
  endpoint: EndpointInfo
  collaboratorEndpoint: EndpointInfo
  role: AccountRole | null
  progress?: number
  branding?: string
  passwordAgingRule?: number // in days
}

export interface LoginInfoWithWorkspaces extends LoginInfo {
  // Information necessary to handle user <--> transactor connectivity.
  workspaces: Record<WorkspaceUuid, LoginInfoWorkspace>
  socialIds: SocialId[]
}

export type LoginInfoByToken = LoginInfo | WorkspaceLoginInfo | LoginInfoRequest | null

/**
 * @public
 */
export interface WorkspaceLoginInfo extends LoginInfo {
  workspace: WorkspaceUuid // worspace uuid
  workspaceDataId?: WorkspaceDataId
  workspaceUrl: string
  endpoint: string
  collaboratorEndpoint?: string
  token: string
  role: AccountRole
  allowGuestSignUp?: boolean
}

export interface LoginInfoRequestData {
  firstName?: string
  lastName?: string
}

export type LoginInfoRequest = {
  request: true
} & LoginInfoRequestData

export interface WorkspaceInviteInfo {
  workspace: WorkspaceUuid
  email?: string
  name?: string
}

export interface OtpInfo {
  sent: boolean
  retryOn: Timestamp
}

export interface RegionInfo {
  region: string
  name: string
}

export type WorkspaceOperation = 'create' | 'upgrade' | 'all' | 'all+backup'

export interface MailboxOptions {
  availableDomains: string[]
  minNameLength: number
  maxNameLength: number
  maxMailboxCount: number
}

export interface MailboxInfo {
  mailbox: string
  aliases: string[]
  appPasswords: string[]
}

export interface MailboxSecret {
  mailbox: string
  app?: string
  secret: string
}

export interface Integration {
  socialId: PersonId
  kind: IntegrationKind // Integration kind. E.g. 'github', 'mail', 'telegram-bot', 'telegram' etc.
  workspaceUuid: WorkspaceUuid | null
  data?: Record<string, any>
  disabled?: boolean
}

export interface SocialId extends SocialIdBase {
  personUuid: PersonUuid
  isDeleted?: boolean
}

export type IntegrationKey = Omit<Integration, 'data'>

export interface IntegrationSecret {
  socialId: PersonId
  kind: IntegrationKind // Integration kind. E.g. 'github', 'mail', 'telegram-bot', 'telegram' etc.
  workspaceUuid: WorkspaceUuid | null
  key: string // Key for the secret in the integration. Different secrets for the same integration must have different keys. Can be any string. E.g. '', 'user_app_1' etc.
  secret: string
}

export type IntegrationSecretKey = Omit<IntegrationSecret, 'secret'>

export interface ProviderInfo {
  name: string
  displayName?: string
}

export interface AccountAggregatedInfo extends AccountInfo, Person {
  uuid: AccountUuid
  integrations: Omit<Integration, 'data'>[]
  socialIds: SocialId[]
  workspaces: Omit<WorkspaceInfo, 'allowReadOnlyGuest' | 'allowGuestSignUp'>[]
}

/**
 * User profile with additional information for public sharing
 * Stored in accounts database (global, not workspace-specific)
 */
export interface UserProfile {
  personUuid: PersonUuid
  bio?: string // LinkedIn-style bio (up to ~2000 chars)
  city?: string
  country?: string
  website?: string // Personal website URL
  socialLinks?: Record<string, string> // Flexible storage for social links
  isPublic: boolean // Public visibility toggle (default: false)
}

export type PersonWithProfile = Person & Omit<UserProfile, 'personUuid'>

/**
 * Subscription status enum
 * Reflects the subscription lifecycle from active to canceled/expired
 */
export enum SubscriptionStatus {
  Active = 'active', // Subscription is active and paid
  Trialing = 'trialing', // In trial period (free usage)
  PastDue = 'past_due', // Payment failed but subscription not yet canceled (grace period — full access)
  ReadOnly = 'readonly', // Grace period expired — read-only access, payment still due
  Canceled = 'canceled', // Subscription was canceled by user or admin
  Paused = 'paused', // Subscription is temporarily paused (some providers support this)
  Expired = 'expired' // Subscription or trial has expired
}

/**
 * Subscription type/purpose
 * Allows multiple active subscriptions per workspace for different purposes
 */
export enum SubscriptionType {
  Tier = 'tier', // Main workspace tier (free, starter, pro, enterprise)
  Support = 'support', // Voluntary support/donation subscription
  Package = 'package' // Additional package (storage, etc.)
}

/**
 * Workspace subscription information
 * Provider-agnostic subscription data managed by billing service
 * Multiple subscriptions can be active per workspace (tier + addons + support)
 * Historical subscriptions are preserved with status: canceled/expired
 */
export interface Subscription {
  id: string // Our internal unique subscription ID (UUID)
  workspaceUuid: WorkspaceUuid
  accountUuid: AccountUuid // Account that paid for the subscription

  // Provider details
  provider: string // Payment provider identifier (e.g. 'polar', 'stripe', 'manual')
  providerSubscriptionId: string // External subscription ID from the provider
  providerCheckoutId?: string // External checkout/session ID that created this subscription

  // Subscription classification
  type: SubscriptionType // What this subscription is for (tier, addon, support)
  status: SubscriptionStatus // Current status
  plan: string // Plan/product identifier (e.g. 'free', 'pro', 'storage-100gb', 'supporter')

  // Snapshot of plan limits at time of subscription creation
  // Used instead of plan config to ensure limits are stable over time
  limits?: {
    storageLimitGB: number
    trafficLimitGB: number
    meetingMinutesLimit: number
    tokenLimit: number
    usersLimit: number
    projectsLimit: number
    // Reserved space limits — kept in the baked snapshot for forward compatibility, not enforced yet.
    drivesLimit?: number
    teamspacesLimit?: number
  }

  // Free fallback limits (from the plan flagged free in config). Applied when the paid tier is unpaid:
  // the workspace runs on these instead of full read-only. Same shape as limits.
  freeLimits?: {
    storageLimitGB: number
    trafficLimitGB: number
    meetingMinutesLimit: number
    tokenLimit: number
    usersLimit: number
    projectsLimit: number
    drivesLimit?: number
    teamspacesLimit?: number
  }

  // Amount paid (in cents, e.g. 9999 = $99.99)
  // Used primarily for pay-what-you-want/donation subscriptions to track actual payment
  amount?: number

  // Billing period (optional - not set for free/manual plans)
  periodStart?: Timestamp
  periodEnd?: Timestamp

  // Trial information (optional)
  trialEnd?: Timestamp

  // Cancellation tracking (optional)
  canceledAt?: Timestamp

  // Provider-specific data stored as JSONB (optional)
  providerData?: Record<string, any>

  // Timestamps (managed by database)
  createdOn: Timestamp
  updatedOn: Timestamp
}

/**
 * Subscription data for creating/updating subscriptions (without timestamps)
 * Used by billing service to upsert subscription data
 */
export type SubscriptionData = Omit<Subscription, 'createdOn' | 'updatedOn'>

export interface AccountWorkspaceBadgeStatus {
  accountUuid: AccountUuid
  workspaceUuid: WorkspaceUuid
  hasUnread: boolean
  updatedOn: Timestamp
}

export type PaymentIntentStatus = 'pending' | 'charged' | 'failed'

/**
 * One claim per claimKey. The unique claimKey makes claiming atomic across pods/replicas/
 * rolling-updates. claimKey is 'renew:<subscriptionId>:<periodEnd>' (one charge per subscription
 * period) or 'checkout:<workspaceUuid>:<type>' (one pending checkout per workspace + plan type).
 */
export interface PaymentIntent {
  id: string
  claimKey: string
  provider: string
  status: PaymentIntentStatus
  paymentId?: string
  paymentUrl?: string
  amount?: number
  heartbeatAt?: number
  // context columns (nullable; which one is set depends on the claim kind):
  subscriptionId?: string
  workspaceUuid?: WorkspaceUuid
  orderFingerprint?: string // checkout: 'plan:seats:period', reuse URL only on an exact order match
  createdOn: number
  updatedOn: number
}

/**
 * Subscription with resolved owner email (used in admin panel)
 */
export interface SubscriptionInfo extends Subscription {
  payerEmail?: string
  payerName?: string
}
