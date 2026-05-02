import { NextResponse } from "next/server";
import { getBangaloreLiveSnapshot } from "@/lib/bangalore-live-data";

/**
 * GET /api/bangalore-live
 *
 * Returns a real-time snapshot of Bangalore water supply conditions:
 *  - Live weather (Open-Meteo, free, no API key)
 *  - Cauvery / TG Halli / Hemavathy reservoir fill estimates
 *  - System-level BWSSB ground-truth numbers (2,225 MLD total supply)
 *
 * Cached server-side for 15 minutes to avoid hitting Open-Meteo on every request.
 */
export async function GET() {
  try {
    const snapshot = await getBangaloreLiveSnapshot();

    return NextResponse.json(snapshot, {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("[/api/bangalore-live] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch live Bangalore data" },
      { status: 500 }
    );
  }
}
