import { NextResponse } from "next/server";
import { getAnomalies, getProposals, getDecisions, computeGiniFromDb } from "@/lib/db";
import { getSummaries } from "@/lib/data-cache";
import { computeGini } from "@/lib/fairness";
import * as XLSX from "xlsx";

export async function GET() {
  const start = Date.now();

  try {
    const summaries = getSummaries();
    let anomalies: any[] = [];
    let proposals: any[] = [];
    let decisions: any[] = [];

    // Try to fetch from database, fall back to empty arrays
    try {
      anomalies = await getAnomalies({ limit: 500 });
    } catch (e) {
      console.warn("Could not fetch anomalies from DB:", e);
    }

    try {
      proposals = await getProposals({ limit: 500 });
    } catch (e) {
      console.warn("Could not fetch proposals from DB:", e);
    }

    try {
      decisions = await getDecisions({ limit: 500 });
    } catch (e) {
      console.warn("Could not fetch decisions from DB:", e);
    }

    // Sheet 1: Anomaly Summary
    const anomalyData = anomalies
      .filter((a) => a.severity !== "Normal")
      .map((a) => ({
        Zone: a.zone_name,
        "Anomaly Score": a.anomaly_score,
        Severity: a.severity,
        Reason: a.reason,
        Confidence: a.confidence,
        "Anomaly Type": a.anomaly_type,
        "Peak Consumption (ML)": a.peak_consumption,
        "Baseline (ML)": a.baseline,
        "Duration (days)": a.duration_days,
        Timestamp: new Date(a.timestamp).toLocaleString(),
        Status: a.status,
      }));

    // Sheet 2: Redistribution Log
    const approvedProposals = proposals.filter((p) => p.status === "approved");
    const redistributionData = approvedProposals.map((p) => ({
      "Proposal ID": p.proposal_id,
      "From Zone": p.source_name,
      "To Zone": p.dest_name,
      "Volume (ML)": p.volume_ML,
      "Pressure Change (bar)": p.pressure_change_bar,
      "Gini Improvement": p.gini_improvement,
      Feasibility: p.feasibility,
      Score: p.score,
      Status: p.status,
      "Created At": new Date(p.created_at).toLocaleString(),
    }));

    // Sheet 3: Fairness Metrics
    const fulfillmentMap = new Map<string, number>();
    summaries.forEach((s) => {
      const anomaly = anomalies.find((a) => a.zone_id === s.zone_id);
      const fulfillment = anomaly
        ? 1 - anomaly.peak_consumption / Math.max(anomaly.baseline, 1)
        : 1;
      fulfillmentMap.set(s.zone_id, Math.max(0, Math.min(fulfillment, 1)));
    });

    const currentGini = computeGini(Array.from(fulfillmentMap.values()));
    const projectedGini = approvedProposals.length > 0
      ? currentGini -
          (approvedProposals.reduce((sum, p) => sum + p.gini_improvement, 0) /
            approvedProposals.length)
      : currentGini;

    const fairnessMetrics = [
      {
        Metric: "Current Gini Coefficient",
        Value: currentGini.toFixed(3),
        "Interpretation": "0=perfect equality, 1=perfect inequality",
      },
      {
        Metric: "Projected Gini Coefficient",
        Value: Math.max(0, projectedGini).toFixed(3),
        "Interpretation": "After all approved proposals",
      },
      {
        Metric: "Total Gini Improvement Possible",
        Value: (currentGini - projectedGini).toFixed(3),
        "Interpretation": "From executing all approved proposals",
      },
      {
        Metric: "Anomalies Detected",
        Value: anomalies.filter((a) => a.severity !== "Normal").length.toString(),
        "Interpretation": "Total suspicious/probable/critical cases",
      },
      {
        Metric: "Zones in Deficit",
        Value: summaries
          .filter((s) => {
            const anomaly = anomalies.find((a) => a.zone_id === s.zone_id);
            return anomaly && anomaly.severity !== "Normal";
          })
          .length.toString(),
        "Interpretation": "Zones with insufficient supply",
      },
      {
        Metric: "Redistribution Proposals",
        Value: proposals.length.toString(),
        "Interpretation": "Total proposals generated",
      },
      {
        Metric: "Approved Proposals",
        Value: approvedProposals.length.toString(),
        "Interpretation": "Proposals approved by operators",
      },
    ];

    // Sheet 4: Audit Log
    const auditData = decisions.map((d) => ({
      Timestamp: new Date(d.timestamp).toLocaleString(),
      Operator: d.operator_id,
      "Operator Name": d.operator_name || "Unknown",
      Action: d.action,
      "Record Type": d.record_type,
      "Record ID": d.record_id,
      Comment: d.comment || "—",
    }));

    // Create workbook
    const wb = XLSX.utils.book_new();

    if (anomalyData.length > 0) {
      const ws1 = XLSX.utils.json_to_sheet(anomalyData);
      XLSX.utils.book_append_sheet(wb, ws1, "Anomaly Summary");
    }

    if (redistributionData.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(redistributionData);
      XLSX.utils.book_append_sheet(wb, ws2, "Redistribution Log");
    }

    const ws3 = XLSX.utils.json_to_sheet(fairnessMetrics);
    XLSX.utils.book_append_sheet(wb, ws3, "Fairness Metrics");

    if (auditData.length > 0) {
      const ws4 = XLSX.utils.json_to_sheet(auditData);
      XLSX.utils.book_append_sheet(wb, ws4, "Audit Log");
    }

    // Write to buffer
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // Return as downloadable file
    const dateStr = new Date().toISOString().split("T")[0];
    const responseTime = Date.now() - start;
    console.log(`Report export generated in ${responseTime}ms`);

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename="water-audit-report-${dateStr}.xlsx"`,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json(
      { error: "Failed to generate export" },
      { status: 500 }
    );
  }
}
