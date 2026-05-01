// ──────────────────────────────────────────────────────────────
// Database — MongoDB connection and models
// Stores anomalies, proposals, operator decisions, and audit logs
// ──────────────────────────────────────────────────────────────

import { MongoClient, Db, Collection } from "mongodb";

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://demo:demo@demo.mongodb.net/water_system?retryWrites=true&w=majority";
const DB_NAME = "water_system";

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectDB(): Promise<Db> {
  if (cachedDb) {
    return cachedDb;
  }

  try {
    const client = await MongoClient.connect(MONGODB_URI);
    cachedClient = client;
    cachedDb = client.db(DB_NAME);

    // Ensure collections exist with indexes
    await initializeCollections(cachedDb);

    return cachedDb;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
}

async function initializeCollections(db: Db): Promise<void> {
  const collections = await db.listCollections().toArray();
  const collectionNames = collections.map((c) => c.name);

  // Anomalies collection
  if (!collectionNames.includes("anomalies")) {
    await db.createCollection("anomalies");
  }
  const anomalies = db.collection("anomalies");
  await anomalies.createIndex({ zone_id: 1, timestamp: -1 });
  await anomalies.createIndex({ severity: 1 });

  // Proposals collection
  if (!collectionNames.includes("proposals")) {
    await db.createCollection("proposals");
  }
  const proposals = db.collection("proposals");
  await proposals.createIndex({ proposal_id: 1 });
  await proposals.createIndex({ created_at: -1 });

  // Decisions collection
  if (!collectionNames.includes("decisions")) {
    await db.createCollection("decisions");
  }
  const decisions = db.collection("decisions");
  await decisions.createIndex({ operator_id: 1, timestamp: -1 });
  await decisions.createIndex({ record_id: 1 });

  // Audit log collection
  if (!collectionNames.includes("audit_log")) {
    await db.createCollection("audit_log");
  }
  const auditLog = db.collection("audit_log");
  await auditLog.createIndex({ timestamp: -1 });
  await auditLog.createIndex({ action: 1 });
}

// ─── Anomaly Record ─────────────────────────────────────────

export interface AnomalyRecord {
  zone_id: string;
  zone_name: string;
  anomaly_score: number;
  severity: "Normal" | "Suspicious" | "Probable" | "Critical";
  reason: string;
  factors: string[];
  confidence: number;
  anomaly_type: string;
  peak_consumption: number;
  baseline: number;
  duration_days: number;
  timestamp: Date;
  status: "open" | "acknowledged" | "investigating" | "resolved";
  operator_notes?: string;
}

export async function saveAnomaly(anomaly: AnomalyRecord): Promise<string> {
  const db = await connectDB();
  const result = await db.collection("anomalies").insertOne({
    ...anomaly,
    timestamp: anomaly.timestamp || new Date(),
  });
  return result.insertedId.toString();
}

export async function getAnomalies(
  filters?: { zone_id?: string; severity?: string; limit?: number }
): Promise<AnomalyRecord[]> {
  const db = await connectDB();
  const query: any = {};

  if (filters?.zone_id) query.zone_id = filters.zone_id;
  if (filters?.severity) query.severity = filters.severity;

  const limit = filters?.limit || 100;
  return await db
    .collection("anomalies")
    .find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray() as any;
}

// ─── Proposal Record ────────────────────────────────────────

export interface ProposalRecord {
  proposal_id: string;
  source_zone: string;
  source_name: string;
  dest_zone: string;
  dest_name: string;
  volume_ML: number;
  pressure_change_bar: number;
  gini_improvement: number;
  feasibility: "safe" | "borderline" | "unsafe";
  score: number;
  created_at: Date;
  status: "pending" | "approved" | "rejected" | "executed";
  decision_id?: string;
}

export async function saveProposal(proposal: ProposalRecord): Promise<string> {
  const db = await connectDB();
  const result = await db.collection("proposals").insertOne({
    ...proposal,
    created_at: proposal.created_at || new Date(),
  });
  return result.insertedId.toString();
}

export async function getProposals(
  filters?: { status?: string; limit?: number }
): Promise<ProposalRecord[]> {
  const db = await connectDB();
  const query: any = {};

  if (filters?.status) query.status = filters.status;

  const limit = filters?.limit || 50;
  return await db
    .collection("proposals")
    .find(query)
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray() as any;
}

export async function updateProposalStatus(
  proposalId: string,
  status: string,
  decisionId?: string
): Promise<void> {
  const db = await connectDB();
  await db.collection("proposals").updateOne(
    { proposal_id: proposalId },
    {
      $set: {
        status,
        decision_id: decisionId,
        updated_at: new Date(),
      },
    }
  );
}

// ─── Decision Record ────────────────────────────────────────

export interface DecisionRecord {
  operator_id: string;
  operator_name?: string;
  action: "acknowledge" | "investigate" | "approve" | "resolve" | "reject";
  record_id: string;
  record_type: "anomaly" | "proposal";
  timestamp: Date;
  comment?: string;
}

export async function saveDecision(decision: DecisionRecord): Promise<string> {
  const db = await connectDB();
  const result = await db.collection("decisions").insertOne({
    ...decision,
    timestamp: decision.timestamp || new Date(),
  });

  // Also log to audit trail
  await logAuditEvent({
    action: `decision_${decision.action}`,
    operator_id: decision.operator_id,
    record_id: decision.record_id,
    record_type: decision.record_type,
    comment: decision.comment,
    timestamp: new Date(),
  });

  return result.insertedId.toString();
}

export async function getDecisions(
  filters?: { operator_id?: string; record_type?: string; limit?: number }
): Promise<DecisionRecord[]> {
  const db = await connectDB();
  const query: any = {};

  if (filters?.operator_id) query.operator_id = filters.operator_id;
  if (filters?.record_type) query.record_type = filters.record_type;

  const limit = filters?.limit || 100;
  return await db
    .collection("decisions")
    .find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray() as any;
}

// ─── Audit Log Record ───────────────────────────────────────

export interface AuditLogRecord {
  action: string;
  operator_id?: string;
  record_id?: string;
  record_type?: string;
  comment?: string;
  timestamp: Date;
}

export async function logAuditEvent(event: AuditLogRecord): Promise<void> {
  const db = await connectDB();
  await db.collection("audit_log").insertOne({
    ...event,
    timestamp: event.timestamp || new Date(),
  });
}

export async function getAuditLog(
  filters?: { limit?: number; since?: Date }
): Promise<AuditLogRecord[]> {
  const db = await connectDB();
  const query: any = {};

  if (filters?.since) {
    query.timestamp = { $gte: filters.since };
  }

  const limit = filters?.limit || 200;
  return await db
    .collection("audit_log")
    .find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray() as any;
}

// ─── Cleanup (for demo/testing) ─────────────────────────────

export async function clearDemoData(): Promise<void> {
  const db = await connectDB();
  await db.collection("anomalies").deleteMany({});
  await db.collection("proposals").deleteMany({});
  await db.collection("decisions").deleteMany({});
  await db.collection("audit_log").deleteMany({});
}

// ─── Helper: Compute Gini from DB anomalies ─────────────────

export async function computeGiniFromDb(): Promise<number> {
  const anomalies = await getAnomalies({ limit: 1000 });

  if (anomalies.length === 0) return 0;

  // Build fulfillment map (inverse of consumption ratio)
  const fulfillments = anomalies.map((a) => {
    const ratio = a.peak_consumption / Math.max(a.baseline, 1);
    return Math.max(0, Math.min(1 / ratio, 1));
  });

  // Compute Gini
  if (fulfillments.length === 0) return 0;
  const sorted = [...fulfillments].sort((a, b) => a - b);
  const n = sorted.length;
  const totalSum = sorted.reduce((a, b) => a + b, 0);
  if (totalSum === 0) return 0;

  let weightedSum = 0;
  for (let i = 0; i < n; i++) {
    weightedSum += (2 * (i + 1) - n - 1) * sorted[i];
  }
  return Math.round((weightedSum / (n * totalSum)) * 1000) / 1000;
}
