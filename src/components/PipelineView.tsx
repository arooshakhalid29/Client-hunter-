import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  Download, 
  Filter, 
  Kanban, 
  Table as TableIcon, 
  Building2, 
  MapPin, 
  Phone, 
  Globe, 
  Send, 
  BookmarkCheck, 
  ArrowRight, 
  Sparkles, 
  RefreshCw,
  Share2,
  Database
} from 'lucide-react';
import { BusinessRecord, LeadStatus, AustralianState } from '../types.js';

interface PipelineViewProps {
  onSelectLead: (lead: BusinessRecord) => void;
  onOpenOutreach: (lead: BusinessRecord) => void;
  onOpenHubSpot?: () => void;
}

const CRM_STAGES: { id: LeadStatus; label: string; dotColor: string }[] = [
  { id: 'New', label: 'New', dotColor: 'bg-[#999999]' },
  { id: 'Needs Review', label: 'Needs Review', dotColor: 'bg-amber-500' },
  { id: 'Qualified', label: 'Qualified', dotColor: 'bg-[#78B9E8]' },
  { id: 'Contacted', label: 'Contacted', dotColor: 'bg-purple-500' },
  { id: 'Replied', label: 'Replied', dotColor: 'bg-teal-600' },
  { id: 'Converted', label: 'Converted', dotColor: 'bg-emerald-600' },
];

