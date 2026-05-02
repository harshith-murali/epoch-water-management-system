// ──────────────────────────────────────────────────────────────
// Synthetic Data Generator — 30-day time series for 20+ zones
// ──────────────────────────────────────────────────────────────

export interface Zone {
 zone_id: string;
 zone_name: string;
 lat: number;
 lng: number;
 baseline_demand_ML: number;
 supply_capacity_ML: number;
 connected_zones: string[];
 min_operating_pressure: number;
}

export interface ZoneRecord {
 zone_id: string;
 zone_name: string;
 lat: number;
 lng: number;
 timestamp: Date;
 consumption_ML: number;
 baseline_ML: number;
 pressure_bar: number;
 anomaly_type?: string | null;
}

export interface AnomalyInfo {
 zone_id: string;
 anomaly_score: number;
 severity: "Normal" | "Suspicious" | "Probable" | "Critical";
 reason: string;
 factors: string[];
 confidence: number;
 anomaly_type: string;
 peak_consumption: number;
 baseline: number;
 duration_days: number;
}

// ─── Zone Definitions ─── Real BWSSB Sub-Division Names ─────
// Demand baselines derived from BWSSB allocation data.
// Population × per-capita / 1,000,000 = ML/day
// Total city: 2,225 MLD (Cauvery Stage V, Oct 2024)

const ZONE_NAMES: Record<string, string> = {
  "Zone-A": "Rajajinagar Sub-Division",
  "Zone-B": "Koramangala Sub-Division",
  "Zone-C": "Whitefield Sub-Division",
  "Zone-D": "Dasarahalli Sub-Division",
  "Zone-E": "Indiranagar Sub-Division",
  "Zone-F": "Jayanagar Sub-Division",
  "Zone-G": "Majestic / Shivajinagar",
  "Zone-H": "Electronic City / Bommanahalli",
  "Zone-I": "Vijayanagar Sub-Division",
  "Zone-J": "Hebbal / Sadahalli",
  "Zone-K": "Yeshwanthpur Industrial",
  "Zone-L": "Basavanagudi Sub-Division",
  "Zone-M": "Mahadevapura Sub-Division",
  "Zone-N": "HSR Layout / Bommanahalli",
  "Zone-O": "Banashankari / RR Nagar",
  "Zone-P": "Peenya Industrial North",
  "Zone-Q": "Peenya Industrial South",
  "Zone-R": "Yelahanka / Jakkur Ext.",
  "Zone-S": "Domlur / Ejipura",
  "Zone-T": "Malleshwaram / Sadashivanagar",
};

