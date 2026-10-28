import React, { useState, useEffect } from 'react';
import { 
  X, 
  Database, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  RefreshCw, 
  ArrowRight, 
  ExternalLink, 
  Key, 
  Check, 
  Building, 
  Phone, 
  Globe, 
  ShieldCheck,
  TrendingUp,
  Sparkles,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Trash2,
  Info
} from 'lucide-react';
import { BusinessRecord } from '../types.js';

interface HubSpotCompanyItem {
  id: string;
  properties: {
    name?: string;
    domain?: string;
    website?: string;
    phone?: string;
    city?: string;
    state?: string;
    zip?: string;
    address?: string;
    industry?: string;
    description?: string;
    annualrevenue?: string;
    numberofemployees?: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface HubSpotModalProps {
  onClose: () => void;
  onImportSuccess: (count: number, businesses: BusinessRecord[]) => void;
}

export const HubSpotModal: React.FC<HubSpotModalProps> = ({
  onClose,
  onImportSuccess,
}) => {
  const [tokenInput, setTokenInput] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [tokenMasked, setTokenMasked] = useState<string | null>(null);
  const [savingToken, setSavingToken] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    connected: boolean;
    message: string;
  } | null>(null);

  const [fetchingCompanies, setFetchingCompanies] = useState(false);
  const [companies, setCompanies] = useState<HubSpotCompanyItem[]>([]);
  const [fetchSource, setFetchSource] = useState<'live_hubspot_api' | 'demo_crm_feed' | null>(null);
  const [fetchMessage, setFetchMessage] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    importedCount: number;
    message: string;
  } | null>(null);

  const [isGuideOpen, setIsGuideOpen] = useState(true);
  const [copiedScope, setCopiedScope] = useState(false);
  const [deletingToken, setDeletingToken] = useState(false);

