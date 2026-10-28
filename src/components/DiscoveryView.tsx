import React, { useState, useEffect } from 'react';
import { 
  Search, 
  MapPin, 
  Layers, 
  Filter, 
  Check, 
  AlertCircle, 
  Loader2,
  Sparkles,
  Building,
  Database
} from 'lucide-react';
import { AustralianState, NicheDefinition, DiscoveryDiagnostics, BusinessRecord } from '../types.js';

interface DiscoveryViewProps {
  onSearchComplete: (results: BusinessRecord[], diagnostics: DiscoveryDiagnostics) => void;
  onOpenHubSpot?: () => void;
}

const AUSTRALIAN_STATES: { code: AustralianState; name: string }[] = [
  { code: 'NSW', name: 'New South Wales' },
  { code: 'VIC', name: 'Victoria' },
  { code: 'QLD', name: 'Queensland' },
  { code: 'WA', name: 'Western Australia' },
  { code: 'SA', name: 'South Australia' },
  { code: 'ACT', name: 'Australian Capital Territory' },
  { code: 'TAS', name: 'Tasmania' },
  { code: 'NT', name: 'Northern Territory' },
];

const POPULAR_CITIES = [
  { city: 'Sydney', state: 'NSW' as AustralianState },
  { city: 'Melbourne', state: 'VIC' as AustralianState },
  { city: 'Brisbane', state: 'QLD' as AustralianState },
  { city: 'Perth', state: 'WA' as AustralianState },
  { city: 'Adelaide', state: 'SA' as AustralianState },
  { city: 'Gold Coast', state: 'QLD' as AustralianState },
  { city: 'Canberra', state: 'ACT' as AustralianState },
  { city: 'Newcastle', state: 'NSW' as AustralianState },
];

