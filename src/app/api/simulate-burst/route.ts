import { NextRequest, NextResponse } from "next/server";
import { setDemoSummaries } from "@/lib/data-cache";

export async function POST(request: NextRequest) {
  try {
    const { zone_id, zone_name } = await request.json();

    // Simulate a massive burst for this specific zone
    setDemoSummaries([
      {
        zone_id,
        current_consumption_ML: 400, // huge leak
        anomaly_score: 0.95,
        severity: 'Critical',
        anomaly_type: 'pipe_rupture',
        reason: `Sudden supply collapse. Pipe rupture confirmed at ${zone_name}.`,
        factors: ["Sudden Drop", "Pressure Loss"],
        pressure_bar: 0.8,
        fulfillment_pct: 25,
      }
    ], [
      { zone_id, supply_capacity_ML: 100 } // massively drop capacity/supply
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/simulate-burst] Error:", error);
    return NextResponse.json({ success: false, error: "Failed to simulate burst." }, { status: 500 });
  }
}
