import { NextRequest, NextResponse } from "next/server";
import { getZones, getSummaries } from "@/lib/data-cache";
import { generateProposals, classifyZones } from "@/lib/fairness";
import { saveProposal } from "@/lib/db";

export async function GET(request: NextRequest) {
  const start = Date.now();

  try {
    const searchParams = request.nextUrl.searchParams;
    const fairnessWeight = parseFloat(
      searchParams.get("fairness_weight") ?? "0.7"
    );

    const zones = getZones();
    const summaries = getSummaries();

    const { proposals, currentGini, projectedGini } = generateProposals(
      summaries,
      zones,
      fairnessWeight
    );
    const balances = classifyZones(summaries, zones);

    // Save proposals to database (async, don't block)
    proposals.forEach((p) => {
      saveProposal({
        proposal_id: p.proposal_id,
        source_zone: p.source_zone,
        source_name: p.source_name,
        dest_zone: p.dest_zone,
        dest_name: p.dest_name,
        volume_ML: p.volume_ML,
        pressure_change_bar: p.pressure_change_bar,
        gini_improvement: p.gini_improvement,
        feasibility: p.feasibility,
        score: p.score,
        created_at: new Date(),
        status: "pending",
      }).catch((e) => console.error("Failed to save proposal", e));
    });

    // Compute fairness improvement
    const giniImprovement =
      Math.round((currentGini - projectedGini) * 1000) / 1000;
    const improvementPercent = Math.round(
      ((currentGini - projectedGini) / Math.max(currentGini, 0.001)) * 100
    );

    return NextResponse.json({
      scan_timestamp: new Date().toISOString(),
      fairness_weight: fairnessWeight,
      current_gini: currentGini,
      projected_gini: projectedGini,
      gini_improvement: giniImprovement,
      improvement_percent: improvementPercent,
      deficit_count: balances.filter((b) => b.category === "deficit").length,
      surplus_count: balances.filter((b) => b.category === "surplus").length,
      proposal_count: proposals.length,
      balances,
      proposals: proposals.map((p) => ({
        ...p,
        feasibility_status:
          p.feasibility === "safe"
            ? "✓ Safe"
            : p.feasibility === "borderline"
              ? "⚠ Borderline"
              : "✗ Unsafe",
      })),
      response_time_ms: Date.now() - start,
    });
  } catch (error) {
    console.error("Redistribution error:", error);
    return NextResponse.json(
      { error: "Failed to generate proposals" },
      { status: 500 }
    );
  }
}
