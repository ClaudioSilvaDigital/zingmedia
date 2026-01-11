export interface Tenant {
  id: string;
  name: string;
  type: 'platform' | 'agency' | 'client';
  parentId?: string;
  brandConfig: BrandConfig;
  settings: TenantSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface BrandConfig {
  logo?: string;
  favicon?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  fontFamily: string;
  customDomain?: string;
  customCss?: string;
  companyName?: string;
  tagline?: string;
  footerText?: string;
  socialLinks?: {
    website?: string;
    linkedin?: string;
    twitter?: string;
    instagram?: string;
  };
}

export interface ThemeConfig {
  colors: {
    primary: string;
    secondary: string;
    accent?: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    warning: string;
    error: string;
  };
  typography: {
    fontFamily: string;
    fontSize: {
      xs: string;
      sm: string;
      base: string;
      lg: string;
      xl: string;
      '2xl': string;
      '3xl': string;
    };
    fontWeight: {
      normal: number;
      medium: number;
      semibold: number;
      bold: number;
    };
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
  };
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  variables: string[];
  tenantId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantSettings {
  maxUsers: number;
  maxClients: number;
  features: string[];
  billingPlan: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  tenantId: string;
  roles: Role[];
  permissions: Permission[];
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Role {
  id: string;
  name: string;
  permissions: Permission[];
  tenantId: string;
}

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  tenantId?: string;
}

export interface TenantContext {
  tenantId: string;
  tenant: Tenant;
  user: User;
  permissions: Permission[];
}

export interface DatabaseQuery {
  sql: string;
  params: unknown[];
}

export interface TenantConfig {
  name: string;
  type: 'platform' | 'agency' | 'client';
  parentId?: string;
  brandConfig: BrandConfig;
  settings: TenantSettings;
}

export type Resource = string;
export type Action = string;

// Briefing Management Types
export interface Briefing {
  id: string;
  title: string;
  type: 'internal' | 'external';
  templateId: string;
  fields: Record<string, any>;
  version: number;
  status: 'draft' | 'active' | 'archived';
  tenantId: string;
  clientId?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BriefingTemplate {
  id: string;
  name: string;
  description?: string;
  fields: BriefingField[];
  requiredFields: string[];
  tenantId: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BriefingField {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'multiselect' | 'date' | 'number' | 'boolean' | 'file';
  required: boolean;
  options?: string[];
  validation?: FieldValidation;
  placeholder?: string;
  helpText?: string;
  order: number;
}

export interface FieldValidation {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  allowedFileTypes?: string[];
  maxFileSize?: number;
}

export interface BriefingVersion {
  id: string;
  briefingId: string;
  version: number;
  fields: string; // JSON string
  changes: string; // JSON string  
  tenantId: string;
  createdBy: string;
  createdAt: Date;
}

export interface BriefingChange {
  field: string;
  oldValue: any;
  newValue: any;
  changeType: 'added' | 'modified' | 'removed';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

// Workflow Management Types
export enum WorkflowState {
  RESEARCH = 'research',
  PLANNING = 'planning',
  CONTENT = 'content',
  CREATIVE = 'creative',
  BRAND_APPLY = 'brand_apply',
  COMPLIANCE_CHECK = 'compliance_check',
  APPROVAL = 'approval',
  PUBLISH = 'publish',
  MONITOR = 'monitor'
}

export interface Workflow {
  id: string;
  contentId: string;
  currentState: WorkflowState;
  stateHistory: WorkflowEvent[];
  comments: Comment[];
  approvals: Approval[];
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowEvent {
  id: string;
  workflowId: string;
  fromState?: WorkflowState;
  toState: WorkflowState;
  userId: string;
  reason?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface Comment {
  id: string;
  workflowId: string;
  parentId?: string; // For threading
  userId: string;
  content: string;
  state: WorkflowState;
  isResolved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Approval {
  id: string;
  workflowId: string;
  requestedBy: string;
  approvers: string[];
  requiredApprovals: number;
  receivedApprovals: ApprovalResponse[];
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: Date;
  completedAt?: Date;
}

export interface ApprovalResponse {
  id: string;
  approvalId: string;
  userId: string;
  decision: 'approved' | 'rejected';
  comment?: string;
  createdAt: Date;
}

export interface Content {
  id: string;
  briefingId: string;
  title: string;
  description: string;
  contentType: 'text' | 'image' | 'video' | 'carousel';
  baseContent: ContentData;
  adaptedContent: Record<Platform, AdaptedContent>;
  workflowId: string;
  tenantId: string;
  clientId?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContentData {
  text?: string;
  mediaUrls?: string[];
  metadata?: Record<string, any>;
}

export interface AdaptedContent {
  text?: string;
  mediaUrls?: string[];
  metadata?: Record<string, any>;
  platformSpecific?: Record<string, any>;
}

export type Platform = 'instagram' | 'tiktok' | 'facebook' | 'linkedin';

export interface WorkflowTransition {
  from: WorkflowState;
  to: WorkflowState;
  requiredPermissions: string[];
  requiredApprovals?: number;
  validationRules?: ValidationRule[];
}

export interface ValidationRule {
  field: string;
  condition: string;
  message: string;
}

// AI Integration Types
export interface AIProvider {
  id: string;
  name: string;
  type: 'text' | 'image' | 'video' | 'avatar' | 'research';
  capabilities: AICapability[];
  config: ProviderConfig;
  isActive: boolean;
  healthStatus: HealthStatus;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AICapability {
  type: 'text_generation' | 'image_generation' | 'video_generation' | 'avatar_creation' | 'research';
  models: string[];
  maxTokens?: number;
  supportedFormats?: string[];
  rateLimits?: RateLimit;
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  version?: string;
  region?: string;
  additionalHeaders?: Record<string, string>;
  timeout?: number;
}

export interface HealthStatus {
  isHealthy: boolean;
  lastChecked: Date;
  responseTime?: number;
  errorMessage?: string;
  consecutiveFailures: number;
}

export interface RateLimit {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
}

export interface AIRequest {
  id: string;
  type: 'text' | 'image' | 'video' | 'avatar' | 'research';
  prompt: string;
  options: GenerationOptions;
  tenantId: string;
  userId: string;
  briefingId?: string;
  createdAt: Date;
}

export interface GenerationOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  format?: string;
  dimensions?: {
    width: number;
    height: number;
  };
  style?: string;
  quality?: 'standard' | 'high';
  metadata?: Record<string, any>;
}

export interface AIResponse {
  id: string;
  requestId: string;
  providerId: string;
  content: GeneratedContent;
  usage: UsageMetrics;
  status: 'success' | 'error' | 'partial';
  error?: string;
  processingTime: number;
  createdAt: Date;
}

export interface GeneratedContent {
  type: 'text' | 'image' | 'video' | 'avatar' | 'research';
  data: string | Buffer;
  metadata?: Record<string, any>;
  urls?: string[];
  format?: string;
}

export interface UsageMetrics {
  tokensUsed?: number;
  creditsConsumed: number;
  requestCount: number;
  processingTime: number;
  dataTransferred?: number;
}

// Video Script Generation Types
export interface VideoScript {
  id: string;
  briefingId: string;
  title: string;
  description?: string;
  templateId: string;
  sections: ScriptSection[];
  version: number;
  status: 'draft' | 'active' | 'approved' | 'archived';
  workflowId?: string;
  tenantId: string;
  clientId?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScriptSection {
  id: string;
  type: ScriptSectionType;
  title: string;
  content: string;
  duration?: number; // in seconds
  visualElements?: string[];
  audioElements?: string[];
  metadata?: Record<string, any>;
  order: number;
}

export enum ScriptSectionType {
  HOOK = 'hook',
  STORYTELLING = 'storytelling',
  TONE = 'tone',
  EMOTIONS = 'emotions',
  CTA = 'cta',
  INTRO = 'intro',
  MAIN_CONTENT = 'main_content',
  CONCLUSION = 'conclusion',
  TRANSITION = 'transition'
}

export interface ScriptTemplate {
  id: string;
  name: string;
  description?: string;
  contentType: string; // e.g., 'educational', 'promotional', 'entertainment'
  platform: Platform | 'universal';
  sections: ScriptTemplateSection[];
  duration: {
    min: number;
    max: number;
  };
  tenantId: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScriptTemplateSection {
  type: ScriptSectionType;
  title: string;
  description: string;
  isRequired: boolean;
  suggestedDuration?: number;
  prompts: string[];
  examples?: string[];
  order: number;
}

export interface ScriptVersion {
  id: string;
  scriptId: string;
  version: number;
  sections: string; // JSON string of ScriptSection[]
  changes: string; // JSON string of ScriptChange[]
  tenantId: string;
  createdBy: string;
  createdAt: Date;
}

export interface ScriptChange {
  sectionId: string;
  field: string;
  oldValue: any;
  newValue: any;
  changeType: 'added' | 'modified' | 'removed';
}

export interface ScriptGenerationRequest {
  briefingId: string;
  templateId: string;
  title: string;
  description?: string;
  targetPlatform: Platform;
  duration?: number;
  brandVoiceGuidelines?: string[];
  bestPractices?: string[];
  customPrompts?: Record<ScriptSectionType, string>;
}

export interface HealthCheck {
  providerId: string;
  isHealthy: boolean;
  responseTime: number;
  timestamp: Date;
  error?: string;
}

export interface ProviderCredentials {
  apiKey: string;
  secretKey?: string;
  additionalCredentials?: Record<string, string>;
}

export interface AIProviderInterface {
  id: string;
  name: string;
  capabilities: AICapability[];
  authenticate(credentials: ProviderCredentials): Promise<boolean>;
  generateContent(prompt: string, options: GenerationOptions): Promise<GeneratedContent>;
  checkHealth(): Promise<HealthCheck>;
  getUsage(tenantId: string, timeRange?: { start: Date; end: Date }): Promise<UsageMetrics>;
}

// Editorial Calendar Types
export interface CalendarEvent {
  id: string;
  contentId: string;
  title: string;
  description?: string;
  scheduledAt: Date;
  platform: Platform;
  status: 'scheduled' | 'published' | 'failed' | 'cancelled';
  tenantId: string;
  clientId?: string;
  createdBy: string;
  publishedAt?: Date;
  failureReason?: string;
  retryCount: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CalendarView {
  type: 'daily' | 'weekly' | 'monthly';
  startDate: Date;
  endDate: Date;
  events: CalendarEvent[];
}

export interface ScheduleRequest {
  contentId: string;
  scheduledAt: Date;
  platform: Platform;
  metadata?: Record<string, any>;
}

export interface ScheduleConflict {
  conflictType: 'time_slot' | 'platform_limit' | 'content_overlap';
  message: string;
  suggestedAlternatives?: Date[];
}

export interface OptimalPostingTime {
  platform: Platform;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
  hour: number; // 0-23
  score: number; // 0-100, higher is better
  reason: string;
}

export interface PlatformSchedulingRules {
  platform: Platform;
  maxPostsPerHour: number;
  maxPostsPerDay: number;
  minIntervalMinutes: number;
  optimalTimes: OptimalPostingTime[];
  blackoutPeriods?: {
    start: string; // HH:MM format
    end: string; // HH:MM format
    reason: string;
  }[];
}

export interface ReschedulingRule {
  id: string;
  name: string;
  condition: 'failure' | 'conflict' | 'manual';
  action: 'retry' | 'reschedule' | 'cancel';
  delayMinutes: number;
  maxRetries: number;
  tenantId: string;
  isActive: boolean;
}

export interface CalendarStats {
  totalScheduled: number;
  totalPublished: number;
  totalFailed: number;
  successRate: number;
  upcomingToday: number;
  upcomingWeek: number;
  platformBreakdown: Record<Platform, {
    scheduled: number;
    published: number;
    failed: number;
  }>;
}

// Analytics and Performance Tracking Types
export interface EngagementMetrics {
  likes: number;
  comments: number;
  shares: number;
  views: number;
  saves?: number;
  clicks?: number;
  impressions?: number;
  reach?: number;
  engagementRate: number;
  ctr?: number; // Click-through rate
}

export interface ContentPerformance {
  contentId: string;
  platform: Platform;
  platformPostId: string;
  publishedAt: Date;
  metrics: EngagementMetrics;
  score: number;
  brandAdherenceScore: number;
  lastUpdated: Date;
}

export interface PlatformMetrics {
  platform: Platform;
  totalPosts: number;
  totalEngagement: number;
  averageEngagementRate: number;
  topPerformingContent: ContentPerformance[];
  engagementTrends: MetricTrend[];
  optimalPostingTimes: OptimalPostingTime[];
}

export interface MetricTrend {
  date: Date;
  value: number;
  metric: string; // 'engagement', 'reach', 'impressions', etc.
  changePercent?: number;
}

export interface AnalyticsReport {
  tenantId: string;
  clientId?: string;
  period: {
    start: Date;
    end: Date;
  };
  overview: {
    totalPosts: number;
    totalEngagement: number;
    averageScore: number;
    averageBrandAdherence: number;
    topPlatform: Platform;
  };
  platformBreakdown: PlatformMetrics[];
  contentPerformance: ContentPerformance[];
  recommendations: PerformanceRecommendation[];
  trends: MetricTrend[];
  generatedAt: Date;
}

export interface PerformanceRecommendation {
  id: string;
  type: 'posting_time' | 'content_type' | 'platform_focus' | 'engagement_strategy' | 'brand_adherence';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  confidence: number; // 0-100
  data: Record<string, any>;
  actionable: boolean;
  createdAt: Date;
}

export interface ContentScore {
  contentId: string;
  overallScore: number;
  brandAdherenceScore: number;
  engagementScore: number;
  qualityScore: number;
  factors: ScoreFactor[];
  calculatedAt: Date;
}

export interface ScoreFactor {
  name: string;
  weight: number;
  score: number;
  description: string;
  impact: 'positive' | 'negative' | 'neutral';
}

export interface BrandAdherenceMetrics {
  contentId: string;
  voiceConsistency: number;
  visualConsistency: number;
  messageAlignment: number;
  bestPracticesFollowed: string[];
  violations: string[];
  overallScore: number;
  calculatedAt: Date;
}

export interface PerformanceHistory {
  contentId: string;
  platform: Platform;
  snapshots: PerformanceSnapshot[];
  trends: {
    engagement: MetricTrend[];
    reach: MetricTrend[];
    impressions: MetricTrend[];
  };
  milestones: PerformanceMilestone[];
}

export interface PerformanceSnapshot {
  timestamp: Date;
  metrics: EngagementMetrics;
  score: number;
  rankingPosition?: number;
}

export interface PerformanceMilestone {
  timestamp: Date;
  type: 'viral' | 'high_engagement' | 'trending' | 'milestone_reached';
  description: string;
  metrics: EngagementMetrics;
}

export interface AnalyticsQuery {
  tenantId: string;
  clientId?: string;
  platforms?: Platform[];
  contentTypes?: string[];
  dateRange: {
    start: Date;
    end: Date;
  };
  metrics?: string[];
  groupBy?: 'day' | 'week' | 'month' | 'platform' | 'content_type';
  limit?: number;
  offset?: number;
}

export interface MetricsCollectionJob {
  id: string;
  tenantId: string;
  platform: Platform;
  contentIds: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  lastRun?: Date;
  nextRun?: Date;
  errorMessage?: string;
  metricsCollected: number;
  createdAt: Date;
  updatedAt: Date;
}

// Billing and Financial Management Types
export interface BillingPlan {
  id: string;
  name: string;
  description: string;
  type: 'subscription' | 'pay_per_use' | 'hybrid';
  pricing: PlanPricing;
  limits: PlanLimits;
  features: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanPricing {
  monthlyPrice?: number;
  yearlyPrice?: number;
  creditPrice?: number; // Price per credit
  setupFee?: number;
  currency: string;
}

export interface PlanLimits {
  monthlyCredits: number;
  dailyCredits: number;
  maxUsers: number;
  maxClients: number;
  maxRequestsPerMinute: number;
  maxConcurrentRequests: number;
  storageLimit?: number; // in GB
}

export interface Subscription {
  id: string;
  tenantId: string;
  planId: string;
  status: 'active' | 'cancelled' | 'expired' | 'suspended' | 'trial';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEnd?: Date;
  cancelledAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreditBalance {
  tenantId: string;
  balance: number;
  monthlyUsage: number;
  dailyUsage: number;
  monthlyLimit: number;
  dailyLimit: number;
  lastResetDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingEntry {
  id: string;
  tenantId: string;
  providerId: string;
  requestId: string;
  creditsConsumed: number;
  breakdown: CreditBreakdown;
  rateInfo: CreditRate;
  createdAt: Date;
}

export interface CreditBreakdown {
  baseCredits: number;
  tokenCredits: number;
  qualityCredits: number;
  processingCredits: number;
}

export interface CreditRate {
  baseRate: number;
  perTokenRate: number;
  perSecondRate: number;
  qualityMultiplier: number;
}

export interface Invoice {
  id: string;
  tenantId: string;
  subscriptionId?: string;
  invoiceNumber: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  issueDate: Date;
  dueDate: Date;
  paidAt?: Date;
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
  lineItems: InvoiceLineItem[];
  taxDetails: TaxDetails;
  paymentMethod?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxRate: number;
  metadata?: Record<string, any>;
}

export interface TaxDetails {
  taxId?: string; // CNPJ for Brazil
  companyName?: string;
  address?: Address;
  taxRate: number;
  taxType: string; // 'ICMS', 'ISS', etc. for Brazil
  notaFiscalNumber?: string;
  notaFiscalSeries?: string;
}

export interface Address {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface PaymentMethod {
  id: string;
  tenantId: string;
  type: 'credit_card' | 'bank_transfer' | 'pix' | 'boleto';
  isDefault: boolean;
  metadata: Record<string, any>; // Encrypted payment details
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingHistory {
  id: string;
  tenantId: string;
  period: {
    start: Date;
    end: Date;
  };
  totalCreditsUsed: number;
  totalAmount: number;
  invoiceId?: string;
  status: 'pending' | 'billed' | 'paid';
  breakdown: UsageBreakdown[];
  createdAt: Date;
}

export interface UsageBreakdown {
  providerId: string;
  providerName: string;
  requestType: string;
  totalRequests: number;
  totalCredits: number;
  totalAmount: number;
}

export interface NotaFiscal {
  id: string;
  invoiceId: string;
  tenantId: string;
  number: string;
  series: string;
  accessKey: string;
  status: 'pending' | 'authorized' | 'cancelled' | 'rejected';
  issueDate: Date;
  xmlContent: string;
  pdfUrl?: string;
  xmlUrl?: string;
  fiscalProviderId: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface FiscalProvider {
  id: string;
  name: string;
  type: 'nfse' | 'nfe' | 'nfce';
  config: FiscalProviderConfig;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FiscalProviderConfig {
  apiUrl: string;
  apiKey: string;
  certificatePath?: string;
  certificatePassword?: string;
  environment: 'sandbox' | 'production';
  additionalConfig?: Record<string, any>;
}

export interface BillingAlert {
  id: string;
  tenantId: string;
  type: 'credit_low' | 'limit_exceeded' | 'payment_failed' | 'invoice_overdue';
  threshold?: number;
  isActive: boolean;
  lastTriggered?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageTrackingResult {
  success: boolean;
  creditsConsumed: number;
  remainingCredits: number;
  error?: string;
  billingDetails?: CreditConsumption;
}

export interface CreditConsumption {
  credits: number;
  breakdown: CreditBreakdown;
  rate: CreditRate;
  metadata: {
    requestId: string;
    providerId: string;
    requestType: string;
    processingTime: number;
    timestamp: Date;
  };
}

export interface CreditLimitCheck {
  allowed: boolean;
  availableCredits: number;
  monthlyUsed: number;
  dailyUsed: number;
  planLimits: PlanLimits;
  checks: {
    balance: boolean;
    monthly: boolean;
    daily: boolean;
  };
}

export interface UsageSummary {
  tenantId: string;
  timeRange: { start: Date; end: Date };
  totalCredits: number;
  totalRequests: number;
  averageCreditsPerRequest: number;
  providerBreakdown: {
    providerId: string;
    credits: number;
    requests: number;
  }[];
}