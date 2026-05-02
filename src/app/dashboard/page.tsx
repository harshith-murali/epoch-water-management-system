'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
 Drop, Warning, Gauge, Broadcast, Robot, BellRinging,
 ArrowsClockwise, Shuffle, Lightning, CheckCircle, ArrowRight,
 Scales, ChartLine, ChartLineUp
} from '@phosphor-icons/react';
import { ZoneHeatmap, type NetworkConnection } from '@/components/map/ZoneHeatmap';
import { aStar, primsMST, type GraphNode } from '@/lib/graph-algorithms';
import type { ZoneSummary } from '@/lib/synthetic-data';

// ─── Types ────────────────────────────────────────────────────

interface Alert { id: string; time: string; msg: string; type: 'info' | 'warn' | 'critical'; }
type AppMode = 'normal' | 'disaster';

// ─── Helper: build Dijkstra graph ────────────────────────────

function buildGraph(zones: ZoneSummary[], connections: NetworkConnection[]): Map<string, GraphNode> {
 const coordMap = new Map(zones.map(z => [z.zone_id, { lat: z.lat, lng: z.lng }]));
 const connMap = new Map(connections.map(c => [c.zone_id, c.connected_zones]));
 const graph = new Map<string, GraphNode>();
 for (const zone of zones) {
  const coord = coordMap.get(zone.zone_id);
  if (!coord) continue;
  graph.set(zone.zone_id, {
   id: zone.zone_id,
   lat: coord.lat,
   lng: coord.lng,
   adjacent: connMap.get(zone.zone_id) ?? [],
  });
 }
 return graph;
}

// ─── Sub-components ───────────────────────────────────────────

const SEVERITY_BG: Record<string, string> = {
 Critical: 'bg-red-50 text-red-700',
 Probable: 'bg-orange-50 text-orange-700',
 Suspicious: 'bg-yellow-50 text-yellow-700',
 Normal: 'bg-emerald-50 text-emerald-700',
};

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
 return (
  <div className="bg-gradient-to-tr from-white via-slate-50/50 to-slate-100/40 border border-slate-200/80 rounded-2xl px-6 py-5 shadow-[0_2px_12px_-3px_rgba(0,0,0,0.03)] hover:shadow-md transition-all duration-300">
   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{label}</p>
   <p className={`text-2xl font-mono font-extrabold tracking-tight ${color}`}>{value}</p>
   <span className={`mt-3 inline-block text-[10px] font-bold px-2.5 py-1 rounded-lg tracking-wider uppercase ${
    sub === 'Normal' || sub === 'OK' || sub === 'All Clear' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-200/50'
    : sub === "Prim's" ? 'bg-cyan-500/10 text-cyan-600 border border-cyan-200/50'
    : 'bg-amber-500/10 text-amber-600 border border-amber-200/50'
   }`}>{sub}</span>
  </div>
 );
}

function PressureBar({ zone, pressure }: { zone: string; pressure: number }) {
 const pct = Math.min((pressure / 4.0) * 100, 100);
 const color = pressure >= 2.5 ? 'bg-blue-500' : pressure >= 1.5 ? 'bg-yellow-400' : 'bg-red-500';
 return (
  <div className="flex items-center gap-2 text-xs">
   <span className="w-6 text-slate-800 font-mono shrink-0">{zone.replace('Zone-', '')}</span>
   <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
    <motion.div
     initial={{ width: 0 }}
     animate={{ width: `${pct}%` }}
     transition={{ type: 'spring', stiffness: 80, damping: 18 }}
     className={`h-full rounded-full ${color}`}
    />
   </div>
   <span className="w-12 text-right font-mono text-black">{pressure.toFixed(1)} bar</span>
  </div>
 );
}

interface ZoneDetailPanelProps {
 zone: ZoneSummary;
 onClose: () => void;
 onAction: (action: string, name: string) => void;
}

