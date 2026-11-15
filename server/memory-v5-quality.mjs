/** Conservative retrieval/evidence diagnostic. Never certifies AI text as true. */
import {randomUUID} from "node:crypto";
import {withCoreDatabase} from "./core-db.mjs";
import {auditAnswerEvidence,checkRetrievalCompleteness} from "./memory-v5-reasoning.mjs";
export function recordAnswerAudit(query,answer,memories){
  const evidence=auditAnswerEvidence(answer,memories);
  const completeness=checkRetrievalCompleteness(query,memories);
  const result={supportedByIndependentVerification:false,
    lexicalCoverage:evidence.coverage,
    retrieved:completeness.retrieved,
    missingQueryTerms:completeness.uncoveredTerms.length,
    shouldRetry:completeness.shouldRetry,
    sourceIds:(evidence.sourceIds||[]).slice(0,12)};
  withCoreDatabase(db=>db.prepare("INSERT INTO memory_quality_runs(id,kind,payload,created_at) VALUES(?,?,?,?)")
    .run(randomUUID(),"answer-evidence",JSON.stringify(result),new Date().toISOString()));
  return result;
}
