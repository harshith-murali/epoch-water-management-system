import { NextResponse } from "next/server";
import { getSummaries, getRecords, getHistory } from "@/lib/data-cache";
import { detectAnomalies, detectAnomaliesFallback } from "@/lib/anomaly-detector";
import { saveAnomaly } from "@/lib/db";

export async function GET() {
  const start = Date.now();

  try {
    const summaries = getSummaries();
    const records = getRecords();

    // Build zone history map
    const zoneHistoryMap = new Map();
    const zoneIds = new Set(summaries.map((s) => s.zone_id));
    for (const zoneId of zoneIds) {
      zoneHistoryMap.set(zoneId, getHistory(zoneId));
    }

    // Run anomaly detection pipeline
    let detections;
    try {
      detections = detectAnomalies(summaries, zoneHistoryMap);
    } catch (error) {
      console.warn("ML detection failed, using fallback", error);
      detections = detectAnomaliesFallback(summaries);
    }

    // Save anomalies to database (async, don't block response)
    detections.forEach((d) => {
      if (d.severity !== "Normal") {
        saveAnomaly({
          zone_id: d.zone_id,
          zone_name: d.zone_name,
          anomaly_score: d.anomaly_score,
          severity: d.severity,
          reason: d.reason,
          factors: d.factors,
          confidence: d.confidence,
          anomaly_type: d.anomaly_type,
          peak_consumption: d.peak_consumption,
          baseline: d.baseline,
          duration_days: d.duration_days,
          timestamp: new Date(),
          status: "open",
        }).catch((e) => console.error("Failed to save anomaly", e));
      }
    });

    // Format response with zone coordinates
    const anomaliesWithCoords = detections
      .filter((d) => d.severity !== "Normal")
      .map((d) => {
        const summary = summaries.find((s) => s.zone_id === d.zone_id);
        return {
          ...d,
          lat: summary?.lat || 0,
          lng: summary?.lng || 0,
        };
      });

    return NextResponse.json({
      scan_timestamp: new Date().toISOString(),
      total_zones: summaries.length,
      anomaly_count: anomaliesWithCoords.length,
      critical_count: anomaliesWithCoords.filter(
        (a) => a.severity === "Critical"
      ).length,
      anomalies: anomaliesWithCoords,
      all_zones: summaries,
      response_time_ms: Date.now() - start,
    });
  } catch (error) {
    console.error("Anomaly detection error:", error);
    return NextResponse.json(
      { error: "Failed to detect anomalies" },
      { status: 500 }
    );
  }
}