export const DiscoveryView: React.FC<DiscoveryViewProps> = ({ 
  onSearchComplete,
  onOpenHubSpot,
}) => {
  const [niches, setNiches] = useState<NicheDefinition[]>([]);
  const [selectedNicheIds, setSelectedNicheIds] = useState<string[]>(['emergency_plumber', 'general_dentist', 'hair_salon']);
  const [selectedState, setSelectedState] = useState<AustralianState>('NSW');
  const [selectedCity, setSelectedCity] = useState<string>('Sydney');
  const [suburb, setSuburb] = useState<string>('');
  const [postcode, setPostcode] = useState<string>('');
  const [businessName, setBusinessName] = useState<string>('');
  const [radiusKm, setRadiusKm] = useState<number>(25);
  const [limit, setLimit] = useState<number>(20);
  const [minScore, setMinScore] = useState<number>(0);
  const [requireWebsite, setRequireWebsite] = useState<boolean>(false);
  const [requirePhone, setRequirePhone] = useState<boolean>(false);
  const [requireEmail, setRequireEmail] = useState<boolean>(false);

  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiscoveryDiagnostics | null>(null);
  const [activeCategoryTab, setActiveCategoryTab] = useState<string>('all');

  useEffect(() => {
    fetch('/api/niches')
      .then((res) => res.json())
      .then((data) => setNiches(data))
      .catch((err) => console.error('Failed to load niches:', err));

    fetch('/api/discovery/diagnostics')
      .then((res) => res.json())
      .then((data) => setDiagnostics(data))
      .catch((err) => console.error('Failed to load diagnostics:', err));
  }, []);

  const handleToggleNiche = (id: string) => {
    setSelectedNicheIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectCategory = (catId: string) => {
    const categoryNiches = niches.filter((n) => n.category === catId).map((n) => n.id);
    setSelectedNicheIds((prev) => Array.from(new Set([...prev, ...categoryNiches])));
  };

  const handleSelectAllNiches = () => {
    setSelectedNicheIds(niches.map((n) => n.id));
  };

  const handleClearNiches = () => {
    setSelectedNicheIds([]);
  };

  const handleCitySelect = (city: string, state: AustralianState) => {
    setSelectedCity(city);
    setSelectedState(state);
    setSuburb('');
    setPostcode('');
  };

  const handleSubmitSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedNicheIds.length === 0 && !businessName.trim()) {
      setSearchError('Please select at least one target niche or specify a business name.');
      return;
    }
    if (!selectedCity.trim()) {
      setSearchError('Please specify an Australian city or suburb.');
      return;
    }

    setLoading(true);
    setSearchError(null);

    try {
      const response = await fetch('/api/discovery/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nicheIds: selectedNicheIds,
          state: selectedState,
          city: selectedCity.trim(),
          suburb: suburb.trim() || undefined,
          postcode: postcode.trim() || undefined,
          businessName: businessName.trim() || undefined,
          radiusKm,
          limit,
          minScore: minScore > 0 ? minScore : undefined,
          requireWebsite,
          requirePhone,
          requireEmail,
        }),
      });

      let data: any;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(
          response.status === 404
            ? 'API endpoint /api/discovery/search returned 404. Ensure your hosting environment runs the Express server.'
            : `Server returned non-JSON response (${response.status}): ${text.slice(0, 100)}`
        );
      }

      if (!response.ok) {
        throw new Error(data?.error || `Discovery search failed (HTTP ${response.status})`);
      }

      onSearchComplete(data.businesses || [], data.diagnostics);
    } catch (err: any) {
      console.error('Search error:', err);
      setSearchError(err.message || 'Discovery engine could not complete search');
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    { id: 'all', label: 'All Target Categories' },
    { id: 'home_services', label: 'Home Services & Trades' },
    { id: 'beauty_personal_care', label: 'Beauty & Personal Care' },
    { id: 'dental_healthcare', label: 'Dental & Healthcare' },
    { id: 'automotive', label: 'Automotive' },
    { id: 'appointment_other', label: 'Other Appointment' },
  ];

  const filteredNiches = activeCategoryTab === 'all'
    ? niches
    : niches.filter((n) => n.category === activeCategoryTab);

  return (
    <div className="space-y-6">
      {/* Title & Engine Diagnostic Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-white border border-[#E7E7E2] shadow-2xs">
        <div>
          <h2 className="text-lg font-semibold text-[#252525] tracking-tight flex items-center gap-2">
            <Search className="w-5 h-5 text-[#78B9E8]" />
            Australian Business Discovery Engine
          </h2>
          <p className="text-xs text-[#777777] mt-0.5">
            Target live Australian businesses across trades, healthcare, beauty, and automotive for AI automation services.
          </p>
        </div>

        {/* Diagnostic Badges & HubSpot Import */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {onOpenHubSpot && (
            <button
              type="button"
              onClick={onOpenHubSpot}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#FFF5F2] text-[#E05A38] border border-[#FFD5C8] hover:bg-[#FFEAE3] hover:text-[#C74828] transition-colors shadow-2xs"
            >
              <Database className="w-3.5 h-3.5 text-[#FF7A59]" />
              <span>Import from HubSpot CRM</span>
            </button>
          )}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F7F7F4] border border-[#E7E7E2] text-[#444444]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>OpenStreetMap AU: <strong className="text-[#252525]">Live Active</strong></span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F7F7F4] border border-[#E7E7E2] text-[#666666]">
            <span>Google Places: {diagnostics?.configuredProviders.includes('Google Places API') ? <strong className="text-emerald-600">Connected</strong> : <span>Optional / Ready</span>}</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmitSearch} className="space-y-6">
        {/* Step 1: Geography Section */}
        <div className="p-6 rounded-xl bg-white border border-[#E7E7E2] shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#E7E7E2] pb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#78B9E8]" />
              <h3 className="text-xs font-semibold text-[#252525] uppercase tracking-wider">
                1. Australian Geographic Scope
              </h3>
            </div>
            <span className="text-[11px] text-[#777777] font-mono">Australia (AU) Target</span>
          </div>

          {/* Quick city selectors */}
          <div>
            <label className="block text-xs font-medium text-[#555555] mb-2">
              Quick Select Major City
            </label>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_CITIES.map((c) => (
                <button
                  type="button"
                  key={c.city}
                  onClick={() => handleCitySelect(c.city, c.state)}
                  className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                    selectedCity.toLowerCase() === c.city.toLowerCase() && selectedState === c.state
                      ? 'bg-[#78B9E8] text-white font-medium shadow-2xs'
                      : 'bg-[#F7F7F4] text-[#555555] border border-[#E7E7E2] hover:bg-[#EFEFEA] hover:text-[#252525]'
                  }`}
                >
                  {c.city} ({c.state})
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-1">
            <div>
              <label className="block text-xs font-medium text-[#444444] mb-1">State / Territory</label>
              <select
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value as AustralianState)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-[#E7E7E2] text-[#252525] text-sm focus:outline-none focus:ring-1 focus:ring-[#78B9E8]"
              >
                {AUSTRALIAN_STATES.map((st) => (
                  <option key={st.code} value={st.code}>
                    {st.code} — {st.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#444444] mb-1">City or Hub</label>
              <input
                type="text"
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                placeholder="e.g. Sydney, Brisbane..."
                required
                className="w-full px-3 py-2 rounded-lg bg-white border border-[#E7E7E2] text-[#252525] text-sm focus:outline-none focus:ring-1 focus:ring-[#78B9E8]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#444444] mb-1">Specific Suburb (Optional)</label>
              <input
                type="text"
                value={suburb}
                onChange={(e) => setSuburb(e.target.value)}
                placeholder="e.g. Parramatta, Richmond..."
                className="w-full px-3 py-2 rounded-lg bg-white border border-[#E7E7E2] text-[#252525] text-sm focus:outline-none focus:ring-1 focus:ring-[#78B9E8]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#444444] mb-1">Postcode / Radius</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  placeholder="e.g. 2000"
                  maxLength={4}
                  className="w-1/2 px-3 py-2 rounded-lg bg-white border border-[#E7E7E2] text-[#252525] text-sm focus:outline-none focus:ring-1 focus:ring-[#78B9E8]"
                />
                <select
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                  className="w-1/2 px-2 py-2 rounded-lg bg-white border border-[#E7E7E2] text-[#252525] text-sm focus:outline-none focus:ring-1 focus:ring-[#78B9E8]"
                >
                  <option value={10}>10 km</option>
                  <option value={20}>20 km</option>
                  <option value={25}>25 km</option>
                  <option value={35}>35 km</option>
                  <option value={50}>50 km</option>
                </select>
              </div>
            </div>
          </div>

          {/* Business Name direct search */}
          <div className="pt-2 border-t border-[#F0F0EB]">
            <label className="block text-xs font-medium text-[#444444] mb-1">
              Direct Business Name Search (Optional)
            </label>
            <div className="relative">
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Wynyard Dental, Newman Plumbing, Bondi Hair Studio..."
                className="w-full px-3 py-2 pl-9 rounded-lg bg-white border border-[#E7E7E2] text-[#252525] text-sm focus:outline-none focus:ring-1 focus:ring-[#78B9E8]"
              />
              <Building className="w-4 h-4 text-[#888888] absolute left-3 top-2.5" />
            </div>
            <p className="text-[11px] text-[#777777] mt-1">
              Leave blank to discover all businesses matching selected niches in the city.
            </p>
          </div>
        </div>

        {/* Step 2: Target Niches Section */}
        <div className="p-6 rounded-xl bg-white border border-[#E7E7E2] shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#E7E7E2] pb-3 gap-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#78B9E8]" />
              <h3 className="text-xs font-semibold text-[#252525] uppercase tracking-wider">
                2. Target Industry Niches ({selectedNicheIds.length} Selected)
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={handleSelectAllNiches}
                className="px-2.5 py-1 rounded bg-[#F7F7F4] text-[#2B6CB0] border border-[#E7E7E2] hover:bg-[#EFEFEA] transition-colors"
              >
                Select All ({niches.length})
              </button>
              <button
                type="button"
                onClick={handleClearNiches}
                className="px-2.5 py-1 rounded bg-[#F7F7F4] text-[#666666] border border-[#E7E7E2] hover:bg-[#EFEFEA] transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex flex-wrap gap-1.5 pb-2">
            {categories.map((cat) => (
              <button
                type="button"
                key={cat.id}
                onClick={() => setActiveCategoryTab(cat.id)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  activeCategoryTab === cat.id
                    ? 'bg-[#252525] text-white'
                    : 'bg-[#F7F7F4] text-[#666666] border border-[#E7E7E2] hover:bg-[#EFEFEA]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Niche Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-1 max-h-72 overflow-y-auto pr-1">
            {filteredNiches.map((niche) => {
              const isSelected = selectedNicheIds.includes(niche.id);
              return (
                <div
                  key={niche.id}
                  onClick={() => handleToggleNiche(niche.id)}
                  className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all flex items-start gap-2.5 ${
                    isSelected
                      ? 'bg-[#EBF5FB] border-[#78B9E8] text-[#1E5F8A]'
                      : 'bg-white border-[#E7E7E2] text-[#333333] hover:border-[#D0D0C8] hover:bg-[#FAF9F5]'
                  }`}
                >
                  <div
                    className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                      isSelected
                        ? 'bg-[#78B9E8] border-[#78B9E8] text-white'
                        : 'border-[#CCCCCC] bg-white'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium leading-tight truncate text-[#252525]">
                      {niche.name}
                    </p>
                    <p className="text-[10px] text-[#777777] leading-tight truncate mt-0.5">
                      {niche.categoryLabel}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 3: Filtering & Qualification Constraints */}
        <div className="p-6 rounded-xl bg-white border border-[#E7E7E2] shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-[#E7E7E2] pb-3">
            <Filter className="w-4 h-4 text-[#78B9E8]" />
            <h3 className="text-xs font-semibold text-[#252525] uppercase tracking-wider">
              3. Filters & Quality Thresholds
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#444444] mb-1">
                Max Prospects to Fetch ({limit})
              </label>
              <input
                type="range"
                min={5}
                max={50}
                step={5}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-full accent-[#78B9E8]"
              />
              <div className="flex justify-between text-[10px] text-[#888888] mt-1 font-mono">
                <span>5</span>
                <span>20 (Recommended)</span>
                <span>50</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#444444] mb-1">
                Min. Opportunity Score: {minScore > 0 ? `${minScore}/100` : 'None (All)'}
              </label>
              <input
                type="range"
                min={0}
                max={80}
                step={10}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="w-full accent-[#78B9E8]"
              />
              <div className="flex justify-between text-[10px] text-[#888888] mt-1 font-mono">
                <span>0</span>
                <span>60 (Qualified)</span>
                <span>80 (High Priority)</span>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 text-xs text-[#444444] cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireWebsite}
                  onChange={(e) => setRequireWebsite(e.target.checked)}
                  className="rounded border-[#CCCCCC] text-[#78B9E8] focus:ring-[#78B9E8]"
                />
                <span>Must have accessible official website</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-[#444444] cursor-pointer">
                <input
                  type="checkbox"
                  checked={requirePhone}
                  onChange={(e) => setRequirePhone(e.target.checked)}
                  className="rounded border-[#CCCCCC] text-[#78B9E8] focus:ring-[#78B9E8]"
                />
                <span>Must have Australian phone number</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-[#444444] cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireEmail}
                  onChange={(e) => setRequireEmail(e.target.checked)}
                  className="rounded border-[#CCCCCC] text-[#78B9E8] focus:ring-[#78B9E8]"
                />
                <span>Must have verified public email address</span>
              </label>
            </div>
          </div>
        </div>

        {/* Error Alert */}
        {searchError && (
          <div className="p-4 rounded-lg bg-[#FDE8E8] border border-[#F8B4B4] text-[#9B1C1C] flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Discovery Search Notice</p>
              <p className="text-xs mt-0.5">{searchError}</p>
            </div>
          </div>
        )}

        {/* Search Action Bar */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-[#777777]">
            Scans live Australian business registry nodes with deduplication and enrichment.
          </p>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#78B9E8] hover:bg-[#68A9D8] text-white font-medium text-sm transition-colors shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Running AU Discovery...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Run Discovery Search</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