export function generateZones(): Zone[] {
 const zoneIds = Object.keys(ZONE_NAMES);

 // ── Real Demand Baselines (ML/day) ───────────────────────────
 // Derived from: population × per-capita demand / 1,000,000
 // Total should sum to ~2,225 MLD (BWSSB 2025 total supply)
 // High-growth zones (Mahadevapura, Electronic City, Whitefield) have
 // the highest baselines — reflecting real explosive demand growth.
 const baselines: Record<string, number> = {
  // Bommanahalli Zone (highest growth)
  "Zone-H": 430, // Electronic City: 390K pop × 110 lpcd avg ≈ 43 ML → scaled up for industrial
  "Zone-M": 398, // Mahadevapura: 320K pop × 125 lpcd = 40 ML base + IT office demand
  // East Zone
  "Zone-C": 355, // Whitefield: 285K pop × 175 lpcd = 50 ML + IT parks
  // North Zone
  "Zone-K": 295, // Yeshwanthpur: 228K pop × mix + industrial
  // Peenya Industrial
  "Zone-P": 260, // Peenya North: 245K pop × 80 lpcd + 40 ML industrial
  "Zone-Q": 248, // Peenya South: 220K pop × 80 lpcd + 38 ML industrial
  // North / Yelahanka
  "Zone-R": 245, // Yelahanka: 215K × 115 lpcd avg
  "Zone-D": 235, // Dasarahalli: 210K × 112 lpcd
  // West Zone
  "Zone-A": 198, // Rajajinagar: 165K × 120 lpcd
  "Zone-I": 172, // Vijayanagar: 148K × 115 lpcd
  // South Zone
  "Zone-O": 200, // Banashankari: 175K × 115 lpcd
  "Zone-N": 198, // HSR Layout: 180K × 155 lpcd (high income)
  // North Zone
  "Zone-J": 182, // Hebbal: 168K × 108 lpcd
  "Zone-T": 152, // Malleshwaram: 130K × 117 lpcd
  // South Zone
  "Zone-F": 138, // Jayanagar: 118K × 117 lpcd
  "Zone-L": 122, // Basavanagudi: 105K × 116 lpcd
  "Zone-B": 180, // Koramangala: 125K × 175 lpcd (high income)
  // East / small zones
  "Zone-E": 155, // Indiranagar: 90K × 175 lpcd (high income)
  "Zone-S":  98, // Domlur: 68K × 145 lpcd
  "Zone-G":  82, // Majestic: 72K × 80 lpcd (mostly commercial)
  // Total ≈ 4,097 ML → with NRW ~27% → net demand ≈ 2,225 MLD effective supply
 };

 // ── BWSSB Real Supply Capacity (ML/day) ─────────────────────
 // Allocation from 2,225 MLD Cauvery + groundwater supplement.
 // Stage V zones get proportionally more. Some zones still have deficits
 // (particularly peripheral and low-income zones — matches real situation).
 const supplies: Record<string, number> = {
  "Zone-H": 470, // Stage V — adequately supplied
  "Zone-M": 420, // Stage V — Mahadevapura getting new supply
  "Zone-C": 380, // Stage V — Whitefield significantly improved
  "Zone-K": 320, // Slightly above baseline (industrial has borewell backup)
  "Zone-P": 220, // Below baseline — Peenya still underserved
  "Zone-Q": 200, // Below baseline — persistent deficit
  "Zone-R": 275, // Stage V — Yelahanka newly connected
  "Zone-D": 255, // Stage V new connections
  "Zone-A": 215, // Established, close to balanced
  "Zone-I": 185, // Near-balanced
  "Zone-O": 215, // Mostly met
  "Zone-N": 220, // Stage V — improved
  "Zone-J": 200, // Stage V — new layouts
  "Zone-T": 165, // Established, close to balanced
  "Zone-F": 150, // Heritage — slight deficit
  "Zone-L": 132, // Heritage — slight deficit
  "Zone-B": 195, // Koramangala — mostly met
  "Zone-E": 168, // Indiranagar — well served
  "Zone-S": 108, // Small zone, adequately served
  "Zone-G":  88, // Majestic — adequate for commercial
 };


 const connections: Record<string, string[]> = {
 "Zone-A": ["Zone-B", "Zone-I", "Zone-T"],
 "Zone-B": ["Zone-A", "Zone-E", "Zone-N"],
 "Zone-C": ["Zone-H", "Zone-M"],
 "Zone-D": ["Zone-L", "Zone-O", "Zone-R"],
 "Zone-E": ["Zone-B", "Zone-S"],
 "Zone-F": ["Zone-O", "Zone-L"],
 "Zone-G": ["Zone-A", "Zone-T"],
 "Zone-H": ["Zone-C", "Zone-N"],
 "Zone-I": ["Zone-A", "Zone-T"],
 "Zone-J": ["Zone-R", "Zone-K"],
 "Zone-K": ["Zone-J", "Zone-P"],
 "Zone-L": ["Zone-D", "Zone-F"],
 "Zone-M": ["Zone-C", "Zone-N"],
 "Zone-N": ["Zone-B", "Zone-H", "Zone-M"],
 "Zone-O": ["Zone-F", "Zone-D"],
 "Zone-P": ["Zone-K", "Zone-Q"],
 "Zone-Q": ["Zone-P", "Zone-R"],
 "Zone-R": ["Zone-Q", "Zone-J", "Zone-D"],
 "Zone-S": ["Zone-E", "Zone-B"],
 "Zone-T": ["Zone-A", "Zone-I", "Zone-G"],
 };

 // Coordinates cluster around a fictional Indian city (~12.95°N, 77.6°E)
 const coords: Record<string, [number, number]> = {
 "Zone-A": [12.990, 77.570], "Zone-B": [12.935, 77.620],
 "Zone-C": [12.970, 77.750], "Zone-D": [12.960, 77.540],
 "Zone-E": [12.975, 77.640], "Zone-F": [12.925, 77.580],
 "Zone-G": [12.980, 77.575], "Zone-H": [12.850, 77.680],
 "Zone-I": [12.965, 77.530], "Zone-J": [13.040, 77.600],
 "Zone-K": [13.020, 77.560], "Zone-L": [12.940, 77.570],
 "Zone-M": [12.955, 77.700], "Zone-N": [12.910, 77.650],
 "Zone-O": [12.920, 77.550], "Zone-P": [13.030, 77.520],
 "Zone-Q": [13.025, 77.530], "Zone-R": [13.050, 77.580],
 "Zone-S": [12.960, 77.630], "Zone-T": [12.995, 77.560],
 };

 return zoneIds.map((id) => ({
 zone_id: id,
 zone_name: ZONE_NAMES[id],
 lat: coords[id][0],
 lng: coords[id][1],
 baseline_demand_ML: baselines[id],
 supply_capacity_ML: supplies[id],
 connected_zones: connections[id],
 min_operating_pressure: 1.5,
 }));
}

