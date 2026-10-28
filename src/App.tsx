import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.js';
import { DashboardView } from './components/DashboardView.js';
import { DiscoveryView } from './components/DiscoveryView.js';
import { SearchResultsView } from './components/SearchResultsView.js';
import { PipelineView } from './components/PipelineView.js';
import { SettingsView } from './components/SettingsView.js';
import { LeadDetailsModal } from './components/LeadDetailsModal.js';
import { OutreachModal } from './components/OutreachModal.js';
import { CsvImportModal } from './components/CsvImportModal.js';
import { HubSpotModal } from './components/HubSpotModal.js';
import { HunterModal } from './components/HunterModal.js';
import { BusinessRecord, DiscoveryDiagnostics } from './types.js';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'search' | 'results' | 'pipeline' | 'settings'>('dashboard');
  const [searchResults, setSearchResults] = useState<BusinessRecord[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiscoveryDiagnostics | null>(null);
  const [savedCount, setSavedCount] = useState<number>(0);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [outreachLead, setOutreachLead] = useState<BusinessRecord | null>(null);
  const [isCsvImportOpen, setIsCsvImportOpen] = useState<boolean>(false);
  const [isHubSpotOpen, setIsHubSpotOpen] = useState<boolean>(false);
  const [isHunterOpen, setIsHunterOpen] = useState<boolean>(false);

  // Fetch saved leads count on mount
  const updateSavedCount = async () => {
    try {
      const res = await fetch('/api/leads?savedOnly=true&limit=1');
      if (res.ok) {
        const statsRes = await fetch('/api/dashboard/stats');
        if (statsRes.ok) {
          const stats = await statsRes.json();
          setSavedCount(stats.savedLeads || 0);
        }
      }
    } catch {
      // ignore error
    }
  };

  useEffect(() => {
    updateSavedCount();
  }, []);

  const handleSearchComplete = (results: BusinessRecord[], diag: DiscoveryDiagnostics) => {
    setSearchResults(results);
    setDiagnostics(diag);
    setActiveTab('results');
    updateSavedCount();
  };

  const handleToggleSave = async (id: string) => {
    try {
      const res = await fetch(`/api/leads/${id}/save`, { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        setSearchResults((prev) =>
          prev.map((b) => (b.id === id ? { ...b, isSaved: json.isSaved } : b))
        );
        updateSavedCount();
      }
    } catch (err) {
      console.error('Failed to toggle save:', err);
    }
  };

  const handleRunAudit = async (id: string) => {
    try {
      const res = await fetch(`/api/leads/${id}/audit`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSearchResults((prev) =>
          prev.map((b) =>
            b.id === id
              ? {
                  ...b,
                  opportunityScore: data.score.score,
                  scoreBand: data.score.band,
                  dataConfidence: data.score.confidence,
                  websiteStatus: 'verified',
                  lastAuditedAt: data.audit.auditedAt,
                  socialProfiles: data.business?.socialProfiles || b.socialProfiles,
                  contactPageUrl: data.business?.contactPageUrl || b.contactPageUrl,
                }
              : b
          )
        );
      }
    } catch (err) {
      console.error('Audit failed:', err);
    }
  };

  const handleLeadUpdated = (updated: BusinessRecord) => {
    setSearchResults((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    updateSavedCount();
  };

  return (
    <div className="min-h-screen bg-[#F7F7F4] text-[#252525] flex flex-col font-sans selection:bg-[#78B9E8]/30 selection:text-[#252525]">
      {/* Global Navigation Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        savedCount={savedCount}
        resultsCount={searchResults.length}
        onOpenCsvImport={() => setIsCsvImportOpen(true)}
        onOpenHubSpot={() => setIsHubSpotOpen(true)}
        onOpenHunter={() => setIsHunterOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === 'dashboard' && (
          <DashboardView
            onStartSearch={() => setActiveTab('search')}
            onViewPipeline={() => setActiveTab('pipeline')}
            onSelectLeadById={(id) => setSelectedLeadId(id)}
          />
        )}

        {activeTab === 'search' && (
          <DiscoveryView
            onSearchComplete={handleSearchComplete}
            onOpenHubSpot={() => setIsHubSpotOpen(true)}
          />
        )}

        {activeTab === 'results' && (
          <SearchResultsView
            businesses={searchResults}
            diagnostics={diagnostics}
            onSelectLead={(lead) => setSelectedLeadId(lead.id)}
            onOpenOutreach={(lead) => setOutreachLead(lead)}
            onToggleSave={handleToggleSave}
            onRunAudit={handleRunAudit}
            onNewSearch={() => setActiveTab('search')}
          />
        )}

        {activeTab === 'pipeline' && (
          <PipelineView
            onSelectLead={(lead) => setSelectedLeadId(lead.id)}
            onOpenOutreach={(lead) => setOutreachLead(lead)}
            onOpenHubSpot={() => setIsHubSpotOpen(true)}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            onOpenHubSpot={() => setIsHubSpotOpen(true)}
            onOpenHunter={() => setIsHunterOpen(true)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E7E7E2] bg-white py-5 text-center text-xs text-[#777777]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-[#333333]">Nexamor ClientHunter AI</span> — Australian Business Prospecting & AI Voice Automation
          </div>
          <div className="font-mono text-[11px] text-[#888888]">
            AU Discovery Engine • Verified Contact & Socials • Persistent SQLite
          </div>
        </div>
      </footer>

      {/* Modals */}
      {selectedLeadId && (
        <LeadDetailsModal
          businessId={selectedLeadId}
          onClose={() => setSelectedLeadId(null)}
          onOpenOutreach={(lead) => {
            setSelectedLeadId(null);
            setOutreachLead(lead);
          }}
          onUpdateLead={handleLeadUpdated}
        />
      )}

      {outreachLead && (
        <OutreachModal
          business={outreachLead}
          onClose={() => setOutreachLead(null)}
          onOutreachSent={(bizId) => {
            handleLeadUpdated({ ...outreachLead, status: 'Contacted' });
          }}
        />
      )}

      {isCsvImportOpen && (
        <CsvImportModal
          onClose={() => setIsCsvImportOpen(false)}
          onImportSuccess={(count) => {
            updateSavedCount();
            setActiveTab('pipeline');
          }}
        />
      )}

      {isHubSpotOpen && (
        <HubSpotModal
          onClose={() => setIsHubSpotOpen(false)}
          onImportSuccess={(count, businesses) => {
            updateSavedCount();
            if (businesses && businesses.length > 0) {
              setSearchResults((prev) => [...businesses, ...prev]);
            }
            setActiveTab('pipeline');
          }}
        />
      )}

      {isHunterOpen && (
        <HunterModal
          onClose={() => setIsHunterOpen(false)}
          onImportSuccess={(count, businesses) => {
            updateSavedCount();
            if (businesses && businesses.length > 0) {
              setSearchResults((prev) => [...businesses, ...prev]);
            }
            setActiveTab('pipeline');
          }}
        />
      )}
    </div>
  );
}
