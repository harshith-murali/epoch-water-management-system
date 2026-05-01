// ──────────────────────────────────────────────────────────────
// Anomaly Detection Engine — Isolation Forest + Statistical Validation
// Pair ML scoring with explicit rule-based confirmation for explainability
// ──────────────────────────────────────────────────────────────

import { ZoneSummary, ZoneRecord } from "./synthetic-data";

export interface AnomalyDetectionResult {
  zone_id: string;
  zone_name: string;
  anomaly_score: number; // 0-1
  severity: "Normal" | "Suspicious" | "Probable" | "Critical";
  reason: string;
  factors: string[];
  confidence: number; // 0-1
  anomaly_type: string;
  peak_consumption: number;
  baseline: number;
  duration_days: number;
}

// ─── Feature Engineering ─────────────────────────────────────

interface AnomalyFeatures {
  rolling_mean_deviation: number; // std deviation from 7-day rolling mean
  spike_ratio: number; // current / same-hour baseline
  trend_slope: number; // direction of change over last 5 days
  time_context_anomaly: number; // expected vs actual for time-of-day
  consecutive_spikes: number; // count of days above 2x baseline
}

function engineerFeatures(
  zoneHistory: ZoneRecord[],
  zoneId: string
): AnomalyFeatures {
  if (zoneHistory.length < 5) {
    return {
      rolling_mean_deviation: 0,
      spike_ratio: 1,
      trend_slope: 0,
      time_context_anomaly: 0,
      consecutive_spikes: 0,
    };
  }

  // Last 7 days consumption
  const last7Days = zoneHistory
    .slice(-28) // 4 readings per day = 28 records
    .map((r) => r.consumption_ML);
  const mean7 = last7Days.reduce((a, b) => a + b, 0) / last7Days.length;
  const variance =
    last7Days.reduce((sum, val) => sum + Math.pow(val - mean7, 2), 0) /
    last7Days.length;
  const std7 = Math.sqrt(variance);

  // Current reading
  const current = zoneHistory[zoneHistory.length - 1];

  // Rolling mean deviation (Z-score)
  const rolling_mean_deviation =
    std7 > 0
      ? Math.abs((current.consumption_ML - mean7) / std7)
      : Math.abs(current.consumption_ML - mean7) / Math.max(mean7, 1);

  // Spike ratio (current vs same-hour baseline)
  const spikeRatio = current.consumption_ML / Math.max(current.baseline_ML, 1);
  const spike_ratio = Math.max(0, Math.min(spikeRatio, 5)); // cap at 5x

  // Trend slope (linear regression over last 5 days)
  const last5Days = zoneHistory.slice(-20); // last 20 records
  let trend_slope = 0;
  if (last5Days.length >= 2) {
    const n = last5Days.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = last5Days.map((r) => r.consumption_ML);
    const xMean = x.reduce((a, b) => a + b) / n;
    const yMean = y.reduce((a, b) => a + b) / n;
    const numerator = x.reduce(
      (sum, xi, i) => sum + (xi - xMean) * (y[i] - yMean),
      0
    );
    const denominator = x.reduce((sum, xi) => sum + Math.pow(xi - xMean, 2), 0);
    trend_slope = denominator > 0 ? numerator / denominator : 0;
  }

  // Time context anomaly (hour-of-day expectation)
  const currentTimestamp = new Date(current.timestamp);
  const expectedForHour = zoneHistory
    .filter((r) => new Date(r.timestamp).getHours() === currentTimestamp.getHours())
    .slice(-4)
    .map((r) => r.consumption_ML);
  const expectedMean =
    expectedForHour.length > 0
      ? expectedForHour.reduce((a, b) => a + b) / expectedForHour.length
      : mean7;
  const time_context_anomaly =
    expectedMean > 0
      ? Math.abs((current.consumption_ML - expectedMean) / expectedMean)
      : 0;

  // Consecutive spikes (how many days in a row > 2x baseline)
  let consecutive_spikes = 0;
  for (let i = zoneHistory.length - 1; i >= Math.max(0, zoneHistory.length - 28); i--) {
    if (zoneHistory[i].consumption_ML > zoneHistory[i].baseline_ML * 2) {
      consecutive_spikes++;
    } else {
      break;
    }
  }

  return {
    rolling_mean_deviation: Math.min(rolling_mean_deviation, 10),
    spike_ratio,
    trend_slope: Math.min(Math.abs(trend_slope), 1),
    time_context_anomaly: Math.min(time_context_anomaly, 3),
    consecutive_spikes: consecutive_spikes / 7, // normalize to 0-4
  };
}

