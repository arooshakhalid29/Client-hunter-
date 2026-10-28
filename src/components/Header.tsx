import React from 'react';
import { 
  Compass, 
  LayoutDashboard, 
  Users, 
  Search, 
  Settings as SettingsIcon, 
  Upload, 
  Building2,
  Database,
  Target
} from 'lucide-react';

interface HeaderProps {
  activeTab: 'dashboard' | 'search' | 'results' | 'pipeline' | 'settings';
  setActiveTab: (tab: 'dashboard' | 'search' | 'results' | 'pipeline' | 'settings') => void;
  savedCount: number;
  resultsCount: number;
  onOpenCsvImport: () => void;
  onOpenHubSpot: () => void;
  onOpenHunter: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  savedCount,
  resultsCount,
  onOpenCsvImport,
  onOpenHubSpot,
  onOpenHunter,
}) => {
  return (
    <header className="bg-white border-b border-[#E7E7E2] sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-15">
          {/* Brand */}
          <div 
            className="flex items-center gap-3 cursor-pointer group" 
            onClick={() => setActiveTab('dashboard')}
          >
            <div className="w-8 h-8 rounded-lg bg-[#78B9E8] flex items-center justify-center text-white shadow-xs">
              <Compass className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-base text-[#252525] tracking-tight">Nexamor</span>
                <span className="text-[#3A7CA5] font-medium text-base">ClientHunter</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[#F0F0EC] text-[#555555] border border-[#E7E7E2]">
                  AU
                </span>
              </div>
              <p className="text-[11px] text-[#777777] hidden sm:block -mt-0.5">
                AI Voice Automation & Prospecting Engine
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 sm:gap-1.5">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                activeTab === 'dashboard'
                  ? 'bg-[#EFEFEA] text-[#252525]'
                  : 'text-[#666666] hover:text-[#252525] hover:bg-[#F7F7F4]'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-[#555555]" />
              <span className="hidden md:inline">Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('search')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                activeTab === 'search'
                  ? 'bg-[#EFEFEA] text-[#252525]'
                  : 'text-[#666666] hover:text-[#252525] hover:bg-[#F7F7F4]'
              }`}
            >
              <Search className="w-3.5 h-3.5 text-[#555555]" />
              <span>Find Clients</span>
            </button>

            <button
              onClick={() => setActiveTab('results')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                activeTab === 'results'
                  ? 'bg-[#EFEFEA] text-[#252525]'
                  : 'text-[#666666] hover:text-[#252525] hover:bg-[#F7F7F4]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-[#555555]" />
              <span className="hidden md:inline">Search Results</span>
              {resultsCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded text-[11px] font-semibold bg-[#EBF5FB] text-[#2B6CB0] border border-[#CDE5F7]">
                  {resultsCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('pipeline')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                activeTab === 'pipeline'
                  ? 'bg-[#EFEFEA] text-[#252525]'
                  : 'text-[#666666] hover:text-[#252525] hover:bg-[#F7F7F4]'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-[#555555]" />
              <span>Pipeline & Leads</span>
              {savedCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded text-[11px] font-semibold bg-[#EAF7EE] text-[#1D7A41] border border-[#C6ECD2]">
                  {savedCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                activeTab === 'settings'
                  ? 'bg-[#EFEFEA] text-[#252525]'
                  : 'text-[#666666] hover:text-[#252525] hover:bg-[#F7F7F4]'
              }`}
            >
              <SettingsIcon className="w-3.5 h-3.5 text-[#555555]" />
              <span className="hidden lg:inline">Settings & Tests</span>
            </button>
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenHunter}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-[#FFF3E0] text-[#E65100] border border-[#FFE0B2] hover:bg-[#FFE0B2] hover:text-[#BF360C] transition-colors shadow-2xs"
              title="Discover Australian businesses, domains, and verified decision-maker emails via Hunter.io"
            >
              <Target className="w-3.5 h-3.5 text-[#E65100]" />
              <span>Hunter.io Leads</span>
            </button>

            <button
              onClick={onOpenHubSpot}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-[#FFF5F2] text-[#E05A38] border border-[#FFD5C8] hover:bg-[#FFEAE3] hover:text-[#C74828] transition-colors shadow-2xs"
              title="Fetch and import companies from HubSpot CRM"
            >
              <Database className="w-3.5 h-3.5 text-[#FF7A59]" />
              <span>HubSpot CRM</span>
            </button>

            <button
              onClick={onOpenCsvImport}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-white text-[#444444] border border-[#E7E7E2] hover:bg-[#F7F7F4] hover:text-[#252525] transition-colors shadow-2xs"
            >
              <Upload className="w-3.5 h-3.5 text-[#78B9E8]" />
              <span>Import CSV</span>
            </button>

            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F7F7F4] border border-[#E7E7E2] text-xs text-[#666666]">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-[11px] font-medium">AU Market Focus</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
