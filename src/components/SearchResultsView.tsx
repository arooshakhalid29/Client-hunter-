import React, { useState } from 'react';
import { 
  Building2, 
  MapPin, 
  Globe, 
  Phone, 
  Mail, 
  Bookmark, 
  BookmarkCheck, 
  ExternalLink, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Table as TableIcon,
  LayoutGrid,
  Send,
  Eye,
  RefreshCw,
  Share2,
  FileText,
  Filter,
  Layers,
  Database
} from 'lucide-react';
import { BusinessRecord, DiscoveryDiagnostics, SocialPlatform } from '../types.js';

interface SearchResultsViewProps {
  businesses: BusinessRecord[];
  diagnostics: DiscoveryDiagnostics | null;
  onSelectLead: (lead: BusinessRecord) => void;
  onOpenOutreach: (lead: BusinessRecord) => void;
  onToggleSave: (id: string) => void;
  onRunAudit: (id: string) => Promise<void>;
  onNewSearch: () => void;
}

const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  pinterest: 'Pinterest',
  x: 'X (Twitter)',
};

export const SearchResultsView: React.FC<SearchResultsViewProps> = ({
  businesses,
  diagnostics,
  onSelectLead,
  onOpenOutreach,
  onToggleSave,
  onRunAudit,
  onNewSearch,
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [auditingId, setAuditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [scoreFilter, setScoreFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [completenessFilter, setCompletenessFilter] = useState<string>('all');
  const [socialFilter, setSocialFilter] = useState<string>('all');
  const [enrichmentFilter, setEnrichmentFilter] = useState<string>('all');

  const handleAuditClick = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setAuditingId(id);
    try {
      await onRunAudit(id);
    } finally {
      setAuditingId(null);
    }
  };

  // Extract all distinct sources available in the dataset
  const availableSources = Array.from(new Set(businesses.map((b) => b.source).filter(Boolean)));

  const filteredBusinesses = businesses.filter((b) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const match =
        b.name.toLowerCase().includes(term) ||
        b.city.toLowerCase().includes(term) ||
        b.nicheName.toLowerCase().includes(term) ||
        (b.phone && b.phone.includes(term)) ||
        (b.email && b.email.toLowerCase().includes(term));
      if (!match) return false;
    }

    if (scoreFilter === 'high' && b.opportunityScore < 80) return false;
    if (scoreFilter === 'medium' && (b.opportunityScore < 60 || b.opportunityScore >= 80)) return false;
    if (scoreFilter === 'low' && b.opportunityScore >= 60) return false;

    // Multi-source filter
    if (sourceFilter !== 'all' && b.source !== sourceFilter) return false;

    // Contact completeness filter
    if (completenessFilter === 'has_phone' && !b.phone) return false;
    if (completenessFilter === 'has_email' && !b.email) return false;
    if (completenessFilter === 'has_both' && (!b.phone || !b.email)) return false;
    if (completenessFilter === 'no_contacts' && (b.phone || b.email)) return false;

    // Social profile filter
    const verifiedSocials = (b.socialProfiles || []).filter((s) => s.status === 'verified');
    if (socialFilter === 'any' && verifiedSocials.length === 0) return false;
    if (socialFilter === 'none' && verifiedSocials.length > 0) return false;
    if (socialFilter !== 'all' && socialFilter !== 'any' && socialFilter !== 'none') {
      if (!verifiedSocials.some((s) => s.platform === socialFilter)) return false;
    }

    // Enrichment status filter
    if (enrichmentFilter !== 'all' && (b.enrichmentStatus || 'pending') !== enrichmentFilter) return false;

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Diagnostics & Summary Banner */}
      <div className="p-5 rounded-xl bg-white border border-[#E7E7E2] shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#252525] flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#78B9E8]" />
              Australian Multi-Source Discovery Results
            </h2>
            <p className="text-xs text-[#777777] mt-0.5">
              Found {businesses.length} genuine Australian businesses across {diagnostics?.configuredProviders.length || 3} independent sources.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onNewSearch}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#F7F7F4] hover:bg-[#EFEFEA] text-[#252525] border border-[#E7E7E2] transition-colors"
            >
              Modify Search
            </button>
            <div className="flex rounded-lg bg-[#F7F7F4] p-0.5 border border-[#E7E7E2]">
              <button
                onClick={() => setViewMode('table')}
                title="Table view"
                className={`p-1.5 rounded-md text-xs ${
                  viewMode === 'table' ? 'bg-white text-[#252525] shadow-2xs font-medium' : 'text-[#777777] hover:text-[#252525]'
                }`}
              >
                <TableIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                title="Cards view"
                className={`p-1.5 rounded-md text-xs ${
                  viewMode === 'cards' ? 'bg-white text-[#252525] shadow-2xs font-medium' : 'text-[#777777] hover:text-[#252525]'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Real Provider Diagnostics Strip */}
        {diagnostics && (
          <div className="pt-2 border-t border-[#F0F0EB] flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs text-[#666666]">
            <div>
              Active Sources: <span className="text-[#252525] font-medium">{diagnostics.configuredProviders.join(', ')}</span>
            </div>
            <div>
              Queries Executed: <span className="text-[#252525] font-medium">{diagnostics.queriesExecuted}</span>
            </div>
            <div>
              Raw Found: <span className="text-[#252525] font-medium">{diagnostics.rawRecordsReturned}</span>
            </div>
            <div>
              Retained: <span className="text-[#2B6CB0] font-medium">{diagnostics.uniqueBusinessesRetained}</span>
            </div>
            <div>
              Official Websites: <span className="text-emerald-700 font-medium">{diagnostics.officialWebsitesFound}</span>
            </div>
            <div>
              Qualified (≥60): <span className="text-amber-700 font-medium">{diagnostics.leadsQualified}</span>
            </div>
            {diagnostics.executionTimeMs > 0 && (
              <div>
                Latency: <span className="text-[#888888]">{(diagnostics.executionTimeMs / 1000).toFixed(1)}s</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Advanced Multi-Source Filter Toolbar */}
      <div className="p-4 rounded-xl bg-white border border-[#E7E7E2] shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, city, phone, email..."
              className="w-full pl-3 pr-3 py-1.5 rounded-lg bg-[#FAF9F5] border border-[#E7E7E2] text-xs text-[#252525] placeholder-[#999999] focus:outline-none focus:ring-1 focus:ring-[#78B9E8] focus:bg-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto text-xs">
            {/* Source Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[#777777]">Source:</span>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-[#FAF9F5] border border-[#E7E7E2] text-xs text-[#252525] focus:outline-none focus:ring-1 focus:ring-[#78B9E8]"
              >
                <option value="all">All Sources</option>
                {availableSources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Contact Completeness Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[#777777]">Contacts:</span>
              <select
                value={completenessFilter}
                onChange={(e) => setCompletenessFilter(e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-[#FAF9F5] border border-[#E7E7E2] text-xs text-[#252525] focus:outline-none focus:ring-1 focus:ring-[#78B9E8]"
              >
                <option value="all">All Contacts</option>
                <option value="has_phone">Has Phone</option>
                <option value="has_email">Has Email</option>
                <option value="has_both">Has Both Phone & Email</option>
                <option value="no_contacts">No Contacts Yet</option>
              </select>
            </div>

            {/* Social Media Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[#777777]">Socials:</span>
              <select
                value={socialFilter}
                onChange={(e) => setSocialFilter(e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-[#FAF9F5] border border-[#E7E7E2] text-xs text-[#252525] focus:outline-none focus:ring-1 focus:ring-[#78B9E8]"
              >
                <option value="all">All Socials</option>
                <option value="any">Any Verified</option>
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="linkedin">LinkedIn</option>
                <option value="tiktok">TikTok</option>
                <option value="youtube">YouTube</option>
                <option value="x">X (Twitter)</option>
                <option value="none">No Socials Found</option>
              </select>
            </div>

            {/* Score Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[#777777]">Score:</span>
              <select
                value={scoreFilter}
                onChange={(e: any) => setScoreFilter(e.target.value)}
                className="px-2 py-1.5 rounded-lg bg-[#FAF9F5] border border-[#E7E7E2] text-xs text-[#252525] focus:outline-none focus:ring-1 focus:ring-[#78B9E8]"
              >
                <option value="all">All Scores</option>
                <option value="high">High Priority (≥80)</option>
                <option value="medium">Medium Fit (60-79)</option>
                <option value="low">Low Fit (&lt;60)</option>
              </select>
            </div>

            <span className="text-xs text-[#888888] font-mono pl-1">
              {filteredBusinesses.length} of {businesses.length}
            </span>
          </div>
        </div>
      </div>

      {/* Zero State */}
      {businesses.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-white border border-[#E7E7E2] space-y-3">
          <Building2 className="w-10 h-10 text-[#888888] mx-auto" />
          <h3 className="text-base font-semibold text-[#252525]">No businesses discovered yet</h3>
          <p className="text-xs text-[#777777] max-w-md mx-auto">
            Run a search across Australia's industry associations, web directories, and OpenStreetMap to discover live prospect data.
          </p>
          <button
            onClick={onNewSearch}
            className="mt-2 px-4 py-2 rounded-lg bg-[#78B9E8] text-white text-xs font-medium hover:bg-[#68A9D8] transition-colors"
          >
            Start New AU Search
          </button>
        </div>
      ) : filteredBusinesses.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-white border border-[#E7E7E2] space-y-2">
          <p className="text-sm font-semibold text-[#252525]">No businesses match the current multi-source filter</p>
          <p className="text-xs text-[#777777]">Try clearing your contact completeness or source filter.</p>
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div className="overflow-x-auto rounded-xl border border-[#E7E7E2] bg-white shadow-2xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E7E7E2] bg-[#F7F7F4] text-[#666666]">
                <th className="py-3 px-4 font-medium">Business / Location</th>
                <th className="py-3 px-4 font-medium">Niche / Category</th>
                <th className="py-3 px-4 font-medium">Contact Channels</th>
                <th className="py-3 px-4 font-medium">Discovery Source</th>
                <th className="py-3 px-4 font-medium">Socials</th>
                <th className="py-3 px-4 font-medium text-center">Opportunity</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E7E2]">
              {filteredBusinesses.map((biz) => {
                const scoreColor =
                  biz.opportunityScore >= 80
                    ? 'bg-[#EAF7EE] text-[#1D7A41] border-[#C6ECD2]'
                    : biz.opportunityScore >= 60
                    ? 'bg-[#EBF5FB] text-[#2B6CB0] border-[#CDE5F7]'
                    : 'bg-[#F7F7F4] text-[#666666] border-[#E7E7E2]';

                const verifiedSocials = (biz.socialProfiles || []).filter((s) => s.status === 'verified');
                const hasNoContacts = !biz.phone && !biz.email && !biz.websiteUrl;

                return (
                  <tr
                    key={biz.id}
                    onClick={() => onSelectLead(biz)}
                    className="hover:bg-[#FAF9F5] transition-colors cursor-pointer group"
                  >
                    {/* Business Name & Address */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-start gap-2.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleSave(biz.id);
                          }}
                          className={`mt-0.5 p-1 rounded hover:bg-[#EFEFEA] transition-colors ${
                            biz.isSaved ? 'text-[#78B9E8]' : 'text-[#CCCCCC] hover:text-[#777777]'
                          }`}
                          title={biz.isSaved ? 'Lead saved' : 'Save lead'}
                        >
                          {biz.isSaved ? (
                            <BookmarkCheck className="w-4 h-4 fill-[#78B9E8]" />
                          ) : (
                            <Bookmark className="w-4 h-4" />
                          )}
                        </button>
                        <div>
                          <div className="font-semibold text-[#252525] text-sm group-hover:text-[#2B6CB0] transition-colors">
                            {biz.name}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-[#777777] mt-0.5">
                            <MapPin className="w-3 h-3 text-[#999999]" />
                            <span>
                              {biz.suburb ? `${biz.suburb}, ` : ''}{biz.city} {biz.state} {biz.postcode || ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Niche */}
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#F0F0EB] text-[#444444] border border-[#E7E7E2]">
                        {biz.nicheName}
                      </span>
                    </td>

                    {/* Contacts & Website */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-1">
                        {hasNoContacts ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                            No Contacts Yet • Awaiting Enrichment
                          </span>
                        ) : (
                          <>
                            {biz.phone && (
                              <div className="flex items-center gap-1.5 text-xs text-[#252525]">
                                <Phone className="w-3 h-3 text-[#78B9E8]" />
                                <span className="font-mono">{biz.phone}</span>
                              </div>
                            )}

                            <div className="flex items-center gap-2 flex-wrap">
                              {biz.websiteUrl && (
                                <a
                                  href={biz.websiteUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[11px] text-[#2B6CB0] hover:underline"
                                >
                                  <Globe className="w-3 h-3 text-[#78B9E8]" />
                                  <span>Website</span>
                                </a>
                              )}
                              {biz.contactPageUrl && (
                                <a
                                  href={biz.contactPageUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-[#EAF7EE] px-1.5 py-0.2 rounded border border-[#C6ECD2] hover:underline"
                                >
                                  <FileText className="w-2.5 h-2.5" />
                                  <span>Contact Page</span>
                                </a>
                              )}
                            </div>

                            {biz.email && (
                              <div className="flex items-center gap-1.5 text-[11px] text-[#555555] truncate max-w-[200px]">
                                <Mail className="w-3 h-3 text-[#777777]" />
                                <span className="truncate">{biz.email}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </td>

                    {/* Discovery Source & Clickable Link */}
                    <td className="py-3.5 px-4">
                      <div className="space-y-0.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#F7F7F4] text-[#444444] border border-[#E7E7E2]">
                          {biz.source}
                        </span>
                        {biz.sourceUrl && (
                          <div className="text-[10px]">
                            <a
                              href={biz.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[#2B6CB0] hover:underline inline-flex items-center gap-0.5"
                            >
                              <span>View Listing</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Social Media Links */}
                    <td className="py-3.5 px-4">
                      {verifiedSocials.length > 0 ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {verifiedSocials.map((s) => (
                            <a
                              key={s.platform}
                              href={s.url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={`${SOCIAL_LABELS[s.platform]}: ${s.handle || s.url} (Verified)`}
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#F7F7F4] hover:bg-[#EFEFEA] text-[#333333] border border-[#E7E7E2] transition-colors"
                            >
                              {s.platform === 'instagram' && 'IG'}
                              {s.platform === 'facebook' && 'FB'}
                              {s.platform === 'linkedin' && 'LI'}
                              {s.platform === 'tiktok' && 'TT'}
                              {s.platform === 'youtube' && 'YT'}
                              {s.platform === 'pinterest' && 'Pin'}
                              {s.platform === 'x' && 'X'}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[11px] text-[#AAAAAA] italic">None detected</span>
                      )}
                    </td>

                    {/* Opportunity Score */}
                    <td className="py-3.5 px-4 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${scoreColor}`}>
                        {biz.opportunityScore}/100
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => handleAuditClick(e, biz.id)}
                          disabled={auditingId === biz.id}
                          className="px-2 py-1 rounded text-[11px] font-medium bg-white text-[#555555] border border-[#E7E7E2] hover:bg-[#F7F7F4] hover:text-[#252525] disabled:opacity-40"
                          title="Enrich lead via multi-source pipeline"
                        >
                          <RefreshCw className={`w-3 h-3 ${auditingId === biz.id ? 'animate-spin text-[#78B9E8]' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectLead(biz);
                          }}
                          className="px-2.5 py-1 rounded text-xs font-medium bg-[#F7F7F4] hover:bg-[#EFEFEA] text-[#252525] border border-[#E7E7E2] transition-colors"
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenOutreach(biz);
                          }}
                          className="p-1 rounded text-[#78B9E8] hover:bg-[#EBF5FB] transition-colors"
                          title="Draft tailored outreach message"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* CARDS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBusinesses.map((biz) => {
            const scoreColor =
              biz.opportunityScore >= 80
                ? 'bg-[#EAF7EE] text-[#1D7A41] border-[#C6ECD2]'
                : biz.opportunityScore >= 60
                ? 'bg-[#EBF5FB] text-[#2B6CB0] border-[#CDE5F7]'
                : 'bg-[#F7F7F4] text-[#666666] border-[#E7E7E2]';

            const verifiedSocials = (biz.socialProfiles || []).filter((s) => s.status === 'verified');
            const hasNoContacts = !biz.phone && !biz.email && !biz.websiteUrl;

            return (
              <div
                key={biz.id}
                onClick={() => onSelectLead(biz)}
                className="p-4 rounded-xl border border-[#E7E7E2] bg-white shadow-2xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between space-y-3 group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm text-[#252525] group-hover:text-[#2B6CB0] transition-colors line-clamp-1">
                        {biz.name}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs text-[#777777] mt-1">
                        <MapPin className="w-3 h-3 text-[#999999]" />
                        <span>
                          {biz.suburb ? `${biz.suburb}, ` : ''}{biz.city} {biz.state}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleSave(biz.id);
                      }}
                      className={`p-1 rounded hover:bg-[#EFEFEA] transition-colors ${
                        biz.isSaved ? 'text-[#78B9E8]' : 'text-[#CCCCCC] hover:text-[#777777]'
                      }`}
                    >
                      {biz.isSaved ? (
                        <BookmarkCheck className="w-4 h-4 fill-[#78B9E8]" />
                      ) : (
                        <Bookmark className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#F0F0EB] text-[#444444] border border-[#E7E7E2]">
                      {biz.nicheName}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#F7F7F4] text-[#555555] border border-[#E7E7E2]">
                      {biz.source}
                    </span>
                  </div>

                  {/* Contact channels */}
                  <div className="space-y-1.5 text-xs mt-3 pt-3 border-t border-[#F0F0EB]">
                    {hasNoContacts ? (
                      <div className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                        No contact channels yet • Preserved for enrichment
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between text-[#555555]">
                          <span className="flex items-center gap-1.5 text-[#777777]">
                            <Phone className="w-3 h-3 text-[#78B9E8]" /> Phone:
                          </span>
                          <span className="font-mono text-[#252525]">{biz.phone || 'None'}</span>
                        </div>

                        <div className="flex items-center justify-between text-[#555555]">
                          <span className="flex items-center gap-1.5 text-[#777777]">
                            <Globe className="w-3 h-3 text-[#78B9E8]" /> Website:
                          </span>
                          {biz.websiteUrl ? (
                            <a
                              href={biz.websiteUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[#2B6CB0] hover:underline truncate max-w-[150px] inline-flex items-center gap-0.5"
                            >
                              <span>{biz.websiteUrl.replace(/^https?:\/\//, '').replace(/^www\./, '')}</span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </a>
                          ) : (
                            <span className="text-[#AAAAAA] italic">None</span>
                          )}
                        </div>

                        {biz.email && (
                          <div className="flex items-center justify-between text-[#555555]">
                            <span className="flex items-center gap-1.5 text-[#777777]">
                              <Mail className="w-3 h-3 text-[#777777]" /> Email:
                            </span>
                            <span className="truncate max-w-[150px] text-[#252525] font-mono text-[11px]">{biz.email}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Social Profile links */}
                  {verifiedSocials.length > 0 && (
                    <div className="flex items-center gap-1 mt-2.5 flex-wrap">
                      {verifiedSocials.map((s) => (
                        <a
                          key={s.platform}
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-[#FAF9F5] text-[#333333] border border-[#E7E7E2]"
                        >
                          {s.platform}
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card Footer: Score & Outreach Button */}
                <div className="pt-3 border-t border-[#F0F0EB] flex items-center justify-between">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${scoreColor}`}>
                    {biz.opportunityScore}/100
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => handleAuditClick(e, biz.id)}
                      disabled={auditingId === biz.id}
                      className="p-1.5 rounded-lg border border-[#E7E7E2] hover:bg-[#F7F7F4] text-[#666666]"
                      title="Enrich Lead"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${auditingId === biz.id ? 'animate-spin text-[#78B9E8]' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenOutreach(biz);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-[#78B9E8] text-white text-xs font-medium hover:bg-[#68A9D8] transition-colors flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" />
                      <span>Draft</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