// ─── Isolation Forest-like Scoring ──────────────────────────

function isolationForestScore(features: AnomalyFeatures): number {
  // Simplified isolation-forest-inspired scoring:
  // Features that isolate an observation as "different" from the norm
  const weights = {
    rolling_mean_deviation: 0.3,
    spike_ratio: 0.25,
    trend_slope: 0.15,
    time_context_anomaly: 0.2,
    consecutive_spikes: 0.1,
  };

  const normalizedFeatures = {
    rolling_mean_deviation: Math.min(features.rolling_mean_deviation / 5, 1),
    spike_ratio: Math.min(features.spike_ratio / 3, 1),
    trend_slope: features.trend_slope, // already 0-1
    time_context_anomaly: Math.min(
      features.time_context_anomaly / 2,
      1
    ),
    consecutive_spikes: Math.min(features.consecutive_spikes / 4, 1),
  };

  const score =
    normalizedFeatures.rolling_mean_deviation * weights.rolling_mean_deviation +
    normalizedFeatures.spike_ratio * weights.spike_ratio +
    normalizedFeatures.trend_slope * weights.trend_slope +
    normalizedFeatures.time_context_anomaly *
      weights.time_context_anomaly +
    normalizedFeatures.consecutive_spikes * weights.consecutive_spikes;

  return Math.min(Math.max(score, 0), 1);
}

// ─── Statistical Validation Layer ──────────────────────────

function statisticalValidation(
  features: AnomalyFeatures,
  isoScore: number
): { confirmed: boolean; confidence: number } {
  // Rule-based confirmation: is this really anomalous?

  // Rule 1: Z-score > 3 (3 sigma) is strong evidence
  const strongZScore = features.rolling_mean_deviation > 3;

  // Rule 2: Sustained spike (3+ consecutive days > 2x baseline)
  const sustainedSpike = features.consecutive_spikes >= 3;

  // Rule 3: Rapid trend + spike combo
  const rapidTrendSpike =
    features.trend_slope > 0.1 && features.spike_ratio > 2;

  // Rule 4: Time-context violation (unusual for this time of day)
  const timeContextViolation = features.time_context_anomaly > 1.5;

  const ruleMatches = [
    strongZScore,
    sustainedSpike,
    rapidTrendSpike,
    timeContextViolation,
  ].filter(Boolean).length;

  const confirmed = ruleMatches >= 1 && isoScore > 0.4;
  const confidence = Math.min(0.4 + (ruleMatches * 0.15 + isoScore * 0.45), 1);

  return { confirmed, confidence };
}

// ─── Anomaly Type Classification ────────────────────────────

function classifyAnomalyType(features: AnomalyFeatures): string {
  if (features.consecutive_spikes >= 3 && features.trend_slope > 0.05) {
    return "Gradual Leak";
  }
  if (features.spike_ratio > 3 && features.consecutive_spikes < 2) {
    return "Theft Event";
  }
  if (features.spike_ratio > 2.5 && Math.abs(features.trend_slope) > 0.1) {
    return "Equipment Fault";
  }
  if (features.time_context_anomaly > 1.5) {
    return "Temporal Anomaly";
  }
  return "Undefined Anomaly";
}

// ─── Reason Generation ──────────────────────────────────────

function generateReason(
  features: AnomalyFeatures,
  score: number,
  anomalyType: string,
  currentConsumption: number,
  baseline: number
): string {
  const multiples = (currentConsumption / baseline).toFixed(1);
  const durationDays = Math.ceil(features.consecutive_spikes);

  if (features.consecutive_spikes >= 3) {
    return `Consumption ${multiples}x normal over ${durationDays} days; probable ${anomalyType.toLowerCase()}.`;
  }
  if (features.spike_ratio > 2.5) {
    return `Sudden spike to ${multiples}x baseline detected; possible ${anomalyType.toLowerCase()}.`;
  }
  if (features.rolling_mean_deviation > 3) {
    return `Sustained deviation (${(features.rolling_mean_deviation).toFixed(1)} sigma) from baseline.`;
  }
  return `Unusual consumption pattern detected; confidence ${(score * 100).toFixed(0)}%.`;
}

// ─── Factor Analysis ────────────────────────────────────────

