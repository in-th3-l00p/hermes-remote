import { useEffect, useId, useState } from "react";
import {
  CALLERS,
  REQUESTS,
  STEPS,
  outcomeFor,
  skippedSteps,
  type CallerId,
  type RequestId,
  type StepId,
} from "./inspector-data.ts";

type StepState = "passed" | "stopped" | "skipped" | "pending";

function stateOf(
  step: StepId,
  passed: StepId[],
  stoppedAt: StepId | null,
  skipped: StepId[],
): StepState {
  if (skipped.includes(step)) {
    return "skipped";
  }
  if (passed.includes(step)) {
    return "passed";
  }
  return step === stoppedAt ? "stopped" : "pending";
}

/**
 * Pick a caller and a request; see which checkpoint lets it through or
 * sends it back, with the status and body the server really answers.
 */
export function Inspector() {
  const [caller, setCaller] = useState<CallerId>("user");
  const [request, setRequest] = useState<RequestId>("foreign");
  const [fresh, setFresh] = useState(false);
  const callerId = useId();
  const requestId = useId();
  const outcome = outcomeFor(caller, request);
  const skipped = skippedSteps(request);
  const delivered = outcome.stoppedAt === null;
  const current = CALLERS.find((c) => c.id === caller) as (typeof CALLERS)[number];
  const line = REQUESTS.find((r) => r.id === request) as (typeof REQUESTS)[number];

  // Re-press the stamp when the answer changes.
  useEffect(() => {
    setFresh(true);
    const timer = setTimeout(() => setFresh(false), 400);
    return () => clearTimeout(timer);
  }, [caller, request]);

  return (
    <div className="envelope">
      <div className="envelope-inner">
        <div className="inspector-controls">
          <div className="field">
            <label htmlFor={callerId}>Who is asking</label>
            <select
              id={callerId}
              value={caller}
              onChange={(e) => setCaller(e.target.value as CallerId)}
            >
              {CALLERS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={requestId}>What they ask for</label>
            <select
              id={requestId}
              value={request}
              onChange={(e) => setRequest(e.target.value as RequestId)}
            >
              {REQUESTS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="request-line">
          {line.line}
          <br />
          <span className="muted">{current.token}</span>
        </p>

        <ol className="route" aria-label="Checkpoints">
          {STEPS.map((step, index) => {
            const state = stateOf(step.id, outcome.passed, outcome.stoppedAt, skipped);
            return (
              <li key={step.id} data-state={state}>
                <span className="mark" aria-hidden="true">
                  {index + 1}
                </span>
                <span>
                  <span className="name">{step.name}</span>
                  <span className="visually-hidden">: {state}. </span>
                  <span className="question">
                    {state === "skipped"
                      ? "Not a chat turn and keys-only, so this doesn't apply."
                      : step.question}
                  </span>
                  {step.id === "identity" &&
                    state === "passed" &&
                    outcome.identity !== undefined && (
                      <span className="said">{outcome.identity}</span>
                    )}
                </span>
              </li>
            );
          })}
          <li data-state={delivered ? "reached" : "pending"}>
            <span className="mark" aria-hidden="true">
              ✦
            </span>
            <span>
              <span className="name">
                {request === "config" ? "The hermes CLI on your machine" : "Your Hermes agent"}
              </span>
              <span className="question">
                {delivered ? "Reached." : "Never sees this request."}
              </span>
            </span>
          </li>
        </ol>

        <div className="result" role="status" aria-live="polite">
          <div
            className="stamp"
            data-kind={delivered ? "delivered" : "returned"}
            data-fresh={fresh}
          >
            {outcome.status}
            <small>{outcome.verdict}</small>
          </div>
          <p>{outcome.detail}</p>
          <pre>{outcome.body}</pre>
        </div>
      </div>
    </div>
  );
}
