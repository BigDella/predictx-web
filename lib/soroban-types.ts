/**
 * Soroban ScVal <-> TypeScript Conversion Utilities (#20, #332)
 */

import { xdr, nativeToScVal, scValToNative } from "@stellar/stellar-sdk";
import type { Poll, PollCategory, PollStatus, Stake, StellarPublicKey } from "@/types";

/** 1 XLM = 10,000,000 stroops */
export const STROOPS_PER_XLM = 10_000_000;

/**
 * Converts XLM amount (floating or integer) to stroops (integer bigint)
 */
export function xlmToStroops(xlmAmount: number): bigint {
  return BigInt(Math.floor(xlmAmount * STROOPS_PER_XLM));
}

/**
 * Converts stroops (integer or bigint) to XLM (number)
 */
export function stroopsToXlm(stroops: bigint | number): number {
  return Number(stroops) / STROOPS_PER_XLM;
}

/**
 * CreatePollInput definition matching contract parameters
 */
export interface CreatePollInput {
  matchId: string;
  question: string;
  options: string[];
  stakeAmount: number;
}

/**
 * Convert frontend CreatePollInput to Soroban ScVal
 */
export function pollToScVal(poll: CreatePollInput): xdr.ScVal {
  return nativeToScVal({
    match_id: poll.matchId,
    question: poll.question,
    options: poll.options,
    stake_amount: xlmToStroops(poll.stakeAmount),
  });
}

/**
 * Convert stake amount in XLM to Soroban ScVal (i128)
 */
export function stakeToScVal(amountXlm: number): xdr.ScVal {
  const stroops = xlmToStroops(amountXlm);
  return nativeToScVal(stroops, { type: "i128" });
}

function decodedRecord(val: xdr.ScVal): Record<string, unknown> {
  const raw = scValToNative(val);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Expected a Soroban record");
  }
  return raw as Record<string, unknown>;
}

function field(raw: Record<string, unknown>, ...names: string[]): unknown {
  return names.map((name) => raw[name]).find((value) => value !== undefined && value !== null);
}

function bigintField(value: unknown, name: string): bigint {
  if (typeof value === "bigint" || typeof value === "number" || typeof value === "string") {
    return BigInt(value);
  }
  throw new Error(`Invalid Soroban ${name}`);
}

function pollCategory(value: unknown): PollCategory {
  return value === "player_event" || value === "score_prediction" || value === "other"
    ? value
    : "team_event";
}

function pollStatus(value: unknown): PollStatus {
  return value === "locked" || value === "voting" || value === "admin-review" ||
    value === "multi-sig-review" || value === "dispute" || value === "resolved"
    ? value
    : "active";
}

function stakeStatus(value: unknown): Stake["status"] {
  return value === "won" || value === "lost" || value === "pending_resolution"
    ? value
    : "active";
}

/**
 * Convert Soroban ScVal to frontend Poll
 */
export function scValToPoll(val: xdr.ScVal): Poll {
  const raw = decodedRecord(val);
  const yesPoolStroops = bigintField(field(raw, "yes_pool", "yesPool") ?? 0, "yes_pool");
  const noPoolStroops = bigintField(field(raw, "no_pool", "noPool") ?? 0, "no_pool");
  const totalStroops = yesPoolStroops + noPoolStroops;

  const yesPool = stroopsToXlm(yesPoolStroops);
  const noPool = stroopsToXlm(noPoolStroops);
  const totalPool = stroopsToXlm(totalStroops);

  const yesPercentage =
    totalPool > 0 ? Math.round((yesPool / totalPool) * 100) : 50;
  const noPercentage =
    totalPool > 0 ? 100 - yesPercentage : 50;

  return {
    id: String(field(raw, "id", "poll_id") ?? "0"),
    matchId: String(field(raw, "match_id", "matchId") ?? ""),
    question: String(raw.question ?? ""),
    category: pollCategory(raw.category),
    yesPool,
    noPool,
    totalPool,
    yesPercentage,
    noPercentage,
    yesParticipants: Number(field(raw, "yes_participants", "yesParticipants") ?? 0),
    noParticipants: Number(field(raw, "no_participants", "noParticipants") ?? 0),
    lockTime: raw.lock_time ? new Date(Number(raw.lock_time) * 1000).toISOString() : new Date().toISOString(),
    status: pollStatus(raw.status),
    resolutionStatus: raw.resolution_status as Poll["resolutionStatus"],
    result: raw.result as Poll["result"],
    createdBy: String(field(raw, "created_by", "creator") ?? "") as StellarPublicKey,
    createdAt: raw.created_at ? new Date(Number(raw.created_at) * 1000).toISOString() : new Date().toISOString(),
    resolvedAt: raw.resolved_at ? new Date(Number(raw.resolved_at) * 1000).toISOString() : undefined,
    stakes: [],
    votes: [],
    yesPoolStroops,
    noPoolStroops,
    contractSeq: Number(field(raw, "contract_seq", "sequence") ?? 0),
  };
}

/**
 * Convert Soroban ScVal to frontend Stake
 */
export function scValToStake(val: xdr.ScVal): Stake {
  const raw = decodedRecord(val);
  const amountStroops = bigintField(field(raw, "amount", "amount_stroops") ?? 0, "amount");
  const amount = stroopsToXlm(amountStroops);

  return {
    id: String(field(raw, "id", "stake_id") ?? "0"),
    pollId: String(field(raw, "poll_id", "pollId") ?? ""),
    matchId: String(field(raw, "match_id", "matchId") ?? ""),
    userId: String(field(raw, "user_id", "voter", "user") ?? "") as StellarPublicKey,
    side: raw.side === 1 || raw.side === "yes" ? "yes" : "no",
    amount,
    timestamp: raw.timestamp ? new Date(Number(raw.timestamp) * 1000).toISOString() : new Date().toISOString(),
    status: stakeStatus(raw.status),
    potentialWinnings: raw.potential_winnings ? stroopsToXlm(bigintField(raw.potential_winnings, "potential_winnings")) : undefined,
    actualWinnings: raw.actual_winnings ? stroopsToXlm(bigintField(raw.actual_winnings, "actual_winnings")) : undefined,
    amountStroops,
  };
}
