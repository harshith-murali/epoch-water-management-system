import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getBangaloreLiveSnapshot } from "@/lib/bangalore-live-data";

export interface AiAdvisorRequest {
 zones: Array<{
 zone_id: string;
 zone_name: string;
 severity: string;
 fulfillment_pct: number;
 pressure_bar: number;
 anomaly_type: string | null;
 }>;
 burstZoneIds: string[];
 deficitCount: number;
 avgPressure: number;
 mode: "normal" | "disaster";
}

export async function POST(request: NextRequest) {
 const apiKey = process.env.GEMINI_API_KEY;

 if (!apiKey || apiKey === "your_key_here") {
 return NextResponse.json(
 { error: "GEMINI_API_KEY not configured in .env.local", advice: [] },
 { status: 503 }
 );
 }

 try {
 const body: AiAdvisorRequest = await request.json();
 const { zones, burstZoneIds, deficitCount, avgPressure, mode } = body;

 // ── Fetch real Bangalore live data for Gemini context ────────
 let liveContext = "";
 try {
 const live = await getBangaloreLiveSnapshot();
 liveContext = `
Real-time Bangalore Water System Context (BWSSB Official Data + Live Sensors):
- Total city Cauvery supply: ${live.system.total_supply_MLD} MLD (Cauvery Stage IV + Stage V, commissioned Oct 2024)
- City-wide NRW: ${live.system.nrw_pct}% → effective supply: ${live.system.effective_supply_MLD} MLD
- Avg per-capita consumption: ${live.system.per_capita_lpcd_avg} lpcd
- Current Bangalore weather: ${live.weather.temperature_c}°C, humidity ${live.weather.humidity_pct}%, today's rainfall: ${live.weather.rainfall_mm_today}mm (${live.weather.description})
- KRS/Cauvery reservoir fill: ${live.reservoir.cauvery_fill_pct}% | TG Halli: ${live.reservoir.tg_halli_fill_pct}% | Hemavathy: ${live.reservoir.hemavathy_fill_pct}%
- Season: ${live.system.season.replace("_", " ")} — demand modifier ${live.system.seasonal_modifier}x above winter baseline
- Data as of: ${new Date(live.timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`;
 } catch {
 liveContext = `
Real-time Bangalore Context (BWSSB Official Data):
- Total Cauvery supply: 2,225 MLD (post Stage V, Oct 2024)
- City-wide NRW: ~27.2% | Effective supply: ~1,621 MLD
- Season: pre_monsoon — demand ~25% above winter baseline`;
 }

 const anomalousZones = zones.filter(z => z.severity !== "Normal");
 const criticalZones = zones.filter(z => z.severity === "Critical");
 const lowPressureZones = zones.filter(z => z.pressure_bar < 2.0);

 const prompt = `You are an AI water infrastructure advisor for the Epoch Water Management System, supporting BWSSB (Bangalore Water Supply & Sewerage Board) operations for Bengaluru (Bangalore), India.
${liveContext}

Current network status:
- Mode: ${mode === "disaster" ? "⚠️ DISASTER MODE ACTIVE" : "Normal Operations"}
- Average system pressure: ${avgPressure.toFixed(1)} bar
- Deficit zones: ${deficitCount}
- Anomalous zones (${anomalousZones.length}): ${anomalousZones.map(z => `${z.zone_name} [${z.severity}, ${z.fulfillment_pct}% supplied, ${z.pressure_bar.toFixed(1)} bar${z.anomaly_type ? ", type: " + z.anomaly_type : ""}]`).join("; ") || "none"}
- Critical zones (${criticalZones.length}): ${criticalZones.map(z => z.zone_name).join(", ") || "none"}
- Low pressure zones (<2.0 bar): ${lowPressureZones.map(z => `${z.zone_id} (${z.pressure_bar.toFixed(1)} bar)`).join(", ") || "none"}
${burstZoneIds.length > 0 ? `- ⚠️ PIPE BURST detected at: ${burstZoneIds.join(", ")}` : ""}

Provide exactly 4 concise, actionable recommendations for the BWSSB operator. Each recommendation must:
1. Be specific to the Bangalore context — reference real zone names, current reservoir levels, or seasonal context
2. Reference actual zone names or IDs where relevant
3. Be 1-2 sentences maximum
4. Be immediately actionable for a BWSSB field engineer or operator

Return ONLY a JSON array of 4 strings (the recommendations), no markdown, no extra text. Example format:
["recommendation 1", "recommendation 2", "recommendation 3", "recommendation 4"]`;

 const genAI = new GoogleGenerativeAI(apiKey);
 const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

 const result = await model.generateContent(prompt);
 const text = result.response.text().trim();

 // Parse the JSON array from Gemini's response
 const jsonMatch = text.match(/\[[\s\S]*\]/);
 if (!jsonMatch) throw new Error("Invalid response format from Gemini");

 const advice: string[] = JSON.parse(jsonMatch[0]);

 return NextResponse.json({ advice: advice.slice(0, 4) });
 } catch (error) {
 console.error("[/api/ai-advisor] Error:", error);
 return NextResponse.json(
 {
 error: error instanceof Error ? error.message : "Unknown error",
 advice: [],
 },
 { status: 500 }
 );
 }
}