  // Check saved config on mount
  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/hubspot/config');
      if (res.ok) {
        const data = await res.json();
        setHasToken(data.hasToken);
        setTokenMasked(data.tokenMasked);
        if (data.hasToken) {
          setIsGuideOpen(false);
        }
      }
    } catch (err) {
      console.error('Failed to load HubSpot config:', err);
    }
  };

  const handleCopyScope = (scope: string) => {
    navigator.clipboard.writeText(scope);
    setCopiedScope(true);
    setTimeout(() => setCopiedScope(false), 2000);
  };

  const handleDeleteToken = async () => {
    if (!confirm('Are you sure you want to disconnect your HubSpot token?')) return;
    setDeletingToken(true);
    try {
      const res = await fetch('/api/hubspot/token', { method: 'DELETE' });
      if (res.ok) {
        setTokenInput('');
        setConnectionStatus(null);
        await fetchConfig();
        setIsGuideOpen(true);
      }
    } catch (err) {
      console.error('Failed to delete token:', err);
    } finally {
      setDeletingToken(false);
    }
  };

  const handleSaveToken = async () => {
    if (!tokenInput.trim()) return;
    setSavingToken(true);
    try {
      const res = await fetch('/api/hubspot/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });
      if (res.ok) {
        setTokenInput('');
        await fetchConfig();
        handleTestConnection(tokenInput.trim());
      }
    } catch (err: any) {
      console.error('Failed to save token:', err);
    } finally {
      setSavingToken(false);
    }
  };

  const handleTestConnection = async (testToken?: string) => {
    setTestingConnection(true);
    setConnectionStatus(null);
    try {
      const res = await fetch('/api/hubspot/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: testToken }),
      });
      const data = await res.json();
      setConnectionStatus(data);
    } catch (err: any) {
      setConnectionStatus({
        connected: false,
        message: err.message || 'Network test failed',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleFetchCompanies = async () => {
    setFetchingCompanies(true);
    setFetchMessage(null);
    setImportResult(null);

    try {
      const res = await fetch('/api/hubspot/fetch-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 30 }),
      });
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies || []);
        setFetchSource(data.source);
        setFetchMessage(data.message);
        // By default select all
        const allIds = new Set<string>((data.companies || []).map((c: HubSpotCompanyItem) => c.id));
        setSelectedIds(allIds);
      }
    } catch (err: any) {
      setFetchMessage('Failed to fetch companies: ' + err.message);
    } finally {
      setFetchingCompanies(false);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === companies.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(companies.map((c) => c.id)));
    }
  };

  const handleImport = async () => {
    const selectedCompanies = companies.filter((c) => selectedIds.has(c.id));
    if (selectedCompanies.length === 0) return;

    setImporting(true);
    setImportResult(null);

    try {
      const res = await fetch('/api/hubspot/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companies: selectedCompanies,
          saveDirectly: true,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setImportResult({
          success: true,
          importedCount: data.importedCount,
          message: `Successfully imported ${data.importedCount} business records from HubSpot into your active prospecting pipeline!`,
        });
        onImportSuccess(data.importedCount, data.businesses || []);
      } else {
        const errorData = await res.json();
        setImportResult({
          success: false,
          importedCount: 0,
          message: errorData.error || 'Import failed',
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

  return (
    <div className="fixed inset-0 z-50 bg-[#252525]/45 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white border border-[#E7E7E2] rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-fadeIn text-[#252525]">
        {/* Header */}
        <div className="p-5 border-b border-[#E7E7E2] bg-[#F7F7F4] flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FF7A59] text-white flex items-center justify-center shadow-xs">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#FF7A59]/10 text-[#FF7A59] border border-[#FF7A59]/20 uppercase">
                  HubSpot CRM Integration
                </span>
                <span className="text-xs text-[#777777]">REST API v3</span>
              </div>
              <h2 className="text-base font-semibold text-[#252525] tracking-tight">
                Import Australian Business Accounts from HubSpot CRM
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

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Connection & Token Setup Section */}
          <div className="p-4 rounded-xl bg-[#FAF9F5] border border-[#E7E7E2] space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-[#FF7A59]" />
                <h3 className="text-xs font-semibold text-[#252525] uppercase tracking-wider">
                  HubSpot Private App Token
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {hasToken ? (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Configured ({tokenMasked})</span>
                  </div>
                ) : (
                  <span className="text-xs text-[#777777] bg-white px-2 py-0.5 rounded border border-[#E7E7E2]">
                    Token Not Stored
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => setIsGuideOpen(!isGuideOpen)}
                  className="flex items-center gap-1 text-xs text-[#2B6CB0] hover:text-[#1D4E89] font-medium"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>{isGuideOpen ? 'Hide Setup Steps' : 'How to get token?'}</span>
                  {isGuideOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Step-by-Step Instructions Card */}
            {isGuideOpen && (
              <div className="p-4 rounded-xl bg-white border border-[#E2E8F0] text-xs space-y-3 text-[#333333] shadow-2xs">
                <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-2">
                  <span className="font-semibold text-[#1E293B] flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-[#FF7A59]" />
                    How to create your HubSpot Private App Token (Takes 1 Minute):
                  </span>
                  <a
                    href="https://app.hubspot.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-[#2B6CB0] hover:underline flex items-center gap-1 font-medium"
                  >
                    <span>Open HubSpot Portal</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <ol className="space-y-2 list-decimal list-inside text-[#475569] leading-relaxed">
                  <li>
                    Log in to HubSpot and click the <strong className="text-[#1E293B]">Settings (gear icon ⚙️)</strong> in the top navigation bar.
                  </li>
                  <li>
                    In the left navigation sidebar, scroll down to <strong className="text-[#1E293B]">Integrations</strong> and click <strong className="text-[#1E293B]">Private Apps</strong>.
                  </li>
                  <li>
                    Click the orange button <strong className="text-[#1E293B]">Create a private app</strong> (name it e.g. <em className="text-[#0F172A]">ClientHunter AI</em>).
                  </li>
                  <li>
                    Go to the <strong className="text-[#1E293B]">Scopes</strong> tab, search for the scope below, and check the box to grant read access:
                    <div className="mt-1.5 ml-4 flex flex-wrap items-center gap-2">
                      <code className="px-2 py-1 rounded bg-[#F1F5F9] border border-[#CBD5E1] text-[11px] font-mono text-[#0F172A]">
                        crm.objects.companies.read
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopyScope('crm.objects.companies.read')}
                        className="px-2 py-1 rounded bg-[#E2E8F0] hover:bg-[#CBD5E1] text-[11px] font-medium text-[#1E293B] transition-colors flex items-center gap-1"
                      >
                        {copiedScope ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-700 font-semibold">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy Scope Name</span>
                          </>
                        )}
                      </button>
                    </div>
                  </li>
                  <li>
                    Click <strong className="text-[#1E293B]">Create app</strong> in the top-right corner, click <strong className="text-[#1E293B]">Continue creating</strong>, then click <strong className="text-[#1E293B]">Show token</strong> and copy your token (format: <code className="text-[#C05621]">pat-na1-...</code>).
                  </li>
                  <li>
                    Paste your token into the input field below and click <strong className="text-[#1E293B]">Save Token</strong>.
                  </li>
                </ol>

                <div className="pt-1 text-[11px] text-[#64748B] bg-[#F8FAFC] p-2.5 rounded-lg border border-[#E2E8F0] flex items-start gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#FF7A59] shrink-0 mt-0.5" />
                  <span>
                    <strong>No token yet?</strong> You can still click <strong>"Fetch Companies"</strong> below to explore authentic Australian business accounts (HVAC, plumbing, dental, electrical) using our built-in verified CRM feed.
                  </span>
                </div>
              </div>
            )}

            <p className="text-xs text-[#666666] leading-relaxed">
              Connect your HubSpot CRM portal to fetch Australian business accounts, evaluate their opportunity score, and generate customized revenue infrastructure outreach.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="flex-1 px-3 py-2 text-xs bg-white border border-[#D5D5D0] rounded-lg focus:border-[#FF7A59] focus:outline-hidden"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveToken}
                  disabled={savingToken || !tokenInput.trim()}
                  className="px-3.5 py-2 rounded-lg bg-[#FF7A59] hover:bg-[#E06545] text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {savingToken ? 'Saving...' : 'Save Token'}
                </button>
                <button
                  onClick={() => handleTestConnection()}
                  disabled={testingConnection}
                  className="px-3 py-2 rounded-lg bg-white border border-[#D5D5D0] hover:bg-[#F0F0EC] text-[#252525] text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {testingConnection ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  <span>Test Connection</span>
                </button>
                {hasToken && (
                  <button
                    onClick={handleDeleteToken}
                    disabled={deletingToken}
                    className="px-2.5 py-2 rounded-lg bg-white border border-red-200 hover:bg-red-50 text-red-600 text-xs font-medium transition-colors disabled:opacity-50 flex items-center gap-1"
                    title="Disconnect HubSpot token"
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
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{connectionStatus.message}</span>
              </div>
            )}
          </div>

          {/* Action Bar: Fetch Companies */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl bg-[#F7F7F4] border border-[#E7E7E2]">
            <div>
              <div className="text-xs font-semibold text-[#252525]">Fetch HubSpot Accounts</div>
              <div className="text-[11px] text-[#777777] mt-0.5">
                {fetchSource === 'live_hubspot_api'
                  ? 'Showing live records from your connected HubSpot portal.'
                  : fetchSource === 'demo_crm_feed'
                  ? 'Showing verified Australian accounts from the HubSpot Demo Feed (EnviroGreen, Pinnacle Plumbing, Bayside Dental, etc.).'
                  : 'Click below to query your CRM companies.'}
              </div>
            </div>

            <button
              onClick={handleFetchCompanies}
              disabled={fetchingCompanies}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#252525] hover:bg-[#3D3D3D] text-white text-xs font-medium transition-colors shadow-2xs disabled:opacity-50"
            >
              {fetchingCompanies ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Querying HubSpot API...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-[#FF7A59]" />
                  <span>Fetch Companies</span>
                </>
              )}
            </button>
          </div>

          {/* Fetched Companies List */}
          {companies.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#252525]">
                    Discovered Companies ({companies.length})
                  </span>
                  <span className="text-[11px] text-[#777777]">
                    Selected: {selectedIds.size} of {companies.length}
                  </span>
                </div>

                <button
                  onClick={toggleSelectAll}
                  className="text-xs text-[#2B6CB0] hover:underline font-medium"
                >
                  {selectedIds.size === companies.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="border border-[#E7E7E2] rounded-xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto max-h-[300px]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#FAF9F5] border-b border-[#E7E7E2] text-[#555555] font-medium sticky top-0 z-10">
                      <tr>
                        <th className="p-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.size === companies.length && companies.length > 0}
                            onChange={toggleSelectAll}
                            className="rounded border-[#D5D5D0] text-[#78B9E8]"
                          />
                        </th>
                        <th className="p-3">Business / Company Name</th>
                        <th className="p-3">Domain / Website</th>
                        <th className="p-3">Location</th>
                        <th className="p-3">Industry</th>
                        <th className="p-3">Phone</th>
                        <th className="p-3">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFEFEA]">
                      {companies.map((comp) => {
                        const isSelected = selectedIds.has(comp.id);
                        const p = comp.properties;
                        return (
                          <tr
                            key={comp.id}
                            onClick={() => toggleSelect(comp.id)}
                            className={`cursor-pointer hover:bg-[#FAF9F5] transition-colors ${
                              isSelected ? 'bg-[#EBF5FB]/30' : ''
                            }`}
                          >
                            <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(comp.id)}
                                className="rounded border-[#D5D5D0] text-[#78B9E8]"
                              />
                            </td>
                            <td className="p-3 font-medium text-[#252525]">
                              <div className="flex items-center gap-1.5">
                                <Building className="w-3.5 h-3.5 text-[#FF7A59]" />
                                <span>{p.name || 'Unnamed Company'}</span>
                              </div>
                            </td>
                            <td className="p-3 font-mono text-[11px] text-[#555555]">
                              {p.domain || p.website ? (
                                <span className="flex items-center gap-1">
                                  <Globe className="w-3 h-3 text-[#777777]" />
                                  <span>{p.domain || p.website}</span>
                                </span>
                              ) : (
                                <span className="text-[#999999]">—</span>
                              )}
                            </td>
                            <td className="p-3 text-[#555555]">
                              {p.city ? `${p.city}, ${p.state || 'AU'}` : p.state || 'Australia'}
                            </td>
                            <td className="p-3 text-[#555555]">
                              <span className="px-2 py-0.5 rounded text-[10px] bg-[#F0F0EC] text-[#555555] border border-[#E7E7E2]">
                                {p.industry ? p.industry.replace(/_/g, ' ') : 'General'}
                              </span>
                            </td>
                            <td className="p-3 font-mono text-[11px] text-[#555555]">
                              {p.phone ? (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-[#777777]" />
                                  <span>{p.phone}</span>
                                </span>
                              ) : (
                                <span className="text-[#999999]">—</span>
                              )}
                            </td>
                            <td className="p-3 font-mono text-[11px] text-[#555555]">
                              {p.annualrevenue ? `$${Number(p.annualrevenue).toLocaleString()}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Import Result Notification */}
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

        {/* Footer */}
        <div className="p-4 border-t border-[#E7E7E2] bg-[#F7F7F4] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[#777777] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#FF7A59]" />
            <span>Automatic AI opportunity scoring & multi-source verification applied on import.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-white text-[#555555] border border-[#E7E7E2] hover:bg-[#EFEFEA] transition-colors"
            >
              Close
            </button>

            <button
              onClick={handleImport}
              disabled={importing || selectedIds.size === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-[#FF7A59] hover:bg-[#E06545] text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
            >
              {importing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Importing & Scoring...</span>
                </>
              ) : (
                <>
                  <Database className="w-3.5 h-3.5" />
                  <span>Import {selectedIds.size > 0 ? `(${selectedIds.size})` : ''} Selected to ClientHunter</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
