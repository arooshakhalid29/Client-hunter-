import React, { useState, useEffect } from 'react';
import { 
  X, 
  Building2, 
  MapPin, 
  Globe, 
  Phone, 
  Mail, 
  Clock, 
  Sparkles, 
  ExternalLink, 
  RefreshCw, 
  Send, 
  CheckCircle2, 
  AlertTriangle, 
  HelpCircle,
  FileText,
  Activity,
  Calendar,
  Lock,
  Share2,
  Check,
  AlertCircle,
  Database,
  Layers,
  History,
  Info,
  Target
} from 'lucide-react';
import { 
  BusinessRecord, 
  LeadStatus, 
  OpportunityScoreResult, 
  WebsiteAuditResult, 
  SocialPlatform,
  SourceRecord,
  FieldEvidence 
} from '../types.js';

interface LeadDetailsModalProps {
  businessId: string;
  onClose: () => void;
  onOpenOutreach: (lead: BusinessRecord) => void;
  onUpdateLead: (updated: BusinessRecord) => void;
}

const ALL_STATUSES: LeadStatus[] = [
  'New',
  'Needs Review',
  'Qualified',
  'Contacted',
  'Replied',
  'Converted',
  'Do not contact',
];

const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  pinterest: 'Pinterest',
  x: 'X (Twitter)',
};