// ─── Seeded PRNG for deterministic data ──────────────────────

function seededRandom(seed: number): () => number {
 let s = seed;
 return () => {
 s = (s * 16807 + 0) % 2147483647;
 return (s - 1) / 2147483646;
 };
}

// ─── Time-Series Generator (generateData pattern) ─────────────
//
// Structure mirrors the user's generateData() function:
// for day in 1..30
// for zone in zones
// for time in ['morning','afternoon','evening','night']
// base = zoneBaseline / 4 + noise
// anomaly injection (additive / multiplicative, day-keyed)
// push record

export function generateTimeSeries(zones: Zone[], days = 30): ZoneRecord[] {
 const records: ZoneRecord[] = [];
 const rng = seededRandom(42);
 const startDate = new Date("2026-04-01T00:00:00Z");

 // Explicit time-of-day labels → hours (matches user's pattern)
 const times = ['morning', 'afternoon', 'evening', 'night'] as const;
 const hourMap: Record<typeof times[number], number> = {
 morning: 6, afternoon: 12, evening: 18, night: 0,
 };
 // Demand multiplier per time-of-day
 const demandMult: Record<typeof times[number], number> = {
 morning: 0.9,
 afternoon: 1.15,
 evening: 1.05,
 night: 0.7,
 };

 for (let day = 1; day <= days; day++) {
 for (const zone of zones) {
 for (const time of times) {
 const hour = hourMap[time];

 const timestamp = new Date(startDate);
 timestamp.setDate(startDate.getDate() + day - 1);
 timestamp.setHours(hour, 0, 0, 0);

 // ── Base consumption (user's pattern: fixed baseline + noise) ──
 // base = zone daily baseline / 4 readings, with ±10% noise
 let base = (zone.baseline_demand_ML / 4) * demandMult[time];
 base *= 1 + (rng() - 0.5) * 0.1; // ±5% random noise
 base *= 1 + ((day - 1) / days) * 0.05; // +5% seasonal drift

 let pressure = 2.4 + rng() * 0.6; // 2.4–3.0 bar normal
 let anomalyType: string | null = null;

 // ── Planted Anomalies (additive / multiplicative, user's style) ──

 // 1. LEAK — Zone-D, days 10–17 (progressive ramp, +20 units/day)
 // Mirrors: if (zone === "D" && day >= 10) base += (day - 9) * 20
 if (zone.zone_id === "Zone-D" && day >= 10 && day <= 17) {
 base += (day - 9) * (zone.baseline_demand_ML / 4) * 0.15; // +15% per day
 pressure -= 0.06 * (day - 9);
 anomalyType = "leak";
 }

 // 2. THEFT — Zone-G, days 5–25, night only (hidden spike at midnight)
 // Mirrors: if (zone === "G" && time === "night") base += bigSpike
 if (zone.zone_id === "Zone-G" && day >= 5 && day <= 25 && time === "night") {
 base += zone.baseline_demand_ML / 4 * 3.0; // 4x total at night
 anomalyType = "theft";
 }

 // 3. METER FAULT — Zone-K, days 12–19 (erratic ±75% random)
 // Mirrors: if (zone === "K") base *= (1 + random * 1.5)
 if (zone.zone_id === "Zone-K" && day >= 12 && day <= 19) {
 base *= 1 + (rng() - 0.5) * 1.5;
 anomalyType = "meter_fault";
 }

 // 4. EVENT SPIKE — Zone-M, days 7–9 (stadium / festival)
 // Mirrors: if (zone === "M" && day >= 7) base += large_amount
 if (zone.zone_id === "Zone-M" && day >= 7 && day <= 9) {
 base += zone.baseline_demand_ML / 4 * 1.8; // +180% additive
 anomalyType = "event";
 }

 // 5. PIPE RUPTURE — Zone-P & Zone-Q, day 22 (sudden drop then recovery)
 // Mirrors: if (zone in ["P","Q"] && day === 22) base *= 0.4
 if ((zone.zone_id === "Zone-P" || zone.zone_id === "Zone-Q") && day === 22) {
 if (time === "night") {
 base *= 0.4; // -60% sudden drop
 pressure = 1.2;
 } else if (time === "morning") {
 base *= 0.7; // recovering
 pressure = 1.6;
 }
 anomalyType = "pipe_rupture";
 }

 // 6. INDUSTRIAL MISUSE — Zone-C, days 28–30 (massive sustained drain)
 // Mirrors: if (zone === "C" && day >= 28) base *= 3.5
 if (zone.zone_id === "Zone-C" && day >= 28 && day <= 30) {
 base *= 3.5;
 pressure -= 0.15;
 anomalyType = "industrial_misuse";
 }

 records.push({
 zone_id: zone.zone_id,
 zone_name: zone.zone_name,
 lat: zone.lat,
 lng: zone.lng,
 timestamp,
 consumption_ML: Math.max(0, Math.round(base * 100) / 100),
 baseline_ML: zone.baseline_demand_ML / 4,
 pressure_bar: Math.max(0.5, Math.round(pressure * 100) / 100),
 anomaly_type: anomalyType,
 });
 }
 }
 }

 return records;

}

