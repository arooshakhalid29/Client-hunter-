export type AustralianState = 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'ACT' | 'TAS' | 'NT';

export type NicheCategory =
  | 'home_services'
  | 'beauty_personal_care'
  | 'dental_healthcare'
  | 'automotive'
  | 'appointment_other';

export interface NicheDefinition {
  id: string;
  name: string;
  category: NicheCategory;
  categoryLabel: string;
  searchKeywords: string[];
  osmTags: Array<{ key: string; value: string }>;
  automationAngles: string[];
  suggestedService: string;
}

export type LeadStatus =
  | 'New'
  | 'Needs Review'
  | 'Qualified'
  | 'Contacted'
  | 'Replied'
  | 'Converted'
  | 'Do not contact';

export type SocialPlatform =
  | 'instagram'
  | 'facebook'
  | 'linkedin'
  | 'tiktok'
  | 'youtube'
  | 'pinterest'
  | 'x';

export interface SocialProfile {
  platform: SocialPlatform;
  url: string;
  handle: string | null;
  status: 'verified' | 'possible_match' | 'unavailable' | 'inconclusive';
  confidence: 'High' | 'Medium' | 'Low';
  source: string;
  lastChecked: string;
}

export interface SourceRecord {
  sourceName: string;
  sourceUrl: string | null;
  discoveredAt: string;
  enrichedAt: string | null;
  status: 'verified' | 'enriched' | 'pending' | 'inconclusive' | 'failed';
  error?: string | null;
  fieldsProvided: string[];
}

export type FieldVerificationStatus = 'verified' | 'unverified' | 'missing' | 'review_required';

export interface FieldEvidence {
  field: string;
  value: any;
  sourceName: string;
  sourceUrl: string | null;
  confidence: 'High' | 'Medium' | 'Low';
  verifiedStatus: FieldVerificationStatus;
  timestamp: string;
}

export interface BusinessRecord {
  id: string;
  name: string;
  nicheId: string;
  nicheName: string;
  category: NicheCategory;
  websiteUrl: string | null;
  normalizedDomain: string | null;
  contactPageUrl: string | null;
  socialProfiles: SocialProfile[];
  address: string | null;
  suburb: string | null;
  city: string;
  state: AustralianState;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  emailStatus: 'official_website' | 'public_source' | 'syntax_valid' | 'domain_valid' | 'delivery_unconfirmed' | 'invalid' | 'unknown';
  bookingUrl: string | null;
  businessHours: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string;
  sourceUrl: string | null;
  sources: SourceRecord[];
  fieldEvidence: Record<string, FieldEvidence>;
  enrichmentStatus: 'pending' | 'enriched' | 'inconclusive' | 'partial';
  missingFields: string[];
  attemptedSources: string[];
  dataConfidence: 'High' | 'Medium' | 'Low / Manual Review';
  websiteStatus: 'verified' | 'accessible' | 'failed' | 'none';
  opportunityScore: number;
  scoreBand: 'High priority' | 'Medium priority' | 'Low priority';
  status: LeadStatus;
  notes: string | null;
  tags: string[];
  isSaved: boolean;
  isSuppressed: boolean;
  createdAt: string;
  updatedAt: string;
  lastAuditedAt: string | null;
}

export interface WebsiteAuditResult {
  id: string;
  businessId: string;
  url: string;
  httpStatus: number | null;
  isHttps: boolean;
  responseTimeMs: number;
  title: string | null;
  metaDescription: string | null;
  detectedBookingSystems: string[];
  hasPhoneProminence: boolean;
  hasAfterHoursOrEmergency: boolean;
  hasContactForm: boolean;
  contactPageUrl: string | null;
  detectedEmails: string[];
  detectedPhones: string[];
  detectedSocialProfiles: SocialProfile[];
  socialProfiles?: SocialProfile[];
  multiPractitionerSignals: string[];
  faqCount: number;
  auditEvidence: string[];
  success: boolean;
  errorMessage: string | null;
  auditedAt: string;
}

export interface OpportunityScoreResult {
  id: string;
  businessId: string;
  score: number;
  band: 'High priority' | 'Medium priority' | 'Low priority';
  confidence: 'High' | 'Medium' | 'Low / Manual Review';
  scoreBreakdown: {
    industryFit: number;
    appointmentCallFit: number;
    operationalComplexity: number;
    automationOpportunity: number;
    evidenceConfidence: number;
  };
  positiveSignals: string[];
  negativeSignals: string[];
  missingInformation: string[];
  suggestedService: string;
  suggestedAngle: string;
  conciseExplanation: string;
  scoredAt: string;
}

export interface OutreachDraft {
  id: string;
  businessId: string;
  channel: 'email' | 'call_script' | 'contact_form' | 'follow_up';
  subject: string;
  content: string;
  openingLine: string;
  callToAction: string;
  isApproved: boolean;
  approvedAt: string | null;
  sentAt: string | null;
  deliveryStatus: 'draft' | 'approved' | 'sent' | 'failed' | 'suppressed';
  providerMessageId: string | null;
  createdAt: string;
}

export interface DiscoveryDiagnostics {
  configuredProviders: string[];
  reachableProviders: string[];
  queriesExecuted: number;
  rawRecordsReturned: number;
  uniqueBusinessesRetained: number;
  officialWebsitesFound: number;
  leadsQualified: number;
  leadsExcluded: { reason: string; count: number }[];
  providerErrors: { provider: string; message: string; timestamp: string }[];
  executionTimeMs: number;
}