export const LeadDetailsModal: React.FC<LeadDetailsModalProps> = ({
  businessId,
  onClose,
  onOpenOutreach,
  onUpdateLead,
}) => {
  const [data, setData] = useState<{
    business: BusinessRecord;
    score: OpportunityScoreResult | null;
    audit: WebsiteAuditResult | null;
    contacts: any[];
    statusHistory: any[];
  } | null>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'sources' | 'score' | 'history'>('overview');
  const [loading, setLoading] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [enrichMessage, setEnrichMessage] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<LeadStatus>('New');
  const [savingNotes, setSavingNotes] = useState(false);

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${businessId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setNotes(json.business.notes || '');
        setStatus(json.business.status);
      }
    } catch (err) {
      console.error('Failed to load lead details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [businessId]);

  const handleStatusChange = async (newStatus: LeadStatus) => {
    setStatus(newStatus);
    try {
      const res = await fetch(`/api/leads/${businessId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdateLead(updated);
        fetchDetails();
      }
    } catch (err) {
      console.error('Status update failed:', err);
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/leads/${businessId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdateLead(updated);
      }
    } catch (err) {
      console.error('Notes save failed:', err);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleRetryEnrichment = async () => {
    setEnriching(true);
    setEnrichMessage(null);
    try {
      const res = await fetch(`/api/leads/${businessId}/enrich`, { method: 'POST' });
      const json = await res.json();
      if (res.ok) {
        setEnrichMessage(json.message || 'Enrichment complete.');
        if (json.business) {
          onUpdateLead(json.business);
        }
        await fetchDetails();
      } else {
        setEnrichMessage(json.error || 'Enrichment check finished with notes.');
      }
    } catch (err: any) {
      setEnrichMessage(err.message || 'Enrichment retry failed.');
    } finally {
      setEnriching(false);
    }
  };

  const [enrichingHunter, setEnrichingHunter] = useState(false);

  const handleHunterEnrich = async () => {
    setEnrichingHunter(true);
    setEnrichMessage(null);
    try {
      const res = await fetch(`/api/hunter/enrich-lead/${businessId}`, { method: 'POST' });
      const json = await res.json();
      if (res.ok && json.success) {
        setEnrichMessage(json.message || 'Found verified emails via Hunter.io.');
        if (json.business) {
          onUpdateLead(json.business);
        }
        await fetchDetails();
      } else {
        setEnrichMessage(json.message || json.error || 'No additional emails found on Hunter.io for this domain.');
      }
    } catch (err: any) {
      setEnrichMessage(err.message || 'Hunter enrichment failed.');
    } finally {
      setEnrichingHunter(false);
    }
  };

  const handleToggleSuppression = async () => {
    if (!data) return;
    const nextSuppressed = !data.business.isSuppressed;
    try {
      const res = await fetch(`/api/leads/${businessId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isSuppressed: nextSuppressed,
          status: nextSuppressed ? 'Do not contact' : 'New',
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        onUpdateLead(updated);
        fetchDetails();
      }
    } catch (err) {
      console.error('Suppression update failed:', err);
    }
  };

  if (loading && !data) {
    return (
      <div className="fixed inset-0 z-50 bg-[#252525]/40 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-2xl border border-[#E7E7E2] shadow-xl flex flex-col items-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-[#78B9E8]" />
          <p className="text-xs text-[#555555]">Loading prospect file...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { business, score, audit, statusHistory } = data;
  const socialProfiles = business.socialProfiles || [];
  const sources: SourceRecord[] = business.sources || [];
  const evidence: Record<string, FieldEvidence> = business.fieldEvidence || {};
  const missingFields = business.missingFields || [];
  const attemptedSources = business.attemptedSources || [];

  return (
    <div className="fixed inset-0 z-50 bg-[#252525]/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-2xl border border-[#E7E7E2] shadow-xl overflow-hidden flex flex-col max-h-[92vh] animate-fadeIn">
        {/* Header Bar */}
        <div className="p-5 border-b border-[#E7E7E2] bg-[#F7F7F4] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#78B9E8] text-white flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-[#252525]">{business.name}</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-white text-[#444444] border border-[#E7E7E2]">
                  {business.nicheName}
                </span>
                {business.isSuppressed && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#FDE8E8] text-[#9B1C1C] border border-[#F8B4B4]">
                    Do Not Contact
                  </span>
                )}
                {business.enrichmentStatus === 'enriched' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#EAF7EE] text-[#1D7A41] border border-[#C6ECD2]">
                    Enriched
                  </span>
                )}
                {business.enrichmentStatus === 'pending' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                    Enrichment Pending
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-[#777777] mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-[#999999]" />
                <span>
                  {business.address || `${business.suburb || ''} ${business.city} ${business.state}`}
                </span>
                <span className="text-[#CCCCCC]">•</span>
                <span className="text-[#888888]">{business.source}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpenOutreach(business)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#78B9E8] text-white hover:bg-[#68A9D8] transition-colors shadow-2xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Draft Outreach</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#777777] hover:text-[#252525] hover:bg-[#EFEFEA] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation Bar */}
        <div className="px-6 pt-3 border-b border-[#E7E7E2] bg-white flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs font-medium text-[#666666]">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'overview'
                  ? 'border-[#78B9E8] text-[#252525] font-semibold'
                  : 'border-transparent hover:text-[#252525]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-[#78B9E8]" />
              <span>Overview & Contacts</span>
            </button>

            <button
              onClick={() => setActiveTab('sources')}
              className={`px-3 py-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'sources'
                  ? 'border-[#78B9E8] text-[#252525] font-semibold'
                  : 'border-transparent hover:text-[#252525]'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-[#78B9E8]" />
              <span>Sources & Provenance ({sources.length || 1})</span>
              {missingFields.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-amber-100 text-amber-800">
                  {missingFields.length} missing
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('score')}
              className={`px-3 py-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'score'
                  ? 'border-[#78B9E8] text-[#252525] font-semibold'
                  : 'border-transparent hover:text-[#252525]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#78B9E8]" />
              <span>Automation Score ({business.opportunityScore}/100)</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-2 border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'border-[#78B9E8] text-[#252525] font-semibold'
                  : 'border-transparent hover:text-[#252525]'
              }`}
            >
              <History className="w-3.5 h-3.5 text-[#78B9E8]" />
              <span>Pipeline & Notes</span>
            </button>
          </div>

          <div className="flex items-center gap-2 pb-2">
            <button
              type="button"
              onClick={handleHunterEnrich}
              disabled={enrichingHunter || enriching}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#FFF3E0] text-[#E65100] border border-[#FFE0B2] hover:bg-[#FFE0B2] transition-colors disabled:opacity-50"
              title="Search Hunter.io for verified decision-makers and emails for this domain"
            >
              <Target className={`w-3.5 h-3.5 ${enrichingHunter ? 'animate-spin' : ''}`} />
              <span>{enrichingHunter ? 'Searching Hunter...' : 'Hunter.io Emails'}</span>
            </button>

            <button
              type="button"
              onClick={handleRetryEnrichment}
              disabled={enriching || enrichingHunter}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#F7F7F4] text-[#2B6CB0] border border-[#CDE5F7] hover:bg-[#EBF5FB] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${enriching ? 'animate-spin text-[#78B9E8]' : ''}`} />
              <span>{enriching ? 'Enriching...' : 'Enrich Lead'}</span>
            </button>
          </div>
        </div>

        {/* Enrichment Status Notification */}
        {enrichMessage && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-[#EBF5FB] border border-[#CDE5F7] text-xs text-[#1E5F8A] flex items-center justify-between">
            <span>{enrichMessage}</span>
            <button onClick={() => setEnrichMessage(null)} className="text-[#1E5F8A] hover:underline font-semibold">
              Dismiss
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-[#252525]">
          {/* TAB 1: OVERVIEW & CONTACTS */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Alert if lead has zero contact info yet */}
              {!business.phone && !business.email && !business.websiteUrl && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">No direct contact channels recorded yet</p>
                    <p className="text-amber-800">
                      This lead was safely preserved from public discovery. Missing contact details will never cause valid Australian businesses to be discarded.
                      Click <strong>"Enrich Lead"</strong> above to discover its official website, verified phone, or directory citations.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: Contact Channels */}
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-[#E7E7E2] bg-white space-y-3">
                    <h3 className="text-xs font-semibold text-[#555555] uppercase tracking-wider">
                      Discovered Contact Channels
                    </h3>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between py-1.5 border-b border-[#F0F0EB]">
                        <span className="text-[#777777] flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-[#78B9E8]" /> Phone Number
                        </span>
                        {business.phone ? (
                          <span className="font-mono text-[#252525] font-medium">{business.phone}</span>
                        ) : (
                          <span className="text-[#AAAAAA] italic">Not discovered yet</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between py-1.5 border-b border-[#F0F0EB]">
                        <span className="text-[#777777] flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-[#78B9E8]" /> Public Email
                        </span>
                        {business.email ? (
                          <span className="font-mono text-[#252525] truncate max-w-[200px]">{business.email}</span>
                        ) : (
                          <span className="text-[#AAAAAA] italic">Not discovered yet</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between py-1.5 border-b border-[#F0F0EB]">
                        <span className="text-[#777777] flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-[#78B9E8]" /> Official Website
                        </span>
                        {business.websiteUrl ? (
                          <a
                            href={business.websiteUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#2B6CB0] hover:underline truncate max-w-[200px] flex items-center gap-1"
                          >
                            <span>{business.websiteUrl}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-[#AAAAAA] italic">None registered</span>
                        )}
                      </div>

                      {business.contactPageUrl && (
                        <div className="flex items-center justify-between py-1.5 border-b border-[#F0F0EB]">
                          <span className="text-[#777777] flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-emerald-600" /> Contact Page
                          </span>
                          <a
                            href={business.contactPageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-700 hover:underline truncate max-w-[200px] flex items-center gap-1"
                          >
                            <span>{business.contactPageUrl}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        </div>
                      )}

                      {business.bookingUrl && (
                        <div className="flex items-center justify-between py-1.5 border-b border-[#F0F0EB]">
                          <span className="text-[#777777] flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-blue-600" /> Booking System
                          </span>
                          <a
                            href={business.bookingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-700 hover:underline truncate max-w-[200px] flex items-center gap-1"
                          >
                            <span>{business.bookingUrl}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        </div>
                      )}

                      {business.businessHours && (
                        <div className="flex items-center justify-between py-1.5 border-b border-[#F0F0EB]">
                          <span className="text-[#777777] flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-[#777777]" /> Opening Hours
                          </span>
                          <span className="text-[#444444] text-[11px] truncate max-w-[200px]">
                            {business.businessHours}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Social Profiles Summary */}
                  <div className="p-4 rounded-xl border border-[#E7E7E2] bg-white space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-[#555555] uppercase tracking-wider flex items-center gap-1.5">
                        <Share2 className="w-3.5 h-3.5 text-[#78B9E8]" />
                        Official Social Media Profiles ({socialProfiles.filter((s) => s.status === 'verified').length})
                      </h3>
                      <button
                        onClick={() => setActiveTab('sources')}
                        className="text-[11px] text-[#2B6CB0] hover:underline"
                      >
                        View Provenance
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {socialProfiles.map((s) => (
                        <div
                          key={s.platform}
                          className="p-2 rounded-lg border border-[#E7E7E2] bg-[#FAF9F5] text-xs flex items-center justify-between"
                        >
                          <span className="font-medium text-[#333333] capitalize">{s.platform}</span>
                          {s.status === 'verified' && s.url ? (
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#2B6CB0] hover:underline font-mono text-[10px] flex items-center gap-1"
                            >
                              <span>{s.handle || 'View'}</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <span className="text-[10px] text-[#999999] italic">None</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right: Quick Opportunity Preview & Primary Source */}
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-[#E7E7E2] bg-white space-y-3">
                    <div className="flex items-center justify-between border-b border-[#F0F0EB] pb-3">
                      <div>
                        <h3 className="text-xs font-semibold text-[#555555] uppercase tracking-wider">
                          Automation Opportunity
                        </h3>
                        <p className="text-[11px] text-[#777777] mt-0.5">{score?.suggestedService || 'AI Voice Agent & Call Recovery'}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-bold text-[#252525]">{business.opportunityScore}</span>
                        <span className="text-xs text-[#777777]">/100</span>
                        <div className="text-[10px] text-emerald-700 font-medium">{business.scoreBand}</div>
                      </div>
                    </div>

                    {score?.conciseExplanation && (
                      <div className="p-3 rounded-lg bg-[#F7F7F4] border border-[#E7E7E2] text-xs text-[#444444]">
                        <p className="font-semibold text-[#252525] mb-0.5">Automation Rationale:</p>
                        <p>{score.conciseExplanation}</p>
                      </div>
                    )}

                    <div className="pt-2">
                      <button
                        onClick={() => setActiveTab('score')}
                        className="w-full py-1.5 rounded-lg border border-[#E7E7E2] hover:bg-[#F7F7F4] text-xs font-medium text-[#252525] transition-colors"
                      >
                        Inspect 5-Dimension Score Breakdown →
                      </button>
                    </div>
                  </div>

                  {/* Primary Discovery Attribution */}
                  <div className="p-4 rounded-xl border border-[#E7E7E2] bg-white space-y-2">
                    <h3 className="text-xs font-semibold text-[#555555] uppercase tracking-wider">
                      Discovery Attribution
                    </h3>
                    <div className="text-xs space-y-1 text-[#555555]">
                      <div>Source: <span className="font-semibold text-[#252525]">{business.source}</span></div>
                      {business.sourceUrl && (
                        <div className="flex items-center gap-1">
                          <span>Listing:</span>
                          <a
                            href={business.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#2B6CB0] hover:underline font-mono text-[11px] truncate max-w-[240px] inline-flex items-center gap-0.5"
                          >
                            <span>{business.sourceUrl}</span>
                            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                          </a>
                        </div>
                      )}
                      <div>Discovery Time: <span className="font-mono text-[11px] text-[#777777]">{new Date(business.createdAt).toLocaleString()}</span></div>
                      <div>Confidence: <span className="font-medium text-[#252525]">{business.dataConfidence}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SOURCES & PROVENANCE */}
          {activeTab === 'sources' && (
            <div className="space-y-6">
              {/* Top Summary Banner */}
              <div className="p-4 rounded-xl bg-[#F7F7F4] border border-[#E7E7E2] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#252525] flex items-center gap-2">
                    <Database className="w-4 h-4 text-[#78B9E8]" />
                    Multi-Source Discovery & Provenance Tracking
                  </h3>
                  <p className="text-xs text-[#666666] mt-0.5">
                    Discovered across {sources.length || 1} independent authorized sources with field-by-field verification.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRetryEnrichment}
                  disabled={enriching}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white text-[#2B6CB0] border border-[#CDE5F7] hover:bg-[#EBF5FB] transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${enriching ? 'animate-spin' : ''}`} />
                  <span>Enrich All Channels</span>
                </button>
              </div>

              {/* 1. All Discovery & Enrichment Sources */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-[#555555] uppercase tracking-wider">
                  Discovery & Enrichment Sources ({sources.length || 1})
                </h4>

                <div className="space-y-2">
                  {sources.map((src, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-[#E7E7E2] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#252525]">{src.sourceName}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#EAF7EE] text-[#1D7A41] border border-[#C6ECD2]">
                            {src.status}
                          </span>
                        </div>
                        {src.sourceUrl ? (
                          <div className="flex items-center gap-1 text-[#2B6CB0]">
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <a
                              href={src.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-mono text-[11px] hover:underline truncate max-w-[400px]"
                            >
                              {src.sourceUrl}
                            </a>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#888888] italic">Direct API search query without persistent public permalink</span>
                        )}
                        <div className="text-[11px] text-[#777777]">
                          Fields supplied: <span className="font-medium text-[#444444]">{src.fieldsProvided?.join(', ') || 'name, location'}</span>
                        </div>
                      </div>

                      <div className="text-right text-[11px] text-[#888888] shrink-0 font-mono">
                        <div>Discovered: {new Date(src.discoveredAt).toLocaleDateString()}</div>
                        {src.enrichedAt && <div>Enriched: {new Date(src.enrichedAt).toLocaleTimeString()}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Field-by-Field Evidence Matrix */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-[#555555] uppercase tracking-wider">
                  Field-Level Verification & Evidence Matrix
                </h4>

                <div className="border border-[#E7E7E2] rounded-xl overflow-hidden bg-white text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-[#FAF9F5] border-b border-[#E7E7E2] text-[11px] font-semibold text-[#555555] uppercase">
                      <tr>
                        <th className="py-2.5 px-3">Field</th>
                        <th className="py-2.5 px-3">Discovered Value</th>
                        <th className="py-2.5 px-3">Source Attribution</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0F0EB]">
                      {/* Name */}
                      <tr>
                        <td className="py-2 px-3 font-medium text-[#555555]">Business Name</td>
                        <td className="py-2 px-3 font-semibold text-[#252525]">{business.name}</td>
                        <td className="py-2 px-3 text-[#555555]">
                          {evidence.name?.sourceUrl ? (
                            <a href={evidence.name.sourceUrl} target="_blank" rel="noreferrer" className="text-[#2B6CB0] hover:underline flex items-center gap-1">
                              <span>{evidence.name.sourceName}</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            evidence.name?.sourceName || business.source
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#EAF7EE] text-[#1D7A41]">Verified</span>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px]">High</td>
                      </tr>

                      {/* Address */}
                      <tr>
                        <td className="py-2 px-3 font-medium text-[#555555]">Street Address</td>
                        <td className="py-2 px-3 text-[#252525]">
                          {business.address || `${business.city} ${business.state}`}
                        </td>
                        <td className="py-2 px-3 text-[#555555]">
                          {evidence.address?.sourceName || business.source}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            business.address ? 'bg-[#EAF7EE] text-[#1D7A41]' : 'bg-[#FEF3C7] text-[#92400E]'
                          }`}>
                            {business.address ? 'Verified' : 'Locality Only'}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px]">{business.address ? 'High' : 'Medium'}</td>
                      </tr>

                      {/* Phone */}
                      <tr>
                        <td className="py-2 px-3 font-medium text-[#555555]">Phone Number</td>
                        <td className="py-2 px-3 font-mono text-[#252525]">
                          {business.phone || <span className="text-[#AAAAAA] italic">None found</span>}
                        </td>
                        <td className="py-2 px-3 text-[#555555]">
                          {evidence.phone?.sourceUrl ? (
                            <a href={evidence.phone.sourceUrl} target="_blank" rel="noreferrer" className="text-[#2B6CB0] hover:underline flex items-center gap-1">
                              <span>{evidence.phone.sourceName}</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            evidence.phone?.sourceName || (business.phone ? business.source : 'None')
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            business.phone ? 'bg-[#EAF7EE] text-[#1D7A41]' : 'bg-red-50 text-red-700'
                          }`}>
                            {business.phone ? 'Verified' : 'Missing'}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px]">{business.phone ? 'High' : 'Low'}</td>
                      </tr>

                      {/* Email */}
                      <tr>
                        <td className="py-2 px-3 font-medium text-[#555555]">Public Email</td>
                        <td className="py-2 px-3 font-mono text-[#252525]">
                          {business.email || <span className="text-[#AAAAAA] italic">None found</span>}
                        </td>
                        <td className="py-2 px-3 text-[#555555]">
                          {evidence.email?.sourceUrl ? (
                            <a href={evidence.email.sourceUrl} target="_blank" rel="noreferrer" className="text-[#2B6CB0] hover:underline flex items-center gap-1">
                              <span>{evidence.email.sourceName}</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            evidence.email?.sourceName || (business.email ? business.emailStatus : 'None')
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            business.email ? 'bg-[#EAF7EE] text-[#1D7A41]' : 'bg-red-50 text-red-700'
                          }`}>
                            {business.email ? 'Verified' : 'Missing'}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px]">{business.email ? 'High' : 'Low'}</td>
                      </tr>

                      {/* Website */}
                      <tr>
                        <td className="py-2 px-3 font-medium text-[#555555]">Website</td>
                        <td className="py-2 px-3 text-[#252525]">
                          {business.websiteUrl ? (
                            <a href={business.websiteUrl} target="_blank" rel="noreferrer" className="text-[#2B6CB0] hover:underline flex items-center gap-1 truncate max-w-[200px]">
                              <span>{business.websiteUrl}</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <span className="text-[#AAAAAA] italic">None registered</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-[#555555]">
                          {evidence.website?.sourceName || (business.websiteUrl ? business.source : 'None')}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            business.websiteUrl ? 'bg-[#EAF7EE] text-[#1D7A41]' : 'bg-red-50 text-red-700'
                          }`}>
                            {business.websiteUrl ? 'Verified' : 'Missing'}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px]">{business.websiteUrl ? 'High' : 'Low'}</td>
                      </tr>

                      {/* Booking Widget */}
                      <tr>
                        <td className="py-2 px-3 font-medium text-[#555555]">Booking System</td>
                        <td className="py-2 px-3 text-[#252525]">
                          {business.bookingUrl ? (
                            <a href={business.bookingUrl} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline flex items-center gap-1 truncate max-w-[200px]">
                              <span>{business.bookingUrl}</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          ) : (
                            <span className="text-[#AAAAAA] italic">None detected</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-[#555555]">
                          {evidence.bookingUrl?.sourceName || (business.bookingUrl ? 'Website Auditor' : 'None')}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            business.bookingUrl ? 'bg-[#EAF7EE] text-[#1D7A41]' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {business.bookingUrl ? 'Verified' : 'Unverified'}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-[11px]">{business.bookingUrl ? 'High' : 'Low'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3. Missing Fields & Next Steps Alert */}
              {missingFields.length > 0 && (
                <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-700" />
                    <span>Missing Fields: {missingFields.join(', ')}</span>
                  </div>
                  <p className="text-amber-800">
                    Nexamor ClientHunter AI prioritizes genuine lead preservation. Missing contact fields do not discard this record.
                    You can retry enrichment across web indexes or manually enter verified contact details.
                  </p>
                </div>
              )}

              {/* 4. Attempted Discovery Sources */}
              {attemptedSources.length > 0 && (
                <div className="text-xs text-[#777777] flex items-center gap-2">
                  <span className="font-medium text-[#555555]">Attempted discovery sources:</span>
                  <span className="font-mono">{attemptedSources.join(' • ')}</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AI AUTOMATION SCORE */}
          {activeTab === 'score' && (
            <div className="space-y-6">
              <div className="p-5 rounded-xl border border-[#E7E7E2] bg-white space-y-4">
                <div className="flex items-center justify-between border-b border-[#F0F0EB] pb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[#252525]">
                      Opportunity Score: {business.opportunityScore}/100
                    </h3>
                    <p className="text-xs text-[#777777] mt-0.5">Priority Band: {business.scoreBand} • Confidence: {business.dataConfidence}</p>
                  </div>
                  <div className="text-right">
                    <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#EBF5FB] text-[#2B6CB0] border border-[#CDE5F7]">
                      {score?.suggestedService || 'AI Automation'}
                    </span>
                  </div>
                </div>

                {score?.scoreBreakdown && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
                    <div className="p-3 rounded-lg bg-[#FAF9F5] border border-[#E7E7E2]">
                      <div className="flex justify-between font-medium text-[#444444] mb-1.5">
                        <span>Industry Call & Booking Fit</span>
                        <span className="font-mono">{score.scoreBreakdown.industryFit}/25</span>
                      </div>
                      <div className="w-full h-2 bg-[#EFEFEA] rounded-full overflow-hidden">
                        <div className="h-full bg-[#78B9E8]" style={{ width: `${(score.scoreBreakdown.industryFit / 25) * 100}%` }} />
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-[#FAF9F5] border border-[#E7E7E2]">
                      <div className="flex justify-between font-medium text-[#444444] mb-1.5">
                        <span>Appointment & Phone Reliance</span>
                        <span className="font-mono">{score.scoreBreakdown.appointmentCallFit}/25</span>
                      </div>
                      <div className="w-full h-2 bg-[#EFEFEA] rounded-full overflow-hidden">
                        <div className="h-full bg-[#78B9E8]" style={{ width: `${(score.scoreBreakdown.appointmentCallFit / 25) * 100}%` }} />
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-[#FAF9F5] border border-[#E7E7E2]">
                      <div className="flex justify-between font-medium text-[#444444] mb-1.5">
                        <span>Operational Complexity</span>
                        <span className="font-mono">{score.scoreBreakdown.operationalComplexity}/20</span>
                      </div>
                      <div className="w-full h-2 bg-[#EFEFEA] rounded-full overflow-hidden">
                        <div className="h-full bg-[#78B9E8]" style={{ width: `${(score.scoreBreakdown.operationalComplexity / 20) * 100}%` }} />
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-[#FAF9F5] border border-[#E7E7E2]">
                      <div className="flex justify-between font-medium text-[#444444] mb-1.5">
                        <span>Automation Opportunity</span>
                        <span className="font-mono">{score.scoreBreakdown.automationOpportunity}/15</span>
                      </div>
                      <div className="w-full h-2 bg-[#EFEFEA] rounded-full overflow-hidden">
                        <div className="h-full bg-[#78B9E8]" style={{ width: `${(score.scoreBreakdown.automationOpportunity / 15) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                )}

                {score?.positiveSignals && score.positiveSignals.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <p className="text-[11px] font-semibold text-[#555555] uppercase tracking-wider">Observed Automation Signals</p>
                    <div className="space-y-1">
                      {score.positiveSignals.map((sig, i) => (
                        <div key={i} className="text-xs text-[#333333] flex items-start gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{sig}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: PIPELINE & HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-6">
              {/* Top Control Bar: Status, Suppression */}
              <div className="p-4 rounded-xl bg-[#F7F7F4] border border-[#E7E7E2] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-[#555555]">Pipeline Stage:</span>
                  <select
                    value={status}
                    onChange={(e) => handleStatusChange(e.target.value as LeadStatus)}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-[#E7E7E2] text-xs font-medium text-[#252525] focus:ring-1 focus:ring-[#78B9E8]"
                  >
                    {ALL_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleSuppression}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      business.isSuppressed
                        ? 'bg-[#FDE8E8] text-[#9B1C1C] border-[#F8B4B4] hover:bg-[#FBD5D5]'
                        : 'bg-white text-[#666666] border-[#E7E7E2] hover:bg-[#EFEFEA]'
                    }`}
                  >
                    {business.isSuppressed ? 'Suppressed (DNC)' : 'Mark DNC'}
                  </button>
                </div>
              </div>

              {/* Notes Section */}
              <div className="p-4 rounded-xl border border-[#E7E7E2] bg-white space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-[#555555] uppercase tracking-wider">
                    Lead Notes & Context
                  </h3>
                  <button
                    type="button"
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="px-2.5 py-1 rounded text-xs font-medium bg-[#78B9E8] text-white hover:bg-[#68A9D8] disabled:opacity-50"
                  >
                    {savingNotes ? 'Saving...' : 'Save Notes'}
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Record call logs, customer objections, operational insights..."
                  className="w-full p-2.5 rounded-lg bg-[#FAF9F5] border border-[#E7E7E2] text-xs text-[#252525] focus:ring-1 focus:ring-[#78B9E8] focus:bg-white"
                />
              </div>

              {/* Status Change Audit Trail */}
              {statusHistory && statusHistory.length > 0 && (
                <div className="p-4 rounded-xl border border-[#E7E7E2] bg-white space-y-2">
                  <h3 className="text-xs font-semibold text-[#555555] uppercase tracking-wider">
                    Pipeline History
                  </h3>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 text-xs">
                    {statusHistory.map((h, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-[#F0F0EB] text-[11px]">
                        <div>
                          <span className="font-medium text-[#252525]">{h.new_status}</span>
                          <span className="text-[#888888] ml-1.5">({h.change_reason || 'Updated'})</span>
                        </div>
                        <span className="text-[#888888] font-mono">{new Date(h.changed_at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
