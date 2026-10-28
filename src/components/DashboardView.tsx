import React, { useEffect, useState } from 'react';
import { 
  Building2, 
  Target, 
  Flame, 
  CalendarCheck, 
  ArrowUpRight, 
  Search, 
  RefreshCw, 
  Sparkles, 
  MapPin, 
  Layers,
  ArrowRight
} from 'lucide-react';
import { DashboardStats } from '../types.js';

interface DashboardViewProps {
  onStartSearch: () => void;
  onViewPipeline: () => void;
  onSelectLeadById: (id: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onStartSearch,
  onViewPipeline,
  onSelectLeadById,
}) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Banner / Hero */}
      <div className="rounded-2xl bg-white border border-[#E7E7E2] p-6 sm:p-8 shadow-2xs">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F0F0EB] text-[#555555] text-xs font-semibold uppercase tracking-wider mb-3">
            <Sparkles className="w-3.5 h-3.5 text-[#78B9E8]" />
            Nexamor AI Automation Intelligence
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-[#252525] tracking-tight leading-tight">
            Australian Business Prospecting & AI Voice Sales Pipeline
          </h1>
          <p className="mt-2.5 text-[#777777] text-sm leading-relaxed">
            Discover real Australian home services, healthcare clinics, beauty salons, and appointment businesses ready for 24/7 AI phone dispatch, missed-call recovery, and automated booking.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={onStartSearch}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-[#78B9E8] hover:bg-[#68A9D8] text-white transition-colors shadow-2xs"
            >
              <Search className="w-4 h-4" />
              <span>Launch AU Search</span>
            </button>
            <button
              onClick={onViewPipeline}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-white hover:bg-[#F7F7F4] text-[#252525] border border-[#E7E7E2] transition-colors shadow-2xs"
            >
              <span>View Saved Pipeline</span>
              <ArrowUpRight className="w-4 h-4 text-[#777777]" />
            </button>
            <button
              onClick={fetchStats}
              title="Refresh database metrics"
              className="p-2 rounded-lg text-[#777777] hover:text-[#252525] bg-white border border-[#E7E7E2] hover:bg-[#F7F7F4] transition-colors ml-auto"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#78B9E8]' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Discovered */}
        <div className="p-5 rounded-xl bg-white border border-[#E7E7E2] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#777777] text-xs font-medium">
            <span>Total Discovered</span>
            <Building2 className="w-4 h-4 text-[#78B9E8]" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-[#252525] tracking-tight">
              {stats?.totalLeads ?? 0}
            </div>
            <div className="text-[11px] text-[#888888] mt-0.5">Real Australian records</div>
          </div>
        </div>

        {/* Saved Leads */}
        <div className="p-5 rounded-xl bg-white border border-[#E7E7E2] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#777777] text-xs font-medium">
            <span>Saved in CRM</span>
            <Target className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-[#252525] tracking-tight">
              {stats?.savedLeads ?? 0}
            </div>
            <div className="text-[11px] text-emerald-700 mt-0.5">Active prospects in pipeline</div>
          </div>
        </div>

        {/* Qualified Prospects */}
        <div className="p-5 rounded-xl bg-white border border-[#E7E7E2] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#777777] text-xs font-medium">
            <span>Qualified (Score ≥ 60)</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-[#252525] tracking-tight">
              {stats?.qualified ?? 0}
            </div>
            <div className="text-[11px] text-amber-700 mt-0.5">High automation fit</div>
          </div>
        </div>

        {/* High Priority */}
        <div className="p-5 rounded-xl bg-white border border-[#E7E7E2] shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#777777] text-xs font-medium">
            <span>High Priority (Score ≥ 80)</span>
            <CalendarCheck className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-[#252525] tracking-tight">
              {stats?.highPriority ?? 0}
            </div>
            <div className="text-[11px] text-[#2B6CB0] mt-0.5">
              Immediate outreach targets
            </div>
          </div>
        </div>
      </div>

      {/* Analytics & Geographic Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leads by Niche */}
        <div className="p-5 rounded-xl bg-white border border-[#E7E7E2] shadow-2xs lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-[#F0F0EB] pb-3">
            <h3 className="text-xs font-semibold text-[#555555] uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#78B9E8]" />
              Prospect Distribution by Target Industry
            </h3>
            <span className="text-[11px] text-[#888888]">Australia-wide</span>
          </div>

          {stats?.byNiche && stats.byNiche.length > 0 ? (
            <div className="space-y-3 pt-1">
              {stats.byNiche.map((item) => {
                const max = Math.max(...stats.byNiche.map((n) => n.count), 1);
                const pct = (item.count / max) * 100;
                return (
                  <div key={item.niche_name} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-[#252525]">{item.niche_name}</span>
                      <span className="text-[#777777] font-mono">{item.count} leads</span>
                    </div>
                    <div className="w-full h-2 bg-[#F7F7F4] rounded-full overflow-hidden border border-[#E7E7E2]">
                      <div
                        className="h-full bg-[#78B9E8] rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[#888888] italic">
              Run an initial search to populate business distribution data.
            </div>
          )}
        </div>

        {/* State Breakdown & Recent Activity */}
        <div className="p-5 rounded-xl bg-white border border-[#E7E7E2] shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#F0F0EB] pb-3">
            <h3 className="text-xs font-semibold text-[#555555] uppercase tracking-wider flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#78B9E8]" />
              State Coverage
            </h3>
            <span className="text-[11px] text-[#888888]">AU Nodes</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {stats?.byState && stats.byState.length > 0 ? (
              stats.byState.map((st) => (
                <div
                  key={st.state}
                  className="p-2.5 rounded-lg border border-[#E7E7E2] bg-[#FAF9F5] flex justify-between items-center"
                >
                  <span className="font-semibold text-[#252525]">{st.state}</span>
                  <span className="font-mono text-[#777777]">{st.count}</span>
                </div>
              ))
            ) : (
              <div className="col-span-2 p-4 text-center text-xs text-[#888888] italic">
                No state records yet
              </div>
            )}
          </div>

          {/* Recent CRM Updates */}
          <div className="pt-3 border-t border-[#F0F0EB] space-y-2">
            <h4 className="text-[11px] font-semibold text-[#555555] uppercase tracking-wider">
              Recent Lead Activity
            </h4>
            {stats?.recentHistory && stats.recentHistory.length > 0 ? (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {stats.recentHistory.map((h, i) => (
                  <div
                    key={i}
                    onClick={() => onSelectLeadById(h.business_id)}
                    className="p-2 rounded-lg border border-[#E7E7E2] bg-white hover:bg-[#F7F7F4] cursor-pointer transition-colors text-xs flex justify-between items-center"
                  >
                    <div className="truncate max-w-[170px]">
                      <div className="font-medium text-[#252525] truncate">{h.business_name}</div>
                      <div className="text-[10px] text-[#777777]">{h.new_status}</div>
                    </div>
                    <ArrowRight className="w-3 h-3 text-[#999999]" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-[#AAAAAA] italic">No activity recorded yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
