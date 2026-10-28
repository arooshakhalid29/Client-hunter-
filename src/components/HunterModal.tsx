import React, { useState, useEffect } from 'react';
import { 
  X, 
  Target, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  RefreshCw, 
  ExternalLink, 
  Key, 
  Check, 
  Building, 
  Phone, 
  Globe, 
  ShieldCheck, 
  Sparkles, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  Trash2, 
  Mail, 
  UserCheck, 
  Search, 
  Linkedin, 
  CheckCheck
} from 'lucide-react';
import { BusinessRecord } from '../types.js';

interface HunterEmailItem {
  value: string;
  type: 'personal' | 'generic';
  confidence: number;
  firstName?: string | null;
  lastName?: string | null;
  position?: string | null;
  department?: string | null;
  linkedin?: string | null;
  phoneNumber?: string | null;
}

interface HunterDomainSearchResult {
  domain: string;
  organization: string;
  industry?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  postalCode?: string | null;
  street?: string | null;
  phone?: string | null;
  emails: HunterEmailItem[];
  source: 'live_hunter_api' | 'demo_hunter_feed';
}

interface HunterModalProps {
  onClose: () => void;
  onImportSuccess: (count: number, businesses: BusinessRecord[]) => void;
}

export const HunterModal: React.FC<HunterModalProps> = ({
  onClose,
  onImportSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'search' | 'verifier'>('search');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [keyMasked, setKeyMasked] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    email?: string;
    planName?: string;
    searchesAvailable?: number;
    message: string;
  } | null>(null);

  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [deletingKey, setDeletingKey] = useState(false);

  // Search State
  const [searchQuery, setSearchQuery] = useState('sydneycommercialplumbing.com.au');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<HunterDomainSearchResult[]>([]);
  const [searchSource, setSearchSource] = useState<'live_hunter_api' | 'demo_hunter_feed' | null>(null);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());

  // Import State
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    importedCount: number;
    message: string;
  } | null>(null);

  // Email Verifier State
  const [verifyEmailInput, setVerifyEmailInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any | null>(null);

  useEffect(() => {
    fetchConfig();
    // Auto run first search with default domain
    handleDomainSearch('sydneycommercialplumbing.com.au');
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/hunter/config');
      if (res.ok) {
        const data = await res.json();
        setHasKey(data.hasKey);
        setKeyMasked(data.keyMasked);
        if (!data.hasKey) {
          setIsGuideOpen(true);
        }
      }
    } catch (err) {
      console.error('Failed to load Hunter config:', err);
    }
  };

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    try {
      const res = await fetch('/api/hunter/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
      });
      if (res.ok) {
        setApiKeyInput('');
        await fetchConfig();
        handleTestConnection(apiKeyInput.trim());
      }
    } catch (err) {
      console.error('Failed to save Hunter key:', err);
    } finally {
      setSavingKey(false);
    }
  };

  const handleTestConnection = async (testKey?: string) => {
    setTestingConnection(true);
    setConnectionStatus(null);
    try {
      const res = await fetch('/api/hunter/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: testKey }),
      });
      const data = await res.json();
      setConnectionStatus(data);
    } catch (err: any) {
      setConnectionStatus({
        connected: false,
        message: err.message || 'Connection test failed',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!confirm('Disconnect your Hunter.io API key?')) return;
    setDeletingKey(true);
    try {
      const res = await fetch('/api/hunter/token', { method: 'DELETE' });
      if (res.ok) {
        setApiKeyInput('');
        setConnectionStatus(null);
        await fetchConfig();
        setIsGuideOpen(true);
      }
    } catch (err) {
      console.error('Failed to delete Hunter key:', err);
    } finally {
      setDeletingKey(false);
    }
  };

  const handleDomainSearch = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? searchQuery).trim();
    if (!q) return;

    setSearching(true);
    setSearchMessage(null);
    setImportResult(null);

    try {
      const res = await fetch('/api/hunter/domain-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, limit: 10 }),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
        setSearchSource(data.source);
        setSearchMessage(data.message);
        // By default select all found domains
        setSelectedDomains(new Set((data.results || []).map((r: HunterDomainSearchResult) => r.domain)));
      }
    } catch (err: any) {
      setSearchMessage('Search error: ' + err.message);
    } finally {
      setSearching(false);
    }
  };

  const toggleSelectDomain = (domain: string) => {
    const next = new Set(selectedDomains);
    if (next.has(domain)) {
      next.delete(domain);
    } else {
      next.add(domain);
    }
    setSelectedDomains(next);
  };

  const handleImport = async () => {
    const selected = searchResults.filter((r) => selectedDomains.has(r.domain));
    if (selected.length === 0) return;

    setImporting(true);
    setImportResult(null);

    try {
      const res = await fetch('/api/hunter/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          results: selected,
          saveDirectly: true,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setImportResult({
          success: true,
          importedCount: data.importedCount,
          message: `Successfully imported ${data.importedCount} business records with verified decision-maker emails into ClientHunter!`,
        });
        onImportSuccess(data.importedCount, data.businesses || []);
      } else {
        const errJson = await res.json();
        setImportResult({
          success: false,
          importedCount: 0,
          message: errJson.error || 'Import failed',
        });
      }
    } catch (err: any) {
      setImportResult({
        success: false,
        importedCount: 0,
        message: err.message || 'Import failed',
      });
    } finally {
      setImporting(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyEmailInput.trim()) return;

    setVerifying(true);
    setVerifyResult(null);

    try {
      const res = await fetch('/api/hunter/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verifyEmailInput.trim() }),
      });
      const data = await res.json();
      setVerifyResult(data);
    } catch (err: any) {
      setVerifyResult({
        email: verifyEmailInput,
        status: 'invalid',
        score: 0,
        message: 'Verification check failed: ' + err.message,
      });
    } finally {
      setVerifying(false);
    }
  };

  const PRESET_DOMAINS = [
    { label: 'Sydney Commercial Plumbing', domain: 'sydneycommercialplumbing.com.au' },
    { label: 'All Coast Air Conditioning', domain: 'allcoastairconditioning.com.au' },
    { label: 'Melbourne Rapid Plumbing', domain: 'melbournerapidplumbing.com.au' },
    { label: 'Brisbane Restorative Dental', domain: 'brisbanedentalgroup.com.au' },
    { label: 'Apex Electrical Contractors', domain: 'apexelectricalcontractors.com.au' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-[#252525]/45 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white border border-[#E7E7E2] rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-fadeIn text-[#252525]">
        {/* Header */}
        <div className="p-5 border-b border-[#E7E7E2] bg-[#F7F7F4] flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#E65100] text-white flex items-center justify-center shadow-xs">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#E65100]/10 text-[#E65100] border border-[#E65100]/20 uppercase">
                  Hunter.io Intelligence
                </span>
                <span className="text-xs text-[#777777]">Domain Search & Email Finder v2</span>
              </div>
              <h2 className="text-base font-semibold text-[#252525] tracking-tight">
                Discover Australian Businesses & Verified Decision-Maker Emails
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#777777] hover:text-[#252525] hover:bg-[#EFEFEA] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="px-6 pt-3 border-b border-[#E7E7E2] bg-white flex items-center gap-2">
          <button
            onClick={() => setActiveTab('search')}
            className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'search'
                ? 'border-[#E65100] text-[#E65100]'
                : 'border-transparent text-[#666666] hover:text-[#252525]'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Domain & Company Search</span>
          </button>

          <button
            onClick={() => setActiveTab('verifier')}
            className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'verifier'
                ? 'border-[#E65100] text-[#E65100]'
                : 'border-transparent text-[#666666] hover:text-[#252525]'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Email Deliverability Verifier</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* API Key Configuration Card */}
          <div className="p-4 rounded-xl bg-[#FAF9F5] border border-[#E7E7E2] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-[#E65100]" />
                <h3 className="text-xs font-semibold text-[#252525] uppercase tracking-wider">
                  Hunter.io API Key Configuration
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {hasKey ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Configured ({keyMasked})</span>
                  </div>
                ) : (
                  <span className="text-xs text-[#777777] bg-white px-2 py-0.5 rounded border border-[#E7E7E2]">
                    Key Not Stored
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => setIsGuideOpen(!isGuideOpen)}
                  className="flex items-center gap-1 text-xs text-[#2B6CB0] hover:text-[#1D4E89] font-medium"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>{isGuideOpen ? 'Hide Guide' : 'How to get free key?'}</span>
                  {isGuideOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Quick 1-Minute Guide */}
            {isGuideOpen && (
              <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] text-xs space-y-2.5 text-[#333333] shadow-2xs">
                <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-2">
                  <span className="font-semibold text-[#1E293B] flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[#E65100]" />
                    How to get a Free Hunter.io API Key (Free 25 Searches Every Month):
                  </span>
                  <a
                    href="https://hunter.io/api_keys"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-[#2B6CB0] hover:underline flex items-center gap-1 font-medium"
                  >
                    <span>Open Hunter.io API Keys</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <ol className="space-y-1.5 list-decimal list-inside text-[#475569] leading-relaxed">
                  <li>Create a free account or log in at <strong className="text-[#1E293B]">hunter.io</strong>.</li>
                  <li>Click your profile picture in the top-right corner and select <strong className="text-[#1E293B]">API</strong> (or go to <code className="text-[#0F172A]">hunter.io/api_keys</code>).</li>
                  <li>Copy your secret API Key.</li>
                  <li>Paste the key into the input field below and click <strong className="text-[#1E293B]">Save Key</strong>.</li>
                </ol>

                <div className="pt-1 text-[11px] text-[#64748B] bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E2E8F0] flex items-start gap-1.5">
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Instant Demo Mode Available:</strong> You don't need a key to get started! Click any of the pre-set Australian businesses below to test Hunter.io domain searches, executive contact discovery, and pipeline import right now.
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Paste Hunter.io API Key (e.g. abc1234567890abcdef...)"
                className="flex-1 px-3 py-2 text-xs bg-white border border-[#D5D5D0] rounded-lg focus:border-[#E65100] focus:outline-hidden"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveKey}
                  disabled={savingKey || !apiKeyInput.trim()}
                  className="px-3.5 py-2 rounded-lg bg-[#E65100] hover:bg-[#D84315] text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {savingKey ? 'Saving...' : 'Save Key'}
                </button>
                <button
                  onClick={() => handleTestConnection()}
                  disabled={testingConnection}
                  className="px-3 py-2 rounded-lg bg-white border border-[#D5D5D0] hover:bg-[#F0F0EC] text-[#252525] text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {testingConnection ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span>Test Connection</span>
                </button>
                {hasKey && (
                  <button
                    onClick={handleDeleteKey}
                    disabled={deletingKey}
                    className="px-2.5 py-2 rounded-lg bg-white border border-red-200 hover:bg-red-50 text-red-600 text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1"
                    title="Disconnect key"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                )}
              </div>
            </div>

            {connectionStatus && (
              <div
                className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                  connectionStatus.connected
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border border-amber-200 text-amber-800'
                }`}
              >
                {connectionStatus.connected ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{connectionStatus.message}</span>
              </div>
            )}
          </div>

          {/* TAB 1: DOMAIN & COMPANY SEARCH */}
          {activeTab === 'search' && (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="p-4 rounded-xl bg-white border border-[#E7E7E2] shadow-2xs space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#888888]" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleDomainSearch()}
                      placeholder="Enter company website (e.g. sydneycommercialplumbing.com.au) or business name..."
                      className="w-full pl-9 pr-3 py-2 text-xs bg-[#FAF9F5] border border-[#D5D5D0] rounded-lg focus:border-[#E65100] focus:bg-white focus:outline-hidden"
                    />
                  </div>

                  <button
                    onClick={() => handleDomainSearch()}
                    disabled={searching || !searchQuery.trim()}
                    className="px-4 py-2 rounded-lg bg-[#252525] hover:bg-[#3D3D3D] text-white text-xs font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shrink-0 shadow-2xs"
                  >
                    {searching ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Searching Hunter...</span>
                      </>
                    ) : (
                      <>
                        <Target className="w-3.5 h-3.5 text-[#FF9800]" />
                        <span>Find Leads & Emails</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Preset Suggestions */}
                <div className="flex items-center gap-2 flex-wrap text-xs pt-1">
                  <span className="text-[11px] text-[#777777] font-medium">Quick Australian Trade Presets:</span>
                  {PRESET_DOMAINS.map((p) => (
                    <button
                      key={p.domain}
                      type="button"
                      onClick={() => {
                        setSearchQuery(p.domain);
                        handleDomainSearch(p.domain);
                      }}
                      className="px-2 py-0.5 rounded text-[11px] bg-[#F4F4F0] hover:bg-[#EFEFEA] text-[#333333] border border-[#E0E0DA] transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status Message */}
              {searchMessage && (
                <div className="text-xs text-[#555555] px-1 flex items-center justify-between">
                  <span>{searchMessage}</span>
                  {searchSource && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#F0F0EC] text-[#666666] border border-[#E7E7E2]">
                      Source: {searchSource === 'live_hunter_api' ? 'Live Hunter.io API' : 'Verified AU Demo Feed'}
                    </span>
                  )}
                </div>
              )}

              {/* Results List */}
              {searchResults.length > 0 && (
                <div className="space-y-4">
                  {searchResults.map((item) => {
                    const isSelected = selectedDomains.has(item.domain);
                    return (
                      <div
                        key={item.domain}
                        className={`p-4 rounded-xl border transition-all ${
                          isSelected
                            ? 'bg-white border-[#E65100]/40 shadow-xs ring-1 ring-[#E65100]/20'
                            : 'bg-[#FAF9F5] border-[#E7E7E2]'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#F0F0EB] pb-3">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectDomain(item.domain)}
                              className="mt-1 rounded border-[#D5D5D0] text-[#E65100] focus:ring-[#E65100]"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-semibold text-[#252525]">
                                  {item.organization}
                                </h4>
                                {item.industry && (
                                  <span className="px-2 py-0.5 rounded text-[10px] bg-[#F0F0EC] text-[#555555] border border-[#E7E7E2]">
                                    {item.industry}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-xs text-[#666666] mt-1 font-mono text-[11px]">
                                <span className="flex items-center gap-1">
                                  <Globe className="w-3 h-3 text-[#888888]" />
                                  <a
                                    href={`https://${item.domain}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hover:underline text-[#2B6CB0]"
                                  >
                                    {item.domain}
                                  </a>
                                </span>
                                {item.city && (
                                  <span>
                                    📍 {item.city}, {item.state || 'AU'} {item.postalCode || ''}
                                  </span>
                                )}
                                {item.phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3 text-[#888888]" />
                                    <span>{item.phone}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-start sm:self-auto">
                            <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-[#EAF7EE] text-[#1D7A41] border border-[#C6ECD2] flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{item.emails.length} Verified Emails</span>
                            </span>
                          </div>
                        </div>

                        {/* Contacts & Decision Makers */}
                        <div className="pt-3 space-y-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#777777]">
                            Discovered Decision-Makers & Verified Contacts:
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {item.emails.map((e, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 rounded-lg bg-[#FDFDFD] border border-[#EFEFEA] flex items-start justify-between gap-2 hover:border-[#D5D5D0] transition-colors"
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <Mail className="w-3.5 h-3.5 text-[#E65100]" />
                                    <span className="font-mono text-xs font-medium text-[#252525]">
                                      {e.value}
                                    </span>
                                  </div>

                                  {(e.firstName || e.lastName || e.position) && (
                                    <div className="text-xs text-[#555555] font-medium pl-5">
                                      {[e.firstName, e.lastName].filter(Boolean).join(' ')}
                                      {e.position && (
                                        <span className="text-[#777777] font-normal">
                                          {' '}— {e.position}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {e.department && (
                                    <div className="text-[10px] text-[#888888] pl-5 uppercase tracking-wide">
                                      Dept: {e.department}
                                    </div>
                                  )}
                                </div>

                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    {e.confidence}% Score
                                  </span>
                                  {e.linkedin && (
                                    <a
                                      href={e.linkedin}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[#0077B5] hover:text-[#005582] p-0.5"
                                      title="LinkedIn Profile"
                                    >
                                      <Linkedin className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Import Notification */}
              {importResult && (
                <div
                  className={`p-4 rounded-xl text-xs flex items-center justify-between gap-3 ${
                    importResult.success
                      ? 'bg-[#EAF7EE] border border-[#C6ECD2] text-[#1D7A41]'
                      : 'bg-[#FDE8E8] border border-[#F8B4B4] text-[#9B1C1C]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {importResult.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span className="font-medium">{importResult.message}</span>
                  </div>
                  {importResult.success && (
                    <button
                      onClick={onClose}
                      className="px-3 py-1.5 rounded-lg bg-[#1D7A41] text-white text-xs font-semibold hover:bg-[#166333] transition-colors"
                    >
                      View Pipeline Leads
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: EMAIL VERIFIER */}
          {activeTab === 'verifier' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white border border-[#E7E7E2] shadow-2xs space-y-3">
                <div className="text-xs font-semibold text-[#252525]">
                  Test & Verify Lead Email Deliverability
                </div>
                <p className="text-xs text-[#666666]">
                  Validate SMTP handshake, MX records, disposable inbox status, and deliverability confidence score before launching sales outreach.
                </p>

                <form onSubmit={handleVerifyEmail} className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    value={verifyEmailInput}
                    onChange={(e) => setVerifyEmailInput(e.target.value)}
                    placeholder="e.g. brett.callahan@sydneycommercialplumbing.com.au"
                    required
                    className="flex-1 px-3 py-2 text-xs bg-[#FAF9F5] border border-[#D5D5D0] rounded-lg focus:border-[#E65100] focus:bg-white focus:outline-hidden font-mono"
                  />
                  <button
                    type="submit"
                    disabled={verifying}
                    className="px-4 py-2 rounded-lg bg-[#E65100] hover:bg-[#D84315] text-white text-xs font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shrink-0 shadow-2xs"
                  >
                    {verifying ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Verify Email</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {verifyResult && (
                <div className="p-5 rounded-xl border border-[#E7E7E2] bg-white shadow-2xs space-y-4">
                  <div className="flex items-center justify-between border-b border-[#F0F0EB] pb-3">
                    <div>
                      <div className="text-xs text-[#777777]">Deliverability Result for:</div>
                      <div className="font-mono text-sm font-semibold text-[#252525]">
                        {verifyResult.email}
                      </div>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-md text-xs font-semibold border ${
                        verifyResult.status === 'valid'
                          ? 'bg-[#EAF7EE] text-[#1D7A41] border-[#C6ECD2]'
                          : verifyResult.status === 'risky'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-[#FDE8E8] text-[#9B1C1C] border-[#F8B4B4]'
                      }`}
                    >
                      {verifyResult.status.toUpperCase()} ({verifyResult.score}/100)
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-[#FAF9F5] border border-[#E7E7E2]">
                      <div className="text-[#777777] text-[11px]">Valid Syntax</div>
                      <div className="font-semibold text-[#252525] mt-0.5">
                        {verifyResult.regexp ? 'Yes' : 'No'}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-[#FAF9F5] border border-[#E7E7E2]">
                      <div className="text-[#777777] text-[11px]">MX Records Active</div>
                      <div className="font-semibold text-[#252525] mt-0.5">
                        {verifyResult.mxRecords ? 'Active' : 'Missing'}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-[#FAF9F5] border border-[#E7E7E2]">
                      <div className="text-[#777777] text-[11px]">SMTP Verification</div>
                      <div className="font-semibold text-[#252525] mt-0.5">
                        {verifyResult.smtpCheck ? 'Passed' : 'Failed'}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-[#FAF9F5] border border-[#E7E7E2]">
                      <div className="text-[#777777] text-[11px]">Disposable Email</div>
                      <div className="font-semibold text-[#252525] mt-0.5">
                        {verifyResult.disposable ? 'Yes (Risky)' : 'No (Legitimate)'}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-[#555555]">
                    {verifyResult.message}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#E7E7E2] bg-[#F7F7F4] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[#777777] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#E65100]" />
            <span>Hunter.io discovers decision-makers with automatic AI opportunity scoring on import.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-white text-[#555555] border border-[#E7E7E2] hover:bg-[#EFEFEA] transition-colors"
            >
              Close
            </button>

            {activeTab === 'search' && searchResults.length > 0 && (
              <button
                onClick={handleImport}
                disabled={importing || selectedDomains.size === 0}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-[#E65100] hover:bg-[#D84315] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Importing & Scoring...</span>
                  </>
                ) : (
                  <>
                    <Target className="w-3.5 h-3.5" />
                    <span>Import {selectedDomains.size > 0 ? `(${selectedDomains.size})` : ''} Selected to ClientHunter</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