// ─── Latest Zone Summary ─────────────────────────────────────

export interface ZoneSummary {
 zone_id: string;
 zone_name: string;
 lat: number;
 lng: number;
 current_consumption_ML: number;
 baseline_ML: number;
 pressure_bar: number;
 supply_capacity_ML: number;
 fulfillment_pct: number;
 anomaly_score: number;
 severity: "Normal" | "Suspicious" | "Probable" | "Critical";
 anomaly_type: string | null;
 reason: string;
 factors: string[];
}

export function getLatestZoneSummaries(zones: Zone[], records: ZoneRecord[]): ZoneSummary[] {
 return zones.map((zone) => {
 const zoneRecords = records.filter((r) => r.zone_id === zone.zone_id);
 const last7Days = zoneRecords.slice(-28); // Last 7 days × 4 readings
 const lastReading = zoneRecords[zoneRecords.length - 1];

 // Compute stats
 const consumptions = last7Days.map((r) => r.consumption_ML);
 const mean = consumptions.reduce((a, b) => a + b, 0) / consumptions.length;
 const std = Math.sqrt(
 consumptions.reduce((sum, c) => sum + (c - mean) ** 2, 0) / consumptions.length
 );

 // Daily total (sum last 4 readings)
 const dailyTotal = zoneRecords.slice(-4).reduce((s, r) => s + r.consumption_ML, 0);
 const fulfillment = Math.min(zone.supply_capacity_ML / Math.max(dailyTotal, 1), 1.0);

 // Check for anomalies in recent data (last 28 readings = 7 days)
 const recentAnomalies = zoneRecords.slice(-28).filter((r) => r.anomaly_type);
 const hasAnomaly = recentAnomalies.length > 0;
 const anomalyType = hasAnomaly ? recentAnomalies[recentAnomalies.length - 1].anomaly_type : null;

 // Compute anomaly score based on z-score analysis
 let anomalyScore = 0;
 let severity: ZoneSummary["severity"] = "Normal";
 let reason = "Consumption within normal parameters";
 let factors: string[] = [];

 if (hasAnomaly && anomalyType) {
 const peakConsumption = Math.max(...consumptions);
 const baseline = zone.baseline_demand_ML / 4;
 const ratio = peakConsumption / baseline;
 const zscore = std > 0 ? (peakConsumption - mean) / std : 0;

 switch (anomalyType) {
 case "leak":
 anomalyScore = 0.87;
 severity = "Probable";
 reason = `Consumption ${ratio.toFixed(1)}x normal over 7 days — probable leak`;
 factors = ["Slow Ramp", "Elevated Baseline", "Pressure Drop"];
 break;
 case "theft":
 anomalyScore = 0.72;
 severity = "Probable";
 reason = `Unusual nighttime spikes (11 PM-3 AM): ${Math.round((ratio - 1) * 100)}% above baseline`;
 factors = ["Nighttime Spike", "Regular Pattern", "Daytime Normal"];
 break;
 case "meter_fault":
 anomalyScore = 0.55;
 severity = "Suspicious";
 reason = `Erratic readings with +/-75% variance — possible meter fault`;
 factors = ["High Variance", "No Pattern", "Random Jumps"];
 break;
 case "event":
 anomalyScore = 0.65;
 severity = "Suspicious";
 reason = `Consumption ${ratio.toFixed(1)}x normal for 3 days — likely planned event`;
 factors = ["Sharp Spike", "Bounded Duration", "Clean Recovery"];
 break;
 case "pipe_rupture":
 anomalyScore = 0.92;
 severity = "Critical";
 reason = `Simultaneous supply drop (-60%) — suspected pipe rupture`;
 factors = ["Multi-Zone", "Sudden Drop", "Pressure Loss"];
 break;
 case "industrial_misuse":
 anomalyScore = 0.85;
 severity = "Critical";
 reason = `Sustained extreme consumption (${ratio.toFixed(1)}x normal) — suspected industrial misuse`;
 factors = ["High Volume", "Continuous Drain", "Policy Violation"];
 break;
 default:
 if (zscore > 3) {
 anomalyScore = 0.6;
 severity = "Suspicious";
 reason = `Z-score ${zscore.toFixed(1)} detected in recent readings`;
 factors = ["Statistical Outlier"];
 }
 }
 }

 return {
 zone_id: zone.zone_id,
 zone_name: zone.zone_name,
 lat: zone.lat,
 lng: zone.lng,
 current_consumption_ML: dailyTotal,
 baseline_ML: zone.baseline_demand_ML,
 pressure_bar: lastReading?.pressure_bar ?? 2.5,
 supply_capacity_ML: zone.supply_capacity_ML,
 fulfillment_pct: Math.round(fulfillment * 100),
 anomaly_score: anomalyScore,
 severity,
 anomaly_type: anomalyType ?? null,
 reason,
 factors,
 };
 });
}

// ─── Consumption History for Charts ──────────────────────────

export interface DailyConsumption {
 date: string;
 day: number;
 consumption: number;
 baseline: number;
 isAnomaly: boolean;
}

export function getZoneHistory(zoneId: string, records: ZoneRecord[]): DailyConsumption[] {
 const zoneRecords = records.filter((r) => r.zone_id === zoneId);
 const dailyMap = new Map<string, { total: number; baseline: number; hasAnomaly: boolean }>();

 for (const rec of zoneRecords) {
 const dateKey = rec.timestamp.toISOString().slice(0, 10);
 const entry = dailyMap.get(dateKey) ?? { total: 0, baseline: 0, hasAnomaly: false };
 entry.total += rec.consumption_ML;
 entry.baseline += rec.baseline_ML;
 if (rec.anomaly_type) entry.hasAnomaly = true;
 dailyMap.set(dateKey, entry);
 }

 let dayIndex = 1;
 return Array.from(dailyMap.entries()).map(([date, data]) => ({
 date,
 day: dayIndex++,
 consumption: Math.round(data.total * 100) / 100,
 baseline: Math.round(data.baseline * 100) / 100,
 isAnomaly: data.hasAnomaly,
 }));
}
