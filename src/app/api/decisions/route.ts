import { NextRequest, NextResponse } from "next/server";
import {
  saveDecision,
  getDecisions,
  updateProposalStatus,
} from "@/lib/db";

// In-memory fallback for when MongoDB is unavailable
const inMemoryDecisions: any[] = [];

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "100");
    const operatorId = searchParams.get("operator_id") || undefined;

    const decisions = await getDecisions({
      operator_id: operatorId,
      limit,
    });

    return NextResponse.json({
      decision_count: decisions.length,
      decisions,
    });
  } catch (error) {
    console.error("Get decisions error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve decisions" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.action || !body.record_id) {
      return NextResponse.json(
        { error: "Missing required fields: action, record_id" },
        { status: 400 }
      );
    }

    const validActions = [
      "acknowledge",
      "investigate",
      "approve",
      "resolve",
      "reject",
    ];
    if (!validActions.includes(body.action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${validActions.join(", ")}` },
        { status: 400 }
      );
    }

    const decision = {
      operator_id: body.operator_id || "system",
      operator_name: body.operator_name,
      action: body.action,
      record_id: body.record_id,
      record_type: body.record_type || "anomaly",
      timestamp: new Date(),
      comment: body.comment,
    };

    let decisionId = "";

    // Try to save to database, fall back to in-memory
    try {
      decisionId = await saveDecision(decision);
    } catch (dbError) {
      console.warn("Database unavailable, using in-memory fallback:", dbError);
      decisionId = `mem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      inMemoryDecisions.push({ ...decision, _id: decisionId });
    }

    // If it's a proposal approval/rejection, update proposal status
    if (body.record_type === "proposal") {
      const proposalStatus =
        body.action === "approve"
          ? "approved"
          : body.action === "reject"
            ? "rejected"
            : "pending";
      try {
        await updateProposalStatus(body.record_id, proposalStatus, decisionId);
      } catch (dbError) {
        console.warn("Could not update proposal status:", dbError);
      }
    }

    return NextResponse.json(
      {
        decision_id: decisionId,
        status: "logged",
        action: body.action,
        record_id: body.record_id,
        timestamp: new Date().toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Decision POST error:", error);
    return NextResponse.json(
      { error: "Failed to log decision" },
      { status: 500 }
    );
  }
}