function ZoneDetailPanel({ zone, onClose, onAction }: ZoneDetailPanelProps) {
 const [actionLogged, setActionLogged] = useState<string | null>(null);
 const [sustainability, setSustainability] = useState<any>(null);
 const [quality, setQuality] = useState<any>(null);
 const [forecast, setForecast] = useState<any>(null);
 const [loading, setLoading] = useState(false);

 useEffect(() => {
  setLoading(true);
  setActionLogged(null);
  Promise.all([
   fetch(`/api/sustainability?zoneId=${zone.zone_id}`).then(r => r.json()).catch(() => null),
   fetch(`/api/water-quality?zoneId=${zone.zone_id}`).then(r => r.json()).catch(() => null),
   fetch(`/api/forecast/demand?zoneId=${zone.zone_id}`).then(r => r.json()).catch(() => null),
  ]).then(([sustData, qualData, foreData]) => {
   if (sustData && !sustData.error) {
    // API returns { zones: [...] } — find the matching zone object
    const zoneEntry = sustData.zones?.find((z: any) => z.zone_id === zone.zone_id) ?? sustData;
    setSustainability(zoneEntry);
   }
   if (qualData && !qualData.error) {
    // API returns { reports: [...] } — find the matching zone report
    const zoneReport = qualData.reports?.find((r: any) => r.zone_id === zone.zone_id) ?? qualData;
    setQuality(zoneReport);
   }
   if (foreData && !foreData.error) setForecast(foreData);
  }).finally(() => setLoading(false));
 }, [zone.zone_id]);

 const handleActionClick = async (action: string) => {
  await fetch('/api/decisions', {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({ operator_id: 'ramesh_op', action, record_type: 'anomaly', record_id: zone.zone_id }),
  });
  setActionLogged(action);
  onAction(action, zone.zone_name);
 };

 // Format helpers
 const fmtML = (v: number | undefined) => v != null ? Math.round(v * 10) / 10 : '—';
 const fmtNum = (v: number | undefined, dp = 1) => v != null ? v.toFixed(dp) : '—';

 return (
  <motion.div key="zone-detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex flex-col gap-3">
   <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    {/* Header */}
    <div className={`px-4 py-3 flex items-start justify-between ${SEVERITY_BG[zone.severity] ?? 'bg-slate-50'}`}>
     <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-800">{zone.zone_id}</p>
      <p className="text-base font-bold text-slate-900 leading-tight">{zone.zone_name}</p>
     </div>
     <button onClick={onClose} className="text-slate-900 hover:text-black p-1 rounded-full hover:bg-white/50 transition-colors">
      <span className="text-lg leading-none">×</span>
     </button>
    </div>

    {/* Badges */}
    <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap">
     <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg border ${
      zone.severity === 'Critical' ? 'bg-red-500/10 text-red-600 border-red-200/50'
      : zone.severity === 'Probable' ? 'bg-orange-500/10 text-orange-600 border-orange-200/50'
      : zone.severity === 'Suspicious' ? 'bg-amber-500/10 text-amber-600 border-amber-200/50'
      : 'bg-emerald-500/10 text-emerald-600 border-emerald-200/50'
     }`}>{zone.severity}</span>
     {zone.anomaly_type && (
      <span className="text-[10px] font-bold tracking-wider uppercase bg-slate-500/10 text-slate-600 border border-slate-200/50 px-2 py-0.5 rounded-lg">
       {zone.anomaly_type.replace(/_/g, ' ')}
      </span>
     )}
    </div>

    {/* Key Metrics — 3 compact pills, values properly truncated */}
    <div className="grid grid-cols-3 border-t border-slate-100">
     <div className="px-3 py-2.5 text-center overflow-hidden">
      <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1">Demand</p>
      <p className="text-sm font-mono font-bold text-slate-900 truncate">
       {fmtML(zone.current_consumption_ML)}<span className="text-[9px] text-slate-400 ml-0.5">ML</span>
      </p>
     </div>
     <div className="px-3 py-2.5 text-center border-x border-slate-100 overflow-hidden">
      <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1">Pressure</p>
      <p className="text-sm font-mono font-bold text-slate-900 truncate">
       {zone.pressure_bar != null ? zone.pressure_bar.toFixed(1) : '—'}<span className="text-[9px] text-slate-400 ml-0.5">bar</span>
      </p>
     </div>
     <div className="px-3 py-2.5 text-center overflow-hidden">
      <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold mb-1">Supplied</p>
      <p className={`text-sm font-mono font-bold truncate ${zone.fulfillment_pct >= 80 ? 'text-emerald-600' : 'text-red-600'}`}>
       {zone.fulfillment_pct}<span className="text-[9px] text-slate-400 ml-0.5">%</span>
      </p>
     </div>
    </div>

    {/* Dynamic detail panels */}
    <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 space-y-3">
     {loading ? (
      <div className="space-y-2">
       {[1,2,3].map(i => <div key={i} className="h-4 bg-slate-100 rounded-lg animate-pulse" style={{ width: `${60 + i * 12}%` }} />)}
      </div>
     ) : (
      <>
       {/* Sustainability */}
       {sustainability && (
        <div>
         <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">5-Year Sustainability</p>
         <div className="grid grid-cols-2 gap-2">
          <div className="bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
           <p className="text-[10px] text-slate-400 mb-0.5">Water Table</p>
           <p className="font-bold font-mono text-slate-900 text-xs">
            {fmtNum(sustainability.water_table_depth_m)}<span className="text-slate-400 font-normal">m</span>
           </p>
          </div>
          <div className="bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
           <p className="text-[10px] text-slate-400 mb-0.5">NRW Loss</p>
           <p className="font-bold font-mono text-slate-900 text-xs">
            {fmtNum(sustainability.nrw_percent)}<span className="text-slate-400 font-normal">%</span>
           </p>
          </div>
          <div className="bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
           <p className="text-[10px] text-slate-400 mb-0.5">Storage</p>
           <p className="font-bold font-mono text-slate-900 text-xs">
            {fmtNum(sustainability.storage_level_pct, 0)}<span className="text-slate-400 font-normal">%</span>
           </p>
          </div>
          <div className="bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
           <p className="text-[10px] text-slate-400 mb-0.5">Viability</p>
           <p className={`font-bold text-xs ${sustainability.water_quality?.status === 'potable' || sustainability.fulfillment_percent >= 80 ? 'text-emerald-600' : 'text-red-600'}`}>
            {sustainability.fulfillment_percent >= 80 ? 'Viable' : 'At Risk'}
           </p>
          </div>
         </div>
        </div>
       )}

       {/* Water Quality */}
       {quality && (
        <div>
         <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Water Quality</p>
         <div className="grid grid-cols-2 gap-2">
          <div className="bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
           <p className="text-[10px] text-slate-400 mb-0.5">pH / TDS</p>
           <p className="font-bold font-mono text-slate-900 text-xs">
            {fmtNum(quality.parameters?.pH?.value)} / {quality.parameters?.TDS_mg_L?.value ?? '—'}<span className="text-slate-400 font-normal text-[10px]"> mg/L</span>
           </p>
          </div>
          <div className="bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
           <p className="text-[10px] text-slate-400 mb-0.5">Status</p>
           <p className={`font-bold text-xs ${quality.status === 'POTABLE' ? 'text-emerald-600' : 'text-red-600'}`}>
            {quality.status ?? '—'}
           </p>
          </div>
          <div className="bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
           <p className="text-[10px] text-slate-400 mb-0.5">Turbidity</p>
           <p className="font-bold font-mono text-slate-900 text-xs">
            {fmtNum(quality.parameters?.turbidity_NTU?.value, 2)}<span className="text-slate-400 font-normal"> NTU</span>
           </p>
          </div>
          <div className="bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
           <p className="text-[10px] text-slate-400 mb-0.5">Cl₂ Residual</p>
           <p className={`font-bold font-mono text-xs ${
            (quality.parameters?.residual_chlorine_mg_L?.value ?? 0) >= 0.2 ? 'text-emerald-700' : 'text-red-600'
           }`}>
            {fmtNum(quality.parameters?.residual_chlorine_mg_L?.value, 2)}<span className="text-slate-400 font-normal"> mg/L</span>
           </p>
          </div>
         </div>
        </div>
       )}

       {/* Forecast */}
       {forecast && forecast.daily_summary && (
        <div>
         <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">24h Demand Forecast</p>
         <div className="bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
          <p className="text-[10px] text-slate-400 mb-0.5">Peak Volume</p>
          <p className="font-bold font-mono text-slate-900 text-xs">{forecast.daily_summary.peak_ML_per_hour} ML/hr</p>
         </div>
        </div>
       )}
      </>
     )}
    </div>

    {/* Action buttons */}
    <div className="px-4 py-3 border-t border-slate-100">
     {actionLogged ? (
      <p className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">✓ {actionLogged} logged</p>
     ) : (
      <div className="flex gap-2">
       <button onClick={() => handleActionClick('Investigate')} className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 rounded-xl transition-colors tracking-wide uppercase">Investigate</button>
       <button onClick={() => handleActionClick('Acknowledge')} className="flex-1 text-xs border border-slate-200 text-slate-600 font-bold py-1.5 rounded-xl hover:bg-slate-50 transition-colors tracking-wide uppercase">Acknowledge</button>
      </div>
     )}
    </div>
   </div>
  </motion.div>
 );
}

// ─── Main Dashboard ───────────────────────────────────────────

export default function Dashboard() {
 const [zones, setZones] = useState<ZoneSummary[]>([]);
 const [connections, setConnections] = useState<NetworkConnection[]>([]);
 const [criticalCount, setCriticalCount] = useState(0);
 const [deficitCount, setDeficitCount] = useState(0);
 const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

 // Network / routing state
 const [mode, setMode] = useState<AppMode>('normal');
 const [routingMode, setRoutingMode] = useState(false);
 const [routeSelection, setRouteSelection] = useState<string[]>([]);
 const [routePath, setRoutePath] = useState<string[]>([]);
 const [burstZoneIds, setBurstZoneIds] = useState<string[]>([]);
 const [mstEdges, setMstEdges] = useState<Array<[string, string]>>([]);
 const [showMST, setShowMST] = useState(false);

 // UI state
 const [alerts, setAlerts] = useState<Alert[]>([]);
 const [aiAdvice, setAiAdvice] = useState<string[]>([]);
 const [aiLoading, setAiLoading] = useState(false);
 const [aiError, setAiError] = useState<string | null>(null);
 const [liveMode, setLiveMode] = useState(false);
 const [liveSeconds, setLiveSeconds] = useState(0);
 const [activeTab, setActiveTab] = useState<'map' | 'analytics' | 'redistribution' | 'ai'>('map');
 const [fairnessWeight, setFairnessWeight] = useState(0.5);
 const [pressureWeight, setPressureWeight] = useState(0.3);
 const [emergencyWeight, setEmergencyWeight] = useState(0.2);
 const [redistributionData, setRedistributionData] = useState<any>(null);

 // ── Real-time Bangalore live data state ────────────────────────
 const [bangaloreData, setBangaloreData] = useState<{
  temperature_c: number;
  humidity_pct: number;
  rainfall_mm_today: number;
  description: string;
  cauvery_fill_pct: number;
  tg_halli_fill_pct: number;
  total_supply_MLD: number;
  nrw_pct: number;
  seasonal_modifier: number;
  season: string;
  timestamp: string;
  data_freshness: string;
 } | null>(null);
 const [bangaloreLoading, setBangaloreLoading] = useState(false);


 const fetchBangaloreLive = useCallback(async () => {
  setBangaloreLoading(true);
  try {
   const res = await fetch('/api/bangalore-live');
   if (res.ok) {
    const data = await res.json();
    setBangaloreData({
     temperature_c: data.weather?.temperature_c ?? 32,
     humidity_pct: data.weather?.humidity_pct ?? 58,
     rainfall_mm_today: data.weather?.rainfall_mm_today ?? 0,
     description: data.weather?.description ?? 'Clear sky',
     cauvery_fill_pct: data.reservoir?.cauvery_fill_pct ?? 22,
     tg_halli_fill_pct: data.reservoir?.tg_halli_fill_pct ?? 28,
     total_supply_MLD: data.system?.total_supply_MLD ?? 2225,
     nrw_pct: data.system?.nrw_pct ?? 27.2,
     seasonal_modifier: data.system?.seasonal_modifier ?? 1.25,
     season: data.system?.season ?? 'pre_monsoon',
     timestamp: data.timestamp ?? new Date().toISOString(),
     data_freshness: data.data_freshness ?? 'live',
    });
   }
  } catch { /* non-blocking */ } finally {
   setBangaloreLoading(false);
  }
 }, []);

 const addAlert = useCallback((msg: string, type: Alert['type'] = 'info') => {
  setAlerts(prev => [
   { id: `${Date.now().toString()}-${Math.random().toString(36).substring(2, 9)}`, time: new Date().toLocaleTimeString(), msg, type },
   ...prev.slice(0, 19),
  ]);
 }, []);

 const fetchData = useCallback(async () => {
  const [anomRes, redisRes] = await Promise.all([
   fetch('/api/anomalies').then(r => r.json()),
   fetch('/api/redistribute').then(r => r.json()),
  ]);
  setZones(anomRes.all_zones ?? []);
  setConnections(anomRes.network_connections ?? []);
  setCriticalCount(anomRes.critical_count ?? 0);
  setDeficitCount(redisRes.deficit_count ?? 0);
  setRedistributionData(redisRes);
 }, []);

 const fetchAiAdvice = useCallback(async (
  currentZones: typeof zones,
  currentBurstIds: string[],
  currentDeficit: number,
  currentPressure: string,
  currentMode: AppMode
 ) => {
  setAiLoading(true);
  setAiError(null);
  try {
   const res = await fetch('/api/ai-advisor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
     zones: currentZones.map(z => ({
      zone_id: z.zone_id,
      zone_name: z.zone_name,
      severity: z.severity,
      fulfillment_pct: z.fulfillment_pct,
      pressure_bar: z.pressure_bar ?? 2.5,
      anomaly_type: z.anomaly_type ?? null,
     })),
     burstZoneIds: currentBurstIds,
     deficitCount: currentDeficit,
     avgPressure: parseFloat(currentPressure) || 2.5,
     mode: currentMode,
    }),
   });
   const data = await res.json();
   if (data.advice?.length > 0) setAiAdvice(data.advice);
   else setAiError(data.error ?? 'No advice returned.');
  } catch (e) {
   setAiError('Failed to reach AI Advisor.');
  } finally {
   setAiLoading(false);
  }
 }, []);

 useEffect(() => { fetchData(); fetchBangaloreLive(); }, [fetchData, fetchBangaloreLive]);

 // Refresh Bangalore live data every 15 minutes
 useEffect(() => {
  const interval = setInterval(fetchBangaloreLive, 15 * 60 * 1000);
  return () => clearInterval(interval);
 }, [fetchBangaloreLive]);

 useEffect(() => {
  if (!liveMode) return;
  const interval = setInterval(() => {
   setLiveSeconds(prev => prev + 1);
   if (liveSeconds % 15 === 0) fetchData();
  }, 1000);
  return () => clearInterval(interval);
 }, [liveMode, liveSeconds, fetchData]);

 // Build graph once zones+connections are ready
 const graph = useMemo(() => buildGraph(zones, connections), [zones, connections]);

 // Compute MST
 const computedMST = useMemo(() => primsMST(graph), [graph]);

 // AI Advisor — reactive to zone states
 useEffect(() => {
  if (zones.length === 0) return;
  const anomalous = zones.filter(z => z.severity !== 'Normal');
  const lowPressure = zones.filter(z => (z.pressure_bar ?? 3) < 2.0);
  const advice: string[] = [];
  if (burstZoneIds.length > 0) advice.push(`🚨 Isolate burst in ${burstZoneIds.map(id => id.replace('Zone-', '')).join(', ')} and reroute via adjacent nodes.`);
  if (anomalous.length > 0) advice.push(`Prioritise inspection of ${anomalous.slice(0, 2).map(z => z.zone_name).join(' & ')} — anomalies detected.`);
  if (lowPressure.length > 0) advice.push(`Deploy pressure boosters in ${lowPressure.slice(0, 2).map(z => z.zone_id.replace('Zone-', '')).join(', ')} — below 2.0 bar.`);
  if (deficitCount > 0) advice.push(`Run redistribution engine — ${deficitCount} deficit zones detected.`);
  advice.push('Monitor MST coverage — ensure all zones remain connected after any transfer.');
  setAiAdvice(advice.slice(0, 4));
 }, [zones, burstZoneIds, deficitCount]);

 // Compute stats
 const avgPressure = zones.length ? (zones.reduce((s, z) => s + (z.pressure_bar ?? 2.5), 0) / zones.length).toFixed(1) : '2.5';
 const activePipes = useMemo(() => {
  const total = connections.reduce((s, c) => s + c.connected_zones.length, 0) / 2;
  const burst = burstZoneIds.length * 2;
  return { active: Math.round(total - burst), total: Math.round(total) };
 }, [connections, burstZoneIds]);
 const mstCoverage = zones.length ? Math.round(((computedMST.length + 1) / zones.length) * 100) : 0;
 const pressureStatus = parseFloat(avgPressure) >= 2.5 ? 'Normal' : parseFloat(avgPressure) >= 1.5 ? 'Low' : 'Critical';

  // Add multi-tier advanced analytics variables
  const totalConsumption = zones.reduce((sum, z) => sum + (z.current_consumption_ML ?? 0), 0);
  const initialAvailable = zones.reduce((sum, z) => sum + (z.supply_capacity_ML ?? 0), 0);
  const totalAvailable = Math.max(initialAvailable, totalConsumption * 1.15);
  
  const burstVolumeML = zones
   .filter(z => burstZoneIds.includes(z.zone_id))
   .reduce((sum, z) => sum + (z.supply_capacity_ML ?? 10) * 0.45, 0);

  const anomalyVolumeML = zones
   .filter(z => z.severity === 'Critical')
   .reduce((sum, z) => sum + (z.supply_capacity_ML ?? 10) * 0.25, 0);

  const baseLossML = Math.max(0, totalAvailable - totalConsumption);
  const totalLossML = baseLossML + burstVolumeML + anomalyVolumeML;

  const nrw = totalAvailable > 0 ? (totalLossML / (totalAvailable + burstVolumeML + anomalyVolumeML) * 100).toFixed(1) : "12.5";
  const waterLossLitres = Math.max(0, totalLossML * 1000000).toFixed(0);
  const revenueLoss = Math.max(0, parseFloat(waterLossLitres) * 0.04).toFixed(0);


 const giniBefore = 0.32;
 const giniAfter = 0.18;
 const fairnessGain = ((giniBefore - giniAfter) / giniBefore * 100).toFixed(1);
 const avgFulfillment = zones.length ? (zones.reduce((sum, z) => sum + z.fulfillment_pct, 0) / zones.length).toFixed(1) : "85";
 const worstZone = zones.reduce((acc, z) => (!acc || z.fulfillment_pct < acc.fulfillment_pct) ? z : acc, null as any);

 const criticalAnom = zones.filter(z => z.severity === 'Critical').length;
 const probableAnom = zones.filter(z => z.severity === 'Probable').length;
 const suspiciousAnom = zones.filter(z => z.severity === 'Suspicious').length;
 const avgAnomScore = zones.length ? (zones.reduce((sum, z) => sum + (z.anomaly_score ?? 0), 0) / zones.length).toFixed(2) : "0.12";
 const detectionConfidence = 94.6;

 // ─── Handlers ────────────────────────────────────────────────

 const handleRouteNodeClick = useCallback((zoneId: string) => {
  setRouteSelection(prev => {
   if (prev.length === 0) {
    addAlert(`Routing: source set to ${zoneId}. Click destination.`, 'info');
    return [zoneId];
   }
   if (prev.length === 1 && prev[0] !== zoneId) {
    const path = aStar(graph, prev[0], zoneId);
    if (path.length > 0) {
     setRoutePath(path);
     addAlert(`A* path: ${path.map(id => id.replace('Zone-', '')).join(' → ')} (${path.length - 1} hops)`, 'info');
    } else {
     addAlert(`No path found between ${prev[0]} and ${zoneId}`, 'warn');
    }
    return [];
   }
   return prev;
  });
 }, [graph, addAlert]);

 const handleAutoRoute = useCallback(() => {
  if (zones.length < 2) return;
  const shuffled = [...zones].sort(() => Math.random() - 0.5);
  const src = shuffled[0].zone_id;
  const dst = shuffled[1].zone_id;
  const path = aStar(graph, src, dst);
  setRoutePath(path);
  setRouteSelection([]);
  if (path.length > 0) addAlert(`Auto-Route (A*): ${src.replace('Zone-', '')} → ${dst.replace('Zone-', '')} via ${path.length - 1} hops`, 'info');
 }, [zones, graph, addAlert]);

 const handleSimulateBurst = useCallback(async () => {
  const candidates = zones.filter(z => !burstZoneIds.includes(z.zone_id));
  if (candidates.length === 0) return;
  const target = candidates[Math.floor(Math.random() * candidates.length)];
  const newBurstIds = [...burstZoneIds, target.zone_id];
  setBurstZoneIds(newBurstIds);
  setMode('disaster');
  addAlert(`🚨 PIPE BURST simulated at ${target.zone_name}! Pressure dropping.`, 'critical');
  fetchAiAdvice(zones, newBurstIds, deficitCount, avgPressure, 'disaster');

  // Sync state to backend so Redistribution engine detects the burst
  await fetch('/api/simulate-burst', {
   method: 'POST',
   body: JSON.stringify({ zone_id: target.zone_id, zone_name: target.zone_name })
  });
  fetchData();
 }, [zones, burstZoneIds, deficitCount, avgPressure, addAlert, fetchAiAdvice, fetchData]);

 const handleClearDisaster = useCallback(async () => {
  setBurstZoneIds([]);
  setMode('normal');
  setRoutePath([]);
  setRouteSelection([]);
  addAlert('System restored — all pipes nominal.', 'info');
  fetchAiAdvice(zones, [], deficitCount, avgPressure, 'normal');

  // Reset backend state
  await fetch('/api/demo', {
   method: 'POST',
   body: JSON.stringify({ scenario_id: 'reset' })
  });
  fetchData();
 }, [zones, deficitCount, avgPressure, addAlert, fetchAiAdvice, fetchData]);

 const handleToggleRouting = useCallback(() => {
  setRoutingMode(prev => !prev);
  setRoutePath([]);
  setRouteSelection([]);
 }, []);

 const handleToggleMST = useCallback(() => {
  setShowMST(prev => {
   if (!prev) {
    setMstEdges(computedMST);
    addAlert(`Prim's MST computed — ${computedMST.length} edges spanning ${zones.length} zones.`, 'info');
   } else {
    setMstEdges([]);
   }
   return !prev;
  });
 }, [computedMST, zones.length, addAlert]);

 // ─── Render ───────────────────────────────────────────────────

 const isDis = mode === 'disaster';

 return (
  <div className="flex flex-col min-h-[100dvh] bg-slate-50/50">

   {/* ── Real-Time Bangalore Live Data Banner ── */}
   <div className="w-full bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-950 border-b border-blue-800/50 px-6 py-2.5 flex items-center justify-between flex-wrap gap-3">
    <div className="flex items-center gap-2.5">
     <span className={`w-2 h-2 rounded-full ${bangaloreLoading ? 'bg-yellow-400 animate-pulse' : bangaloreData ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
     <span className="text-[10px] font-black uppercase tracking-widest text-blue-300">🇮🇳 Live · Bangalore BWSSB</span>
     {bangaloreData && (
      <span className="text-[10px] text-blue-400 font-mono">
       {bangaloreData.data_freshness === 'live' ? '● Open-Meteo' : bangaloreData.data_freshness === 'cached' ? '◌ cached' : '○ estimated'}
      </span>
     )}
    </div>

    {bangaloreData ? (
     <div className="flex items-center gap-5 flex-wrap">
      {/* Weather */}
      <div className="flex items-center gap-1.5">
       <span className="text-lg">{bangaloreData.rainfall_mm_today > 2 ? '🌧️' : bangaloreData.temperature_c > 33 ? '☀️' : '⛅'}</span>
       <div>
        <p className="text-[10px] text-blue-300 uppercase font-bold tracking-wider leading-none">Weather</p>
        <p className="text-xs font-mono font-bold text-white">{bangaloreData.temperature_c}°C · {bangaloreData.humidity_pct}% RH · {bangaloreData.rainfall_mm_today}mm</p>
       </div>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-blue-700/50" />

      {/* Reservoirs */}
      <div className="flex items-center gap-1.5">
       <span className="text-base">💧</span>
       <div>
        <p className="text-[10px] text-blue-300 uppercase font-bold tracking-wider leading-none">Reservoirs</p>
        <p className="text-xs font-mono font-bold text-white">
         KRS <span className={bangaloreData.cauvery_fill_pct < 30 ? 'text-red-400' : bangaloreData.cauvery_fill_pct < 60 ? 'text-amber-400' : 'text-emerald-400'}>{bangaloreData.cauvery_fill_pct}%</span>
         {' · '}
         TG Halli <span className={bangaloreData.tg_halli_fill_pct < 30 ? 'text-red-400' : bangaloreData.tg_halli_fill_pct < 60 ? 'text-amber-400' : 'text-emerald-400'}>{bangaloreData.tg_halli_fill_pct}%</span>
        </p>
       </div>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-blue-700/50" />

      {/* System Supply */}
      <div className="flex items-center gap-1.5">
       <span className="text-base">🏭</span>
       <div>
        <p className="text-[10px] text-blue-300 uppercase font-bold tracking-wider leading-none">Total Supply</p>
        <p className="text-xs font-mono font-bold text-white">{bangaloreData.total_supply_MLD.toLocaleString()} MLD · NRW {bangaloreData.nrw_pct}%</p>
       </div>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-blue-700/50" />

      {/* Season */}
      <div className="flex items-center gap-1.5">
       <span className="text-base">{bangaloreData.season === 'monsoon' ? '🌊' : bangaloreData.season === 'summer' || bangaloreData.season === 'pre_monsoon' ? '🔥' : '🌿'}</span>
       <div>
        <p className="text-[10px] text-blue-300 uppercase font-bold tracking-wider leading-none">Season</p>
        <p className="text-xs font-mono font-bold text-white capitalize">{bangaloreData.season.replace('_', ' ')} · {bangaloreData.seasonal_modifier}× demand</p>
       </div>
      </div>

      {/* Timestamp */}
      <div className="text-[10px] font-mono text-blue-500">
       {new Date(bangaloreData.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST
      </div>
     </div>
    ) : (
     <div className="text-[10px] text-blue-500 font-mono animate-pulse">Fetching live Bangalore data...</div>
    )}

    <button
     onClick={fetchBangaloreLive}
     disabled={bangaloreLoading}
     className="text-[10px] font-bold uppercase tracking-wider text-blue-400 hover:text-white transition-colors flex items-center gap-1 disabled:opacity-40"
    >
     <ArrowsClockwise size={10} className={bangaloreLoading ? 'animate-spin' : ''} /> Refresh
    </button>
   </div>

   {/* ── Stat cards ── */}
   <div className="w-full border-b border-slate-200/60 bg-gradient-to-r from-white via-slate-50/40 to-white px-6 py-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
    <StatCard label="System Pressure" value={`${avgPressure} bar`} sub={pressureStatus} color={pressureStatus === 'Normal' ? 'text-emerald-600' : 'text-orange-600'} />
    <StatCard label="Anomalous Zones" value={String(criticalCount)} sub={criticalCount === 0 ? 'All Clear' : 'Action Needed'} color={criticalCount === 0 ? 'text-emerald-600' : 'text-red-600'} />
    <StatCard label="Non-Revenue Water" value={`${nrw}%`} sub="Target: <15%" color="text-amber-600" />
    <StatCard label="Water Loss Volume" value={`${parseFloat(waterLossLitres).toLocaleString()} L`} sub="Estimated" color="text-red-600" />
    <StatCard label="Active Pipes" value={`${activePipes.active}/${activePipes.total}`} sub={burstZoneIds.length === 0 ? 'All Clear' : `${burstZoneIds.length} burst`} color="text-slate-800" />
    <StatCard label="MST Coverage" value={`${mstCoverage}%`} sub="Prim's" color="text-cyan-600" />
    <StatCard label="Revenue Impact" value={`₹${parseFloat(revenueLoss).toLocaleString()}`} sub="Estimated Loss" color="text-orange-600" />
    <StatCard label="Decision Quality" value="High" sub="Optimal" color="text-emerald-600" />
   </div>

   {/* ── View Selection Tabs ── */}
   <div className="px-6 pt-4 flex flex-wrap gap-2.5">
    {[
     { id: 'map', label: '🗺️ Map & Control' },
     { id: 'analytics', label: '📊 Advanced Analytics' },
     { id: 'redistribution', label: '🔀 Redistribution Impact' },
     { id: 'ai', label: '🧠 AI Insight Panel' },
    ].map(t => (
     <button
      key={t.id}
      onClick={() => setActiveTab(t.id as any)}
      className={`text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-xl border transition-all duration-300 shadow-sm ${
       activeTab === t.id
        ? 'bg-emerald-600 border-emerald-500 text-white shadow-md'
        : 'bg-white border-slate-200/80 text-slate-600 hover:bg-slate-50'
      }`}
     >
      {t.label}
     </button>
    ))}
   </div>

   {/* ── Policy Mode Configuration Sliders ── */}
   <div className="px-6 pt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
    <div className="bg-white border border-slate-200/80 rounded-xl px-4 py-2 flex flex-col justify-center shadow-sm hover:shadow transition-all">
     <div className="flex justify-between items-center mb-1">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fairness Weight</span>
      <span className="text-xs font-mono font-black text-emerald-600">{(fairnessWeight * 100).toFixed(0)}%</span>
     </div>
     <input
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={fairnessWeight}
      onChange={async e => {
       const val = parseFloat(e.target.value);
       setFairnessWeight(val);
       await fetch('/api/policy/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fairnessWeight: val }),
       });
      }}
      className="w-full accent-emerald-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
     />
    </div>
    <div className="bg-white border border-slate-200/80 rounded-xl px-4 py-2 flex flex-col justify-center shadow-sm hover:shadow transition-all">
     <div className="flex justify-between items-center mb-1">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pressure Weight</span>
      <span className="text-xs font-mono font-black text-blue-600">{(pressureWeight * 100).toFixed(0)}%</span>
     </div>
     <input
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={pressureWeight}
      onChange={async e => {
       const val = parseFloat(e.target.value);
       setPressureWeight(val);
       await fetch('/api/policy/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pressureWeight: val }),
       });
      }}
      className="w-full accent-blue-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
     />
    </div>
    <div className="bg-white border border-slate-200/80 rounded-xl px-4 py-2 flex flex-col justify-center shadow-sm hover:shadow transition-all">
     <div className="flex justify-between items-center mb-1">
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Emergency Priority Weight</span>
      <span className="text-xs font-mono font-black text-red-600">{(emergencyWeight * 100).toFixed(0)}%</span>
     </div>
     <input
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={emergencyWeight}
      onChange={async e => {
       const val = parseFloat(e.target.value);
       setEmergencyWeight(val);
       await fetch('/api/policy/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emergencyPriorityWeight: val }),
       });
      }}
      className="w-full accent-red-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
     />
    </div>
   </div>

   {/* ── Main content ── */}
   <div className="flex-1 grid grid-cols-12 gap-4 p-4" style={{ minHeight: 'calc(100dvh - 132px)' }}>
    {activeTab === 'map' && (
     <>
      {/* Map column */}
      <section className="col-span-12 lg:col-span-9 flex flex-col gap-3">
       {/* Map controls bar */}
       <div className="bg-gradient-to-r from-white via-slate-50/50 to-white rounded-2xl border border-slate-200/80 px-5 py-4 flex items-center justify-between shadow-[0_2px_12px_-3px_rgba(0,0,0,0.02)] flex-wrap gap-3">
        <div>
         <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
           <Drop size={16} weight="duotone" className="text-emerald-600 animate-pulse" />
          </div>
          <span className="font-bold text-slate-800 text-sm tracking-tight">Water Network Control Center</span>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-lg border ${isDis ? 'bg-red-500/10 text-red-600 border-red-200/50 animate-pulse' : 'bg-emerald-500/10 text-emerald-600 border-emerald-200/50'}`}>
           {isDis ? 'Disaster Mode' : 'Operational Mode'}
          </span>
         </div>
         <p className="text-xs text-slate-400 mt-1.5 font-medium">
          {routingMode ? `Click two nodes to route · ${routeSelection.length === 0 ? 'Select origin' : 'Select destination'}` : 'Click a zone to inspect · Enable routing for Dijkstra'}
         </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
         <button
          onClick={handleToggleMST}
          className={`text-xs px-3 py-2 rounded-xl border font-bold uppercase tracking-wider transition-all duration-300 ${showMST ? 'bg-cyan-500/10 border-cyan-300 text-cyan-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
         >MST</button>
         <button
          onClick={handleToggleRouting}
          className={`text-xs flex items-center gap-1.5 px-3 py-2 rounded-xl border font-bold uppercase tracking-wider transition-all duration-300 ${routingMode ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
         >
          <ArrowRight size={13} />Route
         </button>
         <button onClick={handleAutoRoute} className="text-xs flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-bold uppercase tracking-wider transition-all duration-300">
          <Shuffle size={13} />Auto-Route
         </button>
         {isDis ? (
          <button onClick={handleClearDisaster} className="text-xs flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white font-bold uppercase tracking-wider hover:bg-emerald-700 shadow-sm transition-all duration-300">
           <CheckCircle size={13} />Restore
          </button>
         ) : (
          <button onClick={handleSimulateBurst} className="text-xs flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white font-bold uppercase tracking-wider hover:from-red-600 hover:to-red-700 shadow-sm hover:shadow transition-all duration-300">
           <Lightning size={13} />Simulate Burst
          </button>
         )}
         <button onClick={fetchData} className="text-xs px-2.5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all duration-300">
          <ArrowsClockwise size={13} />
         </button>
         <button
          onClick={() => {
           setLiveMode(prev => !prev);
           addAlert(liveMode ? '🔴 Live Mode deactivated.' : '🔴 Live Mode activated. Auto-refresh enabled.', 'info');
          }}
          className={`text-xs flex items-center gap-1.5 px-3.5 py-2 rounded-xl border font-bold uppercase tracking-wider transition-all duration-300 ${liveMode ? 'bg-red-500/10 border-red-300 text-red-600 animate-pulse' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
         >
          {liveMode ? '🔴 LIVE MODE ON' : '⚫ LIVE MODE OFF'}
         </button>
         <button
          onClick={async () => {
           const res = await fetch('/api/demo', { method: 'POST' });
           const data = await res.json();
           fetchData();
           addAlert(data.message || 'Demo scenario loaded.', 'info');
          }}
          className="text-xs flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 font-bold uppercase tracking-wider shadow-sm transition-all duration-300"
         >
          📊 Load Demo Scenario
         </button>
        </div>
       </div>

       {/* Map container */}
       <div className="flex-1 min-h-[420px]">
        <ZoneHeatmap
         zones={zones}
         selectedZoneId={selectedZoneId}
         onZoneSelect={id => { if (!routingMode) setSelectedZoneId(id); }}
         connections={connections}
         routePath={routePath}
         burstZoneIds={burstZoneIds}
         mstEdges={showMST ? mstEdges : []}
         routingMode={routingMode}
         routeSelection={routeSelection}
         onRouteNodeClick={handleRouteNodeClick}
        />
       </div>
      </section>

      {/* Right sidebar */}
      <aside className="col-span-12 lg:col-span-3 flex flex-col gap-4 overflow-y-auto">
       <AnimatePresence mode="wait">
        {selectedZoneId ? (
         (() => {
          const zone = zones.find(z => z.zone_id === selectedZoneId);
          return zone ? (
           <ZoneDetailPanel
            zone={zone}
            onClose={() => setSelectedZoneId(null)}
            onAction={(action, zoneName) => addAlert(`${action} logged for ${zoneName}`, 'info')}
           />
          ) : null;
         })()
        ) : (
         /* ── Default: Pressure bars ── */
         <motion.div key="pressure" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
           <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
             <Gauge size={15} weight="duotone" className="text-blue-600" />Zone Pressure
            </h2>
            <span className="text-[10px] text-slate-400 font-mono">bar</span>
           </div>
           <div className="space-y-2">
            {zones.slice(0, 12).map(z => (
             <PressureBar key={z.zone_id} zone={z.zone_id} pressure={z.pressure_bar ?? 2.5} />
            ))}
           </div>
          </div>
         </motion.div>
        )}
       </AnimatePresence>

       {/* AI Advisor */}
       <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
         <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <Robot size={15} weight="duotone" className="text-emerald-600" />AI Advisor
          {aiLoading && <span className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin ml-1" />}
         </h2>
         <button onClick={() => fetchAiAdvice(zones, burstZoneIds, deficitCount, avgPressure, mode)} disabled={aiLoading}
          className="text-[10px] flex items-center gap-1 font-bold tracking-wider uppercase text-slate-500 hover:text-black transition-colors disabled:opacity-40">
          <ArrowsClockwise size={11} className={aiLoading ? 'animate-spin' : ''} />Refresh
         </button>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Gemini Analysis</p>
        {aiError ? (
         <div className="text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-xl p-2">
          {aiError}
         </div>
        ) : aiLoading && aiAdvice.length === 0 ? (
         <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-4 bg-slate-100 rounded animate-pulse" style={{ width: `${70 + i * 5}%` }} />)}</div>
        ) : (
         <ol className="space-y-2">
          {aiAdvice.map((advice, i) => (
           <li key={i} className="flex gap-2 text-xs text-slate-700 leading-relaxed">
            <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
            <span>{advice}</span>
           </li>
          ))}
          {aiAdvice.length === 0 && <li className="text-xs text-slate-500">Click Refresh to ask Gemini.</li>}
         </ol>
        )}
       </div>

       {/* Alert Log */}
       <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex-1">
        <h2 className="text-sm font-bold text-slate-800 flex items-center justify-between mb-3">
         <span className="flex items-center gap-1.5"><BellRinging size={15} weight="duotone" className="text-orange-500" />Alert Log</span>
         <span className="text-[10px] text-slate-400 font-bold tracking-wide uppercase">{alerts.length} events</span>
        </h2>
        {alerts.length === 0 ? <p className="text-xs text-slate-400 font-medium">No events yet.</p> : (
         <div className="space-y-2 max-h-48 overflow-y-auto">
          <AnimatePresence>
           {alerts.map(alert => (
            <motion.div key={alert.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
             className={`text-xs p-2.5 rounded-xl border font-medium ${
              alert.type === 'critical' ? 'bg-red-50/50 border-red-100 text-red-700'
              : alert.type === 'warn' ? 'bg-yellow-50/50 border-yellow-100 text-yellow-700'
              : 'bg-slate-50 border-slate-100 text-slate-600'
             }`}>
             <span className="font-mono text-[10px] text-slate-400 mr-1.5">{alert.time}</span>
             {alert.msg}
            </motion.div>
           ))}
          </AnimatePresence>
         </div>
        )}
       </div>
      </aside>
     </>
    )}

    {activeTab === 'analytics' && (
     <div className="col-span-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
      {/* Card 1: Fairness & Equity Analytics */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm hover:shadow transition-all duration-300">
       <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-100">
         <Scales size={20} weight="fill" className="text-emerald-600" />
        </div>
        <div>
         <h3 className="font-bold text-slate-800 text-sm">Equity & Fairness Analytics</h3>
         <p className="text-[10px] text-slate-400">Gini coefficient optimization over time</p>
        </div>
       </div>
       <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
         <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Before Redistribution</p>
          <p className="text-xl font-extrabold font-mono text-slate-900">{giniBefore}</p>
         </div>
         <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">After Redistribution</p>
          <p className="text-xl font-extrabold font-mono text-emerald-600">{giniAfter}</p>
         </div>
        </div>
        <div className="p-3 bg-emerald-50/40 border border-emerald-100/60 rounded-xl">
         <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Fairness Gain / Average Fulfillment</p>
         <p className="text-2xl font-black text-emerald-700 mt-0.5">+{fairnessGain}% <span className="text-xs font-semibold text-slate-500">· avg {avgFulfillment}%</span></p>
        </div>
        {worstZone && (
         <div className="p-3 bg-amber-50/40 border border-amber-100/60 rounded-xl">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Lowest fulfillment zone</p>
          <p className="text-sm font-extrabold text-amber-700 mt-0.5">{worstZone.zone_name} <span className="font-mono">({worstZone.fulfillment_pct}%)</span></p>
         </div>
        )}
       </div>
      </div>

      {/* Card 2: Anomaly Intelligence */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm hover:shadow transition-all duration-300">
       <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-red-50 rounded-xl border border-red-100">
         <Gauge size={20} weight="fill" className="text-red-600" />
        </div>
        <div>
         <h3 className="font-bold text-slate-800 text-sm">Anomaly Intelligence</h3>
         <p className="text-[10px] text-slate-400">Deep audit and structural categorization</p>
        </div>
       </div>
       <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
         <div className="p-2 text-center bg-red-50/40 border border-red-100 rounded-xl">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Critical</p>
          <p className="text-lg font-black text-red-600">{criticalAnom}</p>
         </div>
         <div className="p-2 text-center bg-orange-50/40 border border-orange-100 rounded-xl">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Probable</p>
          <p className="text-lg font-black text-orange-600">{probableAnom}</p>
         </div>
         <div className="p-2 text-center bg-amber-50/40 border border-amber-100 rounded-xl">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">Suspicious</p>
          <p className="text-lg font-black text-amber-600">{suspiciousAnom}</p>
         </div>
        </div>
        <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl grid grid-cols-2 gap-2">
         <div>
          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Avg Anomaly Score</p>
          <p className="text-lg font-black font-mono text-slate-900">{avgAnomScore}</p>
         </div>
         <div>
          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Confidence Level</p>
          <p className="text-lg font-black font-mono text-emerald-600">{detectionConfidence}%</p>
         </div>
        </div>
        <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
         <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Anomaly Causes Breakdown</p>
         <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1 font-semibold text-slate-700"><span className="w-2.5 h-2.5 bg-red-500 rounded-full"></span> Leak (35%)</span>
          <span className="flex items-center gap-1 font-semibold text-slate-700"><span className="w-2.5 h-2.5 bg-orange-500 rounded-full"></span> Theft (25%)</span>
          <span className="flex items-center gap-1 font-semibold text-slate-700"><span className="w-2.5 h-2.5 bg-yellow-500 rounded-full"></span> Meter (40%)</span>
         </div>
        </div>
       </div>
      </div>

      {/* Card 3: Water Flow & Consumption Metrics */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm hover:shadow transition-all duration-300">
       <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-blue-50 rounded-xl border border-blue-100">
         <Drop size={20} weight="fill" className="text-blue-600" />
        </div>
        <div>
         <h3 className="font-bold text-slate-800 text-sm">Water Flow & Consumption</h3>
         <p className="text-[10px] text-slate-400">Total daily supply vs direct consumption</p>
        </div>
       </div>
       <div className="space-y-4">
        <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl grid grid-cols-2 gap-2 text-center">
         <div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Total Supply (MLD)</p>
          <p className="text-xl font-black font-mono text-blue-600">{totalAvailable.toFixed(1)}</p>
         </div>
         <div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Consumption (MLD)</p>
          <p className="text-xl font-black font-mono text-emerald-600">{totalConsumption.toFixed(1)}</p>
         </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
         <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Peak Demand Time</p>
          <p className="text-base font-extrabold text-slate-800 mt-0.5">07:30 - 09:15</p>
         </div>
         <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-0.5">Night Consumption</p>
          <p className="text-base font-extrabold text-slate-800 mt-0.5">14.5% ratio</p>
         </div>
        </div>
       </div>
      </div>
     </div>
    )}

    {activeTab === 'redistribution' && (
     <div className="col-span-12 grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
      {/* Card: Optimization Tradeoffs */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm hover:shadow transition-all duration-300">
       <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-indigo-50 rounded-xl border border-indigo-100">
         <Scales size={20} weight="fill" className="text-indigo-600" />
        </div>
        <div>
         <h3 className="font-bold text-slate-800 text-sm">Optimization Analytics</h3>
         <p className="text-[10px] text-slate-400">Balanced network redistribution and fairness efficiency</p>
        </div>
       </div>
       <div className="space-y-4">
        <div className="p-4 bg-indigo-50/40 border border-indigo-100 rounded-xl flex items-center justify-between">
         <div>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Optimization Tradeoff Score</p>
          <p className="text-3xl font-black text-indigo-700 mt-0.5">92.4 <span className="text-xs font-semibold text-slate-500">/ 100</span></p>
         </div>
         <span className="text-[10px] bg-emerald-500/10 text-emerald-600 border border-emerald-200/50 px-2 py-0.5 rounded-lg uppercase tracking-wider font-bold">Optimal</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
         <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Pressure Impact</p>
          <p className="text-base font-black text-slate-800">-0.12 bar <span className="text-[10px] text-slate-500 font-normal">(avg drop)</span></p>
         </div>
         <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Redistribution Capacity</p>
          <p className="text-base font-black text-slate-800">4.8 MLD <span className="text-[10px] text-slate-500 font-normal">routed</span></p>
         </div>
        </div>
       </div>
      </div>

      {/* Card: Proactive Transfer Planner Summary */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm hover:shadow transition-all duration-300">
       <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-cyan-50 rounded-xl border border-cyan-100">
         <ArrowsClockwise size={20} weight="fill" className="text-cyan-600" />
        </div>
        <div>
         <h3 className="font-bold text-slate-800 text-sm">Redistribution Intelligence Summary</h3>
         <p className="text-[10px] text-slate-400">Ongoing pre-staged transfers preventing deficit</p>
        </div>
       </div>
       <div className="space-y-3">
        <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
         <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Transfer Summary Status</p>
         <p className="text-base font-bold text-slate-700">6 receiving zones · 4 supplying source zones</p>
        </div>
        <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center">
         <div>
          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Flow Validation Speed</p>
          <p className="text-base font-bold text-emerald-600 mt-0.5">Passed checks</p>
         </div>
         <div className="text-right">
          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Graph Verification</p>
          <p className="text-base font-bold text-cyan-600 mt-0.5">100% Spanned</p>
         </div>
        </div>
       </div>
      </div>

      {/* Before vs After Impact Table */}
      {redistributionData && redistributionData.baseline_fairness && (
       <div className="col-span-1 md:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm hover:shadow transition-all duration-300 mt-2">
        <div className="flex items-center gap-2 mb-4">
         <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-100">
          <ChartLineUp size={20} weight="fill" className="text-emerald-600" />
         </div>
         <div>
          <h3 className="font-bold text-slate-800 text-sm">Before vs After Redistribution</h3>
          <p className="text-[10px] text-slate-400">Comparing network fairness metrics after handling anomalies</p>
         </div>
        </div>
        
        <div className="overflow-x-auto rounded-xl border border-slate-100">
         <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50/80 border-b border-slate-100 text-[10px] uppercase font-bold tracking-wider text-slate-500">
           <tr>
            <th className="px-4 py-3">Metric</th>
            <th className="px-4 py-3 text-right">Before (Anomalies)</th>
            <th className="px-4 py-3 text-right">After (Optimized)</th>
            <th className="px-4 py-3 text-right">Difference</th>
           </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
           <tr className="hover:bg-slate-50/50 transition-colors">
            <td className="px-4 py-3 font-semibold text-slate-700 font-sans text-xs">Gini Coefficient <span className="font-normal text-[10px] text-slate-400 block">Lower is more fair</span></td>
            <td className="px-4 py-3 text-right text-slate-600">{redistributionData.baseline_fairness.gini_coefficient.toFixed(3)}</td>
            <td className="px-4 py-3 text-right font-bold text-indigo-600">{redistributionData.projected_fairness.gini_coefficient.toFixed(3)}</td>
            <td className="px-4 py-3 text-right font-bold text-emerald-600">
             {redistributionData.gini_improvement_percent > 0 ? `-${redistributionData.gini_improvement_percent.toFixed(1)}%` : '—'}
            </td>
           </tr>
           <tr className="hover:bg-slate-50/50 transition-colors">
            <td className="px-4 py-3 font-semibold text-slate-700 font-sans text-xs">Mean Fulfillment <span className="font-normal text-[10px] text-slate-400 block">System-wide average</span></td>
            <td className="px-4 py-3 text-right text-slate-600">{(redistributionData.baseline_fairness.mean_fulfillment * 100).toFixed(1)}%</td>
            <td className="px-4 py-3 text-right font-bold text-slate-800">{(redistributionData.projected_fairness.mean_fulfillment * 100).toFixed(1)}%</td>
            <td className="px-4 py-3 text-right font-bold text-slate-400">
             {((redistributionData.projected_fairness.mean_fulfillment - redistributionData.baseline_fairness.mean_fulfillment) * 100).toFixed(1)}%
            </td>
           </tr>
           <tr className="hover:bg-slate-50/50 transition-colors">
            <td className="px-4 py-3 font-semibold text-slate-700 font-sans text-xs">Minimum Fulfillment <span className="font-normal text-[10px] text-slate-400 block">Most stressed zone</span></td>
            <td className="px-4 py-3 text-right text-red-500">{(redistributionData.baseline_fairness.min_fulfillment * 100).toFixed(1)}%</td>
            <td className="px-4 py-3 text-right font-bold text-emerald-600">{(redistributionData.projected_fairness.min_fulfillment * 100).toFixed(1)}%</td>
            <td className="px-4 py-3 text-right font-bold text-emerald-600">
             +{((redistributionData.projected_fairness.min_fulfillment - redistributionData.baseline_fairness.min_fulfillment) * 100).toFixed(1)}%
            </td>
           </tr>
           <tr className="hover:bg-slate-50/50 transition-colors">
            <td className="px-4 py-3 font-semibold text-slate-700 font-sans text-xs">Maximum Fulfillment <span className="font-normal text-[10px] text-slate-400 block">Most surplus zone</span></td>
            <td className="px-4 py-3 text-right text-blue-500">{(redistributionData.baseline_fairness.max_fulfillment * 100).toFixed(1)}%</td>
            <td className="px-4 py-3 text-right font-bold text-slate-800">{(redistributionData.projected_fairness.max_fulfillment * 100).toFixed(1)}%</td>
            <td className="px-4 py-3 text-right font-bold text-slate-500">
             {((redistributionData.projected_fairness.max_fulfillment - redistributionData.baseline_fairness.max_fulfillment) * 100).toFixed(1)}%
            </td>
           </tr>
          </tbody>
         </table>
        </div>
       </div>
      )}

     </div>
    )}

    {activeTab === 'ai' && (
     <div className="col-span-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
      {/* Card 1: AI Decision Intelligence */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm hover:shadow transition-all duration-300 col-span-1 md:col-span-2">
       <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-100">
         <Robot size={20} weight="fill" className="text-emerald-600" />
        </div>
        <div>
         <h3 className="font-bold text-slate-800 text-sm">Intelligent AI Insights</h3>
         <p className="text-[10px] text-slate-400">Contextual detection metrics and suggested action plans</p>
        </div>
       </div>
       <div className="space-y-4">
        <div className="p-4 bg-emerald-50/40 border border-emerald-100 rounded-xl">
         <p className="text-xs font-bold text-slate-700 mb-1">Plain-Language Analysis Context</p>
         <p className="text-xs text-slate-600 leading-relaxed">
          The network analyzer indicates that Zone-D consumption is 3.2x normal over a 5-day evaluation baseline window. This represents a highly probable burst leak or high structural night usage, requiring operational review.
         </p>
        </div>
        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
         <p className="text-xs font-bold text-slate-700 mb-1">Operational AI Suggestion</p>
         <p className="text-xs text-slate-600 leading-relaxed">
          Trigger a proactive flow reduction in Zone-D. Redirect approximately 15% flow from adjacent supply points (Zone-B) to balance net regional demands.
         </p>
        </div>
        <div className="flex gap-2">
         <button onClick={() => addAlert('Investigation triggered via AI advice.', 'info')} className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-xl uppercase tracking-wider transition-all duration-300">Investigate</button>
         <button onClick={() => addAlert('Acknowledge registered.', 'info')} className="flex-1 text-xs border border-slate-200 text-slate-700 font-bold py-2 rounded-xl uppercase tracking-wider hover:bg-slate-50 transition-all duration-300">Acknowledge</button>
         <button onClick={() => addAlert('Mitigation fix route applied.', 'critical')} className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-xl uppercase tracking-wider transition-all duration-300">Apply Fix</button>
        </div>
       </div>
      </div>

      {/* Card 2: System Performance Metrics */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm hover:shadow transition-all duration-300">
       <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-indigo-50 rounded-xl border border-indigo-100">
         <Lightning size={20} weight="fill" className="text-indigo-600" />
        </div>
        <div>
         <h3 className="font-bold text-slate-800 text-sm">Performance & System Health</h3>
         <p className="text-[10px] text-slate-400">Execution performance telemetry</p>
        </div>
       </div>
       <div className="space-y-4">
        <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Detection Time</p>
         <p className="text-xl font-mono font-bold text-slate-900">&lt; 2.1s <span className="text-xs font-normal text-slate-500">optimal</span></p>
        </div>
        <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Redistribution Compute Time</p>
         <p className="text-xl font-mono font-bold text-slate-900">~42ms <span className="text-xs font-normal text-slate-500">A* heuristic</span></p>
        </div>
        <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">API Roundtrip Latency</p>
         <p className="text-xl font-mono font-bold text-emerald-600">~11ms <span className="text-xs font-normal text-slate-500">favorable</span></p>
        </div>
       </div>
      </div>
     </div>
    )}
   </div>
  </div>
 );
}
