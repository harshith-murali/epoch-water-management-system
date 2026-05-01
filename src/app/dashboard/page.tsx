'use client';

import { useState, useEffect } from 'react';
import { ZoneHeatmap } from '@/components/map/ZoneHeatmap';
import { AnomalyDetailPanel } from '@/components/dashboard/AnomalyDetailPanel';
import { ZoneSummary } from '@/lib/synthetic-data';
import { RedistributionProposal } from '@/lib/fairness';
import { Drop, Warning, TrendDown, MapPin } from '@phosphor-icons/react';
import Link from 'next/link';

export default function Dashboard() {
  const [data, setData] = useState<{
    zones: ZoneSummary[];
    criticalCount: number;
    deficitCount: number;
    currentGini: number;
  } | null>(null);

  const [proposals, setProposals] = useState<RedistributionProposal[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/anomalies')
      .then((res) => res.json())
      .then((json) => {
        setData({
          zones: json.all_zones,
          criticalCount: json.critical_count,
          deficitCount: 0,
          currentGini: 0.03,
        });
      });

    fetch('/api/redistribute')
      .then((res) => res.json())
      .then((json) => {
        setProposals(json.proposals.slice(0, 5));
        setData(prev => prev ? {
          ...prev,
          deficitCount: json.deficit_count,
          currentGini: json.current_gini
        } : null);
      });
  }, []);

  if (!data) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-blue-500 rounded-full opacity-75 blur-md animate-pulse" />
            <div className="relative w-12 h-12 border-2 border-slate-300 border-t-emerald-600 rounded-full animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-slate-900">Initializing Network</p>
            <p className="text-sm text-slate-600 mt-1">Scanning 20 zones...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Premium Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/80 border-b border-slate-200/50 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-lg flex items-center justify-center shadow-lg">
              <Drop size={20} className="text-white" weight="fill" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-950 tracking-tight">UrbanTwin</h1>
              <p className="text-xs text-slate-600">Water Distribution Network</p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4">
            <div className="flex gap-6">
              <StatPill
                icon={<MapPin size={18} />}
                label="Active Zones"
                value={data.zones.length}
                color="emerald"
              />
              <StatPill
                icon={<Warning size={18} />}
                label="Critical"
                value={data.criticalCount}
                color={data.criticalCount > 0 ? "red" : "slate"}
              />
              <StatPill
                icon={<TrendDown size={18} />}
                label="Gini Index"
                value={data.currentGini.toFixed(3)}
                color="blue"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Primary: Map Section (2/3 on desktop) */}
        <section className="lg:col-span-2 flex flex-col gap-6">
          {/* Large Map Container */}
          <div className="relative h-[500px] md:h-[600px] rounded-2xl overflow-hidden shadow-lg border border-white/20 backdrop-blur bg-gradient-to-br from-white to-slate-50">
            <div className="absolute top-4 left-4 z-10 flex gap-3">
              <div className="px-3 py-2 rounded-lg bg-white/90 backdrop-blur shadow-md border border-white/20">
                <p className="text-xs font-medium text-slate-600">Network Status</p>
                <p className="text-sm font-semibold text-emerald-600 mt-0.5">Monitoring</p>
              </div>
            </div>
            <ZoneHeatmap
              zones={data.zones}
              selectedZoneId={selectedZoneId}
              onZoneSelect={(id) => setSelectedZoneId(id)}
            />
          </div>

          {/* Proposal Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {proposals.slice(0, 2).map((proposal, idx) => (
              <ProposalCard key={idx} proposal={proposal} />
            ))}
          </div>
        </section>

        {/* Sidebar (1/3 on desktop) */}
        <section className="flex flex-col gap-6">
          {/* Quick Stats */}
          <div className="space-y-3">
            <MetricCard
              title="Fairness Index"
              value={data.currentGini.toFixed(3)}
              subtitle="Lower is better"
              icon="📊"
              trend="-2.1%"
            />
            <MetricCard
              title="Deficit Zones"
              value={data.deficitCount}
              subtitle="Need redistribution"
              icon="⚠️"
              trend={data.deficitCount > 0 ? "Active" : "Stable"}
            />
          </div>

          {/* Hot Proposals List */}
          <div className="bg-white/80 backdrop-blur border border-white/20 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-950 tracking-tight uppercase">Top Proposals</h3>
              <Link href="/redistribution" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition">
                View All
              </Link>
            </div>

            <div className="space-y-2">
              {proposals.slice(0, 3).map((p, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200/50 hover:border-emerald-300 transition group cursor-pointer">
                  <p className="text-xs font-semibold text-slate-600 group-hover:text-emerald-700 transition">
                    {p.source_name} → {p.dest_name}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">{p.volume_ML} ML at {p.feasibility}</p>
                  <div className="flex gap-2 mt-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">+{(p.gini_improvement * 100).toFixed(1)}%</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">Score {p.score.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Status Alert */}
          <div className="relative overflow-hidden rounded-2xl p-5 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 border border-slate-700/50 shadow-lg">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl" />
            <div className="relative">
              <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold">Engine Status</p>
              <p className="text-sm font-bold text-white mt-2">Detection Running</p>
              <p className="text-xs text-slate-400 mt-3 leading-relaxed">Isolation Forest scanning 30-day rolling history every 15 minutes</p>
              <div className="mt-3 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <p className="text-xs text-emerald-400 font-medium">Active</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Anomaly Detail Panel */}
      <AnomalyDetailPanel
        zoneId={selectedZoneId}
        onClose={() => setSelectedZoneId(null)}
      />
    </div>
  );
}

function StatPill({ icon, label, value, color = "slate" }: any) {
  const colors = {
    emerald: "from-emerald-50 to-emerald-100/50 text-emerald-700 border-emerald-200",
    red: "from-red-50 to-red-100/50 text-red-700 border-red-200",
    blue: "from-blue-50 to-blue-100/50 text-blue-700 border-blue-200",
    slate: "from-slate-50 to-slate-100/50 text-slate-700 border-slate-200",
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-gradient-to-r ${colors[color as keyof typeof colors]}`}>
      {icon}
      <div>
        <p className="text-xs opacity-80 font-medium">{label}</p>
        <p className="text-sm font-bold">{value}</p>
      </div>
    </div>
  );
}

function MetricCard({ title, value, subtitle, icon, trend }: any) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-4 bg-white/80 backdrop-blur border border-white/20 shadow-sm hover:shadow-md transition group cursor-pointer">
      <div className="absolute -right-8 -top-8 w-32 h-32 bg-gradient-to-br from-emerald-400/10 to-blue-500/10 rounded-full blur-3xl" />

      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-slate-950 mt-2">{value}</p>
          <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
        </div>
        <span className="text-2xl">{icon}</span>
      </div>

      {trend && (
        <div className="mt-3 flex items-center gap-1">
          <span className={`text-xs font-semibold ${trend.includes('-') ? 'text-emerald-600' : 'text-red-600'}`}>
            {trend}
          </span>
        </div>
      )}
    </div>
  );
}

function ProposalCard({ proposal }: { proposal: RedistributionProposal }) {
  const feasibilityColor = {
    safe: "bg-emerald-100 text-emerald-700",
    borderline: "bg-yellow-100 text-yellow-700",
    unsafe: "bg-red-100 text-red-700"
  };

  return (
    <div className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-br from-white to-slate-50 border border-white/20 shadow-sm hover:shadow-lg hover:border-emerald-300/50 transition group cursor-pointer">
      <div className="absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br from-emerald-400/20 to-transparent rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition" />

      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Redistribution</p>
            <p className="text-sm font-semibold text-slate-950 mt-1">{proposal.source_name}</p>
          </div>
          <span className={`px-2 py-1 rounded text-xs font-bold ${feasibilityColor[proposal.feasibility as keyof typeof feasibilityColor]}`}>
            {proposal.feasibility}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-6 bg-gradient-to-b from-emerald-500 to-emerald-400 rounded-full" />
          <p className="text-xs text-slate-600">→ {proposal.dest_name}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="px-2 py-1.5 rounded bg-slate-100 border border-slate-200">
            <p className="text-slate-600 font-medium">{proposal.volume_ML} ML</p>
          </div>
          <div className="px-2 py-1.5 rounded bg-emerald-50 border border-emerald-200">
            <p className="text-emerald-700 font-bold">+{(proposal.gini_improvement * 100).toFixed(1)}%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