function extractFactors(features: AnomalyFeatures): string[] {
  const factors: string[] = [];

  if (features.rolling_mean_deviation > 2.5) {
    factors.push(
      `High Z-score (${features.rolling_mean_deviation.toFixed(1)} sigma)`
    );
  }
  if (features.spike_ratio > 2) {
    factors.push(`Spike ratio ${features.spike_ratio.toFixed(1)}x baseline`);
  }
  if (features.consecutive_spikes >= 2) {
    factors.push(`${Math.ceil(features.consecutive_spikes)}-day sustained spike`);
  }
  if (features.trend_slope > 0.1) {
    factors.push("Upward consumption trend");
  }
  if (features.time_context_anomaly > 1.5) {
    factors.push("Unusual for time-of-day");
  }
  if (features.consecutive_spikes >= 3) {
    factors.push("Multi-day pattern suggests leak or theft");
  }

  return factors.length > 0 ? factors : ["Insufficient data"];
}

// ─── Main Detection Pipeline ────────────────────────────────

export function detectAnomalies(
  summaries: ZoneSummary[],
  zoneHistoryMap: Map<string, ZoneRecord[]>
): AnomalyDetectionResult[] {
  const results: AnomalyDetectionResult[] = [];

  for (const summary of summaries) {
    const history = zoneHistoryMap.get(summary.zone_id) || [];

    // Engineer features from historical data
    const features = engineerFeatures(history, summary.zone_id);

    // Compute Isolation Forest-like score
    const isoScore = isolationForestScore(features);

    // Apply statistical validation
    const validation = statisticalValidation(features, isoScore);

    // Skip if not confirmed by validation
    if (!validation.confirmed) {
      results.push({
        zone_id: summary.zone_id,
        zone_name: summary.zone_name,
        anomaly_score: isoScore,
        severity: "Normal",
        reason: "No anomalies detected.",
        factors: [],
        confidence: 0,
        anomaly_type: "None",
        peak_consumption: summary.current_consumption_ML,
        baseline: summary.baseline_ML,
        duration_days: 0,
      });
      continue;
    }

    // Classify anomaly type
    const anomalyType = classifyAnomalyType(features);

    // Determine severity
    let severity: AnomalyDetectionResult["severity"];
    if (isoScore >= 0.75) {
      severity = "Critical";
    } else if (isoScore >= 0.6) {
      severity = "Probable";
    } else if (isoScore >= 0.45) {
      severity = "Suspicious";
    } else {
      severity = "Normal";
    }

    // Generate explanation
    const reason = generateReason(
      features,
      validation.confidence,
      anomalyType,
      summary.current_consumption_ML,
      summary.baseline_ML
    );

    const factors = extractFactors(features);

    results.push({
      zone_id: summary.zone_id,
      zone_name: summary.zone_name,
      anomaly_score: Math.round(isoScore * 1000) / 1000,
      severity,
      reason,
      factors,
      confidence: Math.round(validation.confidence * 100) / 100,
      anomaly_type: anomalyType,
      peak_consumption: Math.round(summary.current_consumption_ML * 10) / 10,
      baseline: Math.round(summary.baseline_ML * 10) / 10,
      duration_days: Math.ceil(features.consecutive_spikes),
    });
  }

  return results;
}

// ─── Fallback Rule-Based Detection ──────────────────────────
// Used if ML model fails to load

export function detectAnomaliesFallback(
  summaries: ZoneSummary[]
): AnomalyDetectionResult[] {
  return summaries.map((s) => {
    const ratio = s.current_consumption_ML / Math.max(s.baseline_ML, 1);
    const deviation =
      Math.abs(s.current_consumption_ML - s.baseline_ML) /
      Math.max(s.baseline_ML, 1);

    let severity: AnomalyDetectionResult["severity"] = "Normal";
    let score = 0;

    if (ratio > 3) {
      severity = "Critical";
      score = 0.9;
    } else if (ratio > 2.5) {
      severity = "Probable";
      score = 0.7;
    } else if (ratio > 1.8) {
      severity = "Suspicious";
      score = 0.55;
    } else if (deviation > 0.5) {
      severity = "Suspicious";
      score = 0.5;
    }

    const reason =
      severity === "Normal"
        ? "Within normal parameters."
        : `Consumption ${ratio.toFixed(1)}x baseline.`;

    return {
      zone_id: s.zone_id,
      zone_name: s.zone_name,
      anomaly_score: score,
      severity,
      reason,
      factors: deviation > 0.3 ? ["High deviation from baseline"] : [],
      confidence: severity === "Normal" ? 0 : 0.65,
      anomaly_type: "Statistical Alert",
      peak_consumption: s.current_consumption_ML,
      baseline: s.baseline_ML,
      duration_days: 1,
    };
  });
}
