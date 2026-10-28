import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  ShieldCheck, 
  Radio, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Play, 
  Loader2, 
  Trash2, 
  Plus, 
  Key,
  Database,
  Target
} from 'lucide-react';
import { TestResultItem } from '../types.js';

interface SettingsViewProps {
  onOpenHubSpot?: () => void;
  onOpenHunter?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onOpenHubSpot, onOpenHunter }) => {
  const [envStatus, setEnvStatus] = useState<{ hasGeminiKey: boolean; hasGooglePlacesKey: boolean }>({
    hasGeminiKey: false,
    hasGooglePlacesKey: false,
  });
  const [hubspotStatus, setHubspotStatus] = useState<{ hasToken: boolean; tokenMasked: string | null }>({
    hasToken: false,
    tokenMasked: null,
  });
  const [hunterStatus, setHunterStatus] = useState<{ hasKey: boolean; keyMasked: string | null }>({
    hasKey: false,
    keyMasked: null,
  });
  const [suppressionList, setSuppressionList] = useState<any[]>([]);
  const [weights, setWeights] = useState({
    industryFitWeight: 25,
    appointmentCallWeight: 25,
    operationalComplexityWeight: 20,
    automationOpportunityWeight: 15,
    evidenceConfidenceWeight: 15,
  });
  const [savingWeights, setSavingWeights] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Suppression inputs
  const [newEntityType, setNewEntityType] = useState<'domain' | 'email' | 'phone' | 'business_name'>('domain');
  const [newEntityValue, setNewEntityValue] = useState('');
  const [newReason, setNewReason] = useState('Australian anti-spam / Do-Not-Contact compliance');
  const [addingSuppression, setAddingSuppression] = useState(false);

  // Acceptance Tests State
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<{
    total: number;
    passedCount: number;
    failedCount: number;
    results: TestResultItem[];
    allPassed: boolean;
  } | null>(null);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setEnvStatus(data.env || {});
        setSuppressionList(data.suppression || []);
        if (data.settings?.scoring_weights) {
          setWeights(data.settings.scoring_weights);
        }
      }

      const hsRes = await fetch('/api/hubspot/config');
      if (hsRes.ok) {
        const hsData = await hsRes.json();
        setHubspotStatus(hsData);
      }

      const hntRes = await fetch('/api/hunter/config');
      if (hntRes.ok) {
        const hntData = await hntRes.json();
        setHunterStatus(hntData);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveWeights = async () => {
    setSavingWeights(true);
    setSaveMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'scoring_weights', value: weights }),
      });
      if (res.ok) {
        setSaveMessage('Scoring weights saved successfully.');
        setTimeout(() => setSaveMessage(null), 3000);
      }
    } catch (err: any) {
      setSaveMessage('Failed to save weights: ' + err.message);
    } finally {
      setSavingWeights(false);
    }
  };

  const handleAddSuppression = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEntityValue.trim()) return;
    setAddingSuppression(true);
    try {
      const res = await fetch('/api/suppression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: newEntityType,
          entityValue: newEntityValue.trim(),
          reason: newReason,
        }),
      });
      if (res.ok) {
        setNewEntityValue('');
        fetchSettings();
      }
    } catch (err) {
      console.error('Failed to add suppression:', err);
    } finally {
      setAddingSuppression(false);
    }
  };

  const handleDeleteSuppression = async (id: string) => {
    try {
      await fetch(`/api/suppression/${id}`, { method: 'DELETE' });
      setSuppressionList((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error('Delete suppression failed:', err);
    }
  };

  const handleRunAcceptanceTests = async () => {
    setTesting(true);
    setTestResults(null);
    try {
      const res = await fetch('/api/tests/run', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setTestResults(data);
      }
    } catch (err) {
      console.error('Test run failed:', err);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn max-w-5xl text-[#252525]">
      {/* Title */}
      <div className="p-5 rounded-xl bg-white border border-[#E7E7E2] shadow-2xs">
        <h2 className="text-lg font-semibold text-[#252525] flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-[#78B9E8]" />
          Platform Architecture & Provider Configuration
        </h2>
        <p className="text-xs text-[#777777] mt-0.5">
          Configure Australian data providers, calibrate scoring weights, manage anti-spam suppression, and verify system reliability.
        </p>
      </div>

      {/* 1. Discovery Provider Status */}
      <div className="p-6 rounded-xl bg-white border border-[#E7E7E2] shadow-2xs space-y-4">
        <h3 className="text-xs font-semibold text-[#555555] uppercase tracking-wider flex items-center gap-2">
          <Radio className="w-4 h-4 text-[#78B9E8]" />
          1. Australian Discovery Providers
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* OpenStreetMap Provider */}
          <div className="p-4 rounded-xl border border-[#E7E7E2] bg-[#FAF9F5] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-[#252525]">OpenStreetMap AU Engine</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#EAF7EE] text-[#1D7A41] border border-[#C6ECD2]">
                Active & Live
              </span>
            </div>
            <p className="text-[#666666]">
              Real-time query engine targeting Australian nodes with full address resolution, phone numbers, and website URLs.
            </p>
            <div className="text-[11px] text-[#777777] font-mono">
              Country Scope: Australia (countrycodes=au)
            </div>
          </div>

          {/* Google Places Provider */}
          <div className="p-4 rounded-xl border border-[#E7E7E2] bg-[#FAF9F5] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-[#252525]">Google Places API (New)</span>
              {envStatus.hasGooglePlacesKey ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#EAF7EE] text-[#1D7A41] border border-[#C6ECD2]">
                  Configured
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#F7F7F4] text-[#888888] border border-[#E7E7E2]">
                  Optional
                </span>
              )}
            </div>
            <p className="text-[#666666]">
              Optional secondary provider for enriched opening hours, rating metadata, and phone verification.
            </p>
            <div className="text-[11px] text-[#777777] font-mono">
              Env: GOOGLE_PLACES_API_KEY
            </div>
          </div>

          {/* HubSpot CRM Provider */}
          <div className="p-4 rounded-xl border border-[#E7E7E2] bg-[#FAF9F5] space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-[#252525]">HubSpot CRM Account Engine</span>
              {hubspotStatus.hasToken ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#EAF7EE] text-[#1D7A41] border border-[#C6ECD2]">
                  Token Configured ({hubspotStatus.tokenMasked})
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#FFF5F2] text-[#E05A38] border border-[#FFD5C8]">
                  Verified Demo Feed Active
                </span>
              )}
            </div>
            <p className="text-[#666666]">
              Direct CRM company discovery and pipeline import. Allows querying authentic Australian business records directly from HubSpot via REST API v3, scoring them for AI automation, and generating tailored revenue infrastructure pitches.
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-[#EFEFEA]">
              <div className="text-[11px] text-[#777777] font-mono">
                Token: {hubspotStatus.hasToken ? hubspotStatus.tokenMasked : 'Use "Configure HubSpot CRM" to enter Private App token'}
              </div>
              {onOpenHubSpot && (
                <button
                  type="button"
                  onClick={onOpenHubSpot}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FF7A59] hover:bg-[#E06545] text-white text-xs font-medium transition-colors shadow-2xs shrink-0 self-start sm:self-auto"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>Configure / Import HubSpot</span>
                </button>
              )}
            </div>
          </div>

          {/* Hunter.io Intelligence Provider */}
          <div className="p-4 rounded-xl border border-[#E7E7E2] bg-[#FAF9F5] space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-[#252525]">Hunter.io Domain & Lead Intelligence</span>
              {hunterStatus.hasKey ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#EAF7EE] text-[#1D7A41] border border-[#C6ECD2]">
                  API Key Configured ({hunterStatus.keyMasked})
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#FFF3E0] text-[#E65100] border border-[#FFE0B2]">
                  Verified AU Demo Feed Active
                </span>
              )}
            </div>
            <p className="text-[#666666]">
              Discover decision-makers, direct phone numbers, and verified email addresses across Australian companies and domains. Supports full lead enrichment and deliverability verification before sales outreach.
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-[#EFEFEA]">
              <div className="text-[11px] text-[#777777] font-mono">
                Key: {hunterStatus.hasKey ? hunterStatus.keyMasked : 'Use "Configure / Search Hunter.io" to enter API Key (Free tier 25/mo)'}
              </div>
              {onOpenHunter && (
                <button
                  type="button"
                  onClick={onOpenHunter}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E65100] hover:bg-[#D84315] text-white text-xs font-medium transition-colors shadow-2xs shrink-0 self-start sm:self-auto"
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>Configure / Search Hunter.io</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Automated Test Suite Runner */}
      <div className="p-6 rounded-xl bg-white border border-[#E7E7E2] shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#F0F0EB] pb-3">
          <div>
            <h3 className="text-xs font-semibold text-[#555555] uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#78B9E8]" />
              2. System Acceptance Tests & Live Verification
            </h3>
            <p className="text-xs text-[#777777] mt-0.5">
              Run automated checks validating discovery, scoring, website auditing, social media extraction, and lead persistence.
            </p>
          </div>

          <button
            onClick={handleRunAcceptanceTests}
            disabled={testing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-[#78B9E8] hover:bg-[#68A9D8] text-white transition-colors disabled:opacity-50 shadow-2xs"
          >
            {testing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Running Test Suite...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Run Acceptance Tests</span>
              </>
            )}
          </button>
        </div>

        {/* Test Results Display */}
        {testResults && (
          <div className="space-y-4 pt-1">
            <div className={`p-4 rounded-xl border flex items-center justify-between text-xs ${
              testResults.allPassed
                ? 'bg-[#EAF7EE] border-[#C6ECD2] text-[#1D7A41]'
                : 'bg-[#FDE8E8] border-[#F8B4B4] text-[#9B1C1C]'
            }`}>
              <div className="flex items-center gap-2">
                {testResults.allPassed ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
                <div>
                  <span className="font-semibold text-sm">
                    {testResults.allPassed ? 'All Acceptance Criteria Passed' : 'Some Tests Failed'}
                  </span>
                  <p className="text-[11px] mt-0.5">
                    {testResults.passedCount} of {testResults.total} acceptance tests verified successfully.
                  </p>
                </div>
              </div>
              <span className="font-mono text-sm font-bold">
                {testResults.passedCount}/{testResults.total} Passed
              </span>
            </div>

            {/* Test items list */}
            <div className="divide-y divide-[#E7E7E2] border border-[#E7E7E2] rounded-xl overflow-hidden bg-white text-xs max-h-96 overflow-y-auto">
              {testResults.results.map((t) => (
                <div key={t.id} className="p-3 flex items-start justify-between gap-3 hover:bg-[#FAF9F5]">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 font-mono text-[11px] text-[#888888] w-6 shrink-0">#{t.id}</span>
                    <div>
                      <p className="font-medium text-[#252525]">{t.criterion}</p>
                      <p className="text-[11px] text-[#777777] mt-0.5 font-mono">{t.details}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-[#888888] font-mono">{t.executionTimeMs}ms</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      t.passed
                        ? 'bg-[#EAF7EE] text-[#1D7A41] border-[#C6ECD2]'
                        : 'bg-[#FDE8E8] text-[#9B1C1C] border-[#F8B4B4]'
                    }`}>
                      {t.passed ? 'PASSED' : 'FAILED'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. Suppression List & Do Not Contact */}
      <div className="p-6 rounded-xl bg-white border border-[#E7E7E2] shadow-2xs space-y-4">
        <h3 className="text-xs font-semibold text-[#555555] uppercase tracking-wider flex items-center gap-2">
          <Key className="w-4 h-4 text-[#78B9E8]" />
          3. Anti-Spam Compliance & Suppression List ({suppressionList.length})
        </h3>
        <p className="text-xs text-[#777777]">
          Add domains, emails, or phone numbers to prevent outreach and comply with Australian communications regulations.
        </p>

        <form onSubmit={handleAddSuppression} className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1">
          <select
            value={newEntityType}
            onChange={(e: any) => setNewEntityType(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white border border-[#E7E7E2] text-xs text-[#252525]"
          >
            <option value="domain">Domain (e.g. acme.com.au)</option>
            <option value="email">Email Address</option>
            <option value="phone">Phone Number</option>
            <option value="business_name">Business Name</option>
          </select>

          <input
            type="text"
            value={newEntityValue}
            onChange={(e) => setNewEntityValue(e.target.value)}
            placeholder="Value to suppress..."
            required
            className="sm:col-span-2 px-3 py-2 rounded-lg bg-white border border-[#E7E7E2] text-xs text-[#252525] focus:ring-1 focus:ring-[#78B9E8]"
          />

          <button
            type="submit"
            disabled={addingSuppression}
            className="px-3 py-2 rounded-lg bg-[#78B9E8] text-white hover:bg-[#68A9D8] text-xs font-medium transition-colors shadow-2xs"
          >
            Add to Suppression
          </button>
        </form>

        {suppressionList.length > 0 && (
          <div className="divide-y divide-[#E7E7E2] border border-[#E7E7E2] rounded-xl overflow-hidden bg-white text-xs max-h-48 overflow-y-auto">
            {suppressionList.map((s) => (
              <div key={s.id} className="p-2.5 flex items-center justify-between hover:bg-[#FAF9F5]">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-[#888888] uppercase">{s.entity_type}:</span>
                  <span className="font-mono text-xs text-[#252525]">{s.entity_value}</span>
                  <span className="text-[10px] text-[#777777]">({s.reason})</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteSuppression(s.id)}
                  className="p-1 text-[#888888] hover:text-red-600 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