export const PipelineView: React.FC<PipelineViewProps> = ({
  onSelectLead,
  onOpenOutreach,
  onOpenHubSpot,
}) => {
  const [leads, setLeads] = useState<BusinessRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedCompleteness, setSelectedCompleteness] = useState<string>('all');

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leads?savedOnly=true&limit=200');
      if (res.ok) {
        const data = await res.json();
        setLeads(data);
      }
    } catch (err) {
      console.error('Failed to load leads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const handleStageChange = async (leadId: string, newStatus: LeadStatus) => {
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setLeads((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l))
        );
      }
    } catch (err) {
      console.error('Failed to update stage:', err);
    }
  };

  const handleExportCsv = () => {
    window.location.href = '/api/csv/export?savedOnly=true';
  };

  const availableSources = Array.from(new Set(leads.map((l) => l.source).filter(Boolean)));

  const filteredLeads = leads.filter((l) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const match =
        l.name.toLowerCase().includes(term) ||
        l.city.toLowerCase().includes(term) ||
        l.nicheName.toLowerCase().includes(term) ||
        (l.phone && l.phone.includes(term)) ||
        (l.email && l.email.toLowerCase().includes(term));
      if (!match) return false;
    }
    if (selectedState !== 'all' && l.state !== selectedState) return false;
    if (selectedStage !== 'all' && l.status !== selectedStage) return false;
    if (selectedSource !== 'all' && l.source !== selectedSource) return false;
    if (selectedCompleteness === 'has_phone' && !l.phone) return false;
    if (selectedCompleteness === 'has_email' && !l.email) return false;
    if (selectedCompleteness === 'has_both' && (!l.phone || !l.email)) return false;
    if (selectedCompleteness === 'no_contacts' && (l.phone || l.email)) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-5 rounded-xl bg-white border border-[#E7E7E2] shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[#252525] flex items-center gap-2">
            <Users className="w-5 h-5 text-[#78B9E8]" />
            Nexamor Client Pipeline & CRM
          </h2>
          <p className="text-xs text-[#777777] mt-0.5">
            Manage prospects through qualification stages: New, Needs Review, Qualified, Contacted, Replied, and Converted.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchLeads}
            title="Refresh pipeline"
            className="p-1.5 rounded-lg bg-[#F7F7F4] hover:bg-[#EFEFEA] text-[#555555] transition-colors border border-[#E7E7E2]"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#78B9E8]' : ''}`} />
          </button>

          {onOpenHubSpot && (
            <button
              onClick={onOpenHubSpot}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#FFF5F2] text-[#E05A38] border border-[#FFD5C8] hover:bg-[#FFEAE3] hover:text-[#C74828] transition-colors shadow-2xs"
              title="Import companies from HubSpot CRM"
            >
              <Database className="w-3.5 h-3.5 text-[#FF7A59]" />
              <span>Import from HubSpot</span>
            </button>
          )}

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#F7F7F4] hover:bg-[#EFEFEA] text-[#252525] border border-[#E7E7E2] transition-colors shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-[#78B9E8]" />
            <span>Export CSV</span>
          </button>

          <div className="flex rounded-lg bg-[#F7F7F4] p-0.5 border border-[#E7E7E2]">
            <button
              onClick={() => setViewMode('kanban')}
              title="Kanban Board"
              className={`p-1.5 rounded-md text-xs ${
                viewMode === 'kanban' ? 'bg-white text-[#252525] shadow-2xs font-medium' : 'text-[#777777] hover:text-[#252525]'
              }`}
            >
              <Kanban className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Table view"
              className={`p-1.5 rounded-md text-xs ${
                viewMode === 'table' ? 'bg-white text-[#252525] shadow-2xs font-medium' : 'text-[#777777] hover:text-[#252525]'
              }`}
            >
              <TableIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search saved pipeline..."
            className="w-full pl-3 pr-3 py-1.5 rounded-lg bg-white border border-[#E7E7E2] text-xs text-[#252525] placeholder-[#999999] focus:outline-none focus:ring-1 focus:ring-[#78B9E8]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto text-xs text-[#555555]">
          <div className="flex items-center gap-1.5">
            <span>State:</span>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="px-2 py-1 rounded-md bg-white border border-[#E7E7E2] text-xs text-[#252525]"
            >
              <option value="all">All States</option>
              <option value="NSW">NSW</option>
              <option value="VIC">VIC</option>
              <option value="QLD">QLD</option>
              <option value="WA">WA</option>
              <option value="SA">SA</option>
              <option value="ACT">ACT</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span>Stage:</span>
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="px-2 py-1 rounded-md bg-white border border-[#E7E7E2] text-xs text-[#252525]"
            >
              <option value="all">All Stages</option>
              {CRM_STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span>Source:</span>
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="px-2 py-1 rounded-md bg-white border border-[#E7E7E2] text-xs text-[#252525]"
            >
              <option value="all">All Sources</option>
              {availableSources.map((src) => (
                <option key={src} value={src}>
                  {src}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span>Contacts:</span>
            <select
              value={selectedCompleteness}
              onChange={(e) => setSelectedCompleteness(e.target.value)}
              className="px-2 py-1 rounded-md bg-white border border-[#E7E7E2] text-xs text-[#252525]"
            >
              <option value="all">All</option>
              <option value="has_phone">Has Phone</option>
              <option value="has_email">Has Email</option>
              <option value="has_both">Both Phone & Email</option>
              <option value="no_contacts">No Contacts</option>
            </select>
          </div>

          <span className="text-[11px] text-[#888888] font-mono pl-1">
            {filteredLeads.length} saved
          </span>
        </div>
      </div>

      {/* Main View Area */}
      {leads.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-white border border-[#E7E7E2] space-y-3">
          <BookmarkCheck className="w-10 h-10 text-[#888888] mx-auto" />
          <h3 className="text-base font-semibold text-[#252525]">Your Saved Pipeline is Empty</h3>
          <p className="text-xs text-[#777777] max-w-md mx-auto">
            Save Australian prospects from the Search Results tab to manage them through qualification, outreach, and booked appointments.
          </p>
        </div>
      ) : viewMode === 'kanban' ? (
        /* KANBAN BOARD */
        <div className="flex gap-4 overflow-x-auto pb-6 pt-1">
          {CRM_STAGES.map((stage) => {
            const stageLeads = filteredLeads.filter(
              (l) => (l.status || 'New') === stage.id
            );

            return (
              <div
                key={stage.id}
                className="w-72 shrink-0 flex flex-col rounded-xl bg-white border border-[#E7E7E2] shadow-2xs"
              >
                {/* Column Header */}
                <div className="p-3 border-b border-[#E7E7E2] bg-[#F7F7F4] rounded-t-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${stage.dotColor}`} />
                    <span className="text-xs font-semibold text-[#252525]">{stage.label}</span>
                  </div>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-medium bg-white text-[#555555] border border-[#E7E7E2]">
                    {stageLeads.length}
                  </span>
                </div>

                {/* Lead Cards List */}
                <div className="p-2 space-y-2 overflow-y-auto max-h-[68vh] min-h-[140px]">
                  {stageLeads.length === 0 ? (
                    <div className="p-4 text-center text-[11px] text-[#AAAAAA] italic">
                      No prospects in {stage.label}
                    </div>
                  ) : (
                    stageLeads.map((lead) => {
                      const scoreColor =
                        lead.opportunityScore >= 80
                          ? 'bg-[#EAF7EE] text-[#1D7A41]'
                          : lead.opportunityScore >= 60
                          ? 'bg-[#EBF5FB] text-[#2B6CB0]'
                          : 'bg-[#F7F7F4] text-[#777777]';

                      return (
                        <div
                          key={lead.id}
                          onClick={() => onSelectLead(lead)}
                          className="p-3 rounded-lg border border-[#E7E7E2] bg-white hover:border-[#D0D0C8] shadow-2xs hover:shadow-xs transition-all cursor-pointer space-y-2 group"
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <h4 className="text-xs font-semibold text-[#252525] group-hover:text-[#2B6CB0] transition-colors leading-tight">
                              {lead.name}
                            </h4>
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-semibold shrink-0 ${scoreColor}`}>
                              {lead.opportunityScore}
                            </span>
                          </div>

                          <div className="text-[10px] text-[#777777] flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 text-[#999999]" />
                            <span className="truncate">{lead.city}, {lead.state}</span>
                          </div>

                          <div className="text-[10px] text-[#555555] truncate">
                            {lead.nicheName}
                          </div>

                          {/* Quick Stage Mover */}
                          <div className="pt-2 border-t border-[#F0F0EB] flex items-center justify-between text-[11px]">
                            <select
                              value={lead.status}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => handleStageChange(lead.id, e.target.value as LeadStatus)}
                              className="text-[10px] bg-[#F7F7F4] border border-[#E7E7E2] rounded px-1.5 py-0.5 text-[#555555]"
                            >
                              {CRM_STAGES.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.label}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenOutreach(lead);
                              }}
                              className="p-1 rounded text-[#2B6CB0] hover:bg-[#EBF5FB]"
                              title="Draft Outreach"
                            >
                              <Send className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="overflow-x-auto rounded-xl border border-[#E7E7E2] bg-white shadow-2xs">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#E7E7E2] bg-[#F7F7F4] text-[#666666]">
                <th className="py-3 px-4 font-medium">Business</th>
                <th className="py-3 px-4 font-medium">Location</th>
                <th className="py-3 px-4 font-medium">Niche</th>
                <th className="py-3 px-4 font-medium">Stage</th>
                <th className="py-3 px-4 font-medium text-center">Score</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E7E7E2]">
              {filteredLeads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => onSelectLead(lead)}
                  className="hover:bg-[#FAF9F5] transition-colors cursor-pointer"
                >
                  <td className="py-3 px-4 font-semibold text-[#252525]">{lead.name}</td>
                  <td className="py-3 px-4 text-[#666666]">{lead.city}, {lead.state}</td>
                  <td className="py-3 px-4 text-[#666666]">{lead.nicheName}</td>
                  <td className="py-3 px-4">
                    <select
                      value={lead.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => handleStageChange(lead.id, e.target.value as LeadStatus)}
                      className="text-xs bg-[#F7F7F4] border border-[#E7E7E2] rounded px-2 py-1 text-[#252525]"
                    >
                      {CRM_STAGES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 px-4 text-center font-semibold text-[#252525]">
                    {lead.opportunityScore}/100
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenOutreach(lead);
                      }}
                      className="px-2.5 py-1 rounded text-[11px] font-medium bg-[#EBF5FB] text-[#2B6CB0] border border-[#CDE5F7] hover:bg-[#DEEFF9] inline-flex items-center gap-1"
                    >
                      <Send className="w-3 h-3" />
                      <span>Outreach</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
