import assert from "node:assert/strict";
import test from "node:test";
import {
  createPaidWarmupSubmissionId,
  runPaidWarmupSubmission,
  savePaidWarmupWithRefresh,
} from "../src/features/classes/paidWarmupSubmission";

test("a rejected save reports the error, releases busy state, and does not call onSaved", async () => {
  const savingStates: boolean[] = [];
  let savedCalls = 0;
  let reportedError: unknown;
  const failure = new Error("cloud unavailable");

  const result = await runPaidWarmupSubmission({
    lock: { current: false },
    onSaveError: (error) => { reportedError = error; },
    onSaved: () => { savedCalls += 1; },
    onSavingChange: (saving) => savingStates.push(saving),
    save: async () => { throw failure; },
  });

  assert.equal(result, "failed");
  assert.equal(reportedError, failure);
  assert.equal(savedCalls, 0);
  assert.deepEqual(savingStates, [true, false]);
});

test("a successful save calls onSaved exactly once", async () => {
  let savedCalls = 0;
  const result = await runPaidWarmupSubmission({
    lock: { current: false },
    onSaveError: () => assert.fail("a successful save must not report an error"),
    onSaved: () => { savedCalls += 1; },
    onSavingChange: () => undefined,
    save: async () => undefined,
  });

  assert.equal(result, "saved");
  assert.equal(savedCalls, 1);
});

test("a rejected refresh does not turn a successful save into a failed save", async () => {
  const events: string[] = [];
  const saved = await savePaidWarmupWithRefresh({
    save: async () => ({ id: "warmup-1" }),
    refresh: async () => { throw new Error("refresh unavailable"); },
    onSaveSuccess: () => events.push("save-success"),
    onRefreshError: () => events.push("refresh-error"),
  });

  assert.equal(saved.id, "warmup-1");
  assert.deepEqual(events, ["save-success", "refresh-error"]);
});

test("a false refresh result reports a warning without rejecting", async () => {
  let refreshErrors = 0;
  await savePaidWarmupWithRefresh({
    save: async () => ({ id: "warmup-1" }),
    refresh: async () => false,
    onSaveSuccess: () => undefined,
    onRefreshError: () => { refreshErrors += 1; },
  });

  assert.equal(refreshErrors, 1);
});

test("savePaidWarmupWithRefresh does not absorb a rejected save", async () => {
  const failure = new Error("save unavailable");
  let refreshed = false;

  await assert.rejects(
    savePaidWarmupWithRefresh({
      save: async () => { throw failure; },
      refresh: async () => { refreshed = true; },
      onSaveSuccess: () => undefined,
      onRefreshError: () => undefined,
    }),
    failure,
  );
  assert.equal(refreshed, false);
});

test("the synchronous lock ignores a second submission", async () => {
  let releaseSave: (() => void) | undefined;
  const pendingSave = new Promise<void>((resolve) => { releaseSave = resolve; });
  const lock = { current: false };
  let saveCalls = 0;
  let savedCalls = 0;
  const input = {
    lock,
    onSaveError: () => assert.fail("the pending save must not fail"),
    onSaved: () => { savedCalls += 1; },
    onSavingChange: () => undefined,
    save: async () => { saveCalls += 1; await pendingSave; },
  };

  const first = runPaidWarmupSubmission(input);
  const second = await runPaidWarmupSubmission(input);
  assert.equal(second, "ignored");
  assert.equal(saveCalls, 1);

  releaseSave?.();
  assert.equal(await first, "saved");
  assert.equal(savedCalls, 1);
});

test("a retry reuses the same generated UUID", async () => {
  let generatedIds = 0;
  const submissionId = createPaidWarmupSubmissionId(undefined, () => {
    generatedIds += 1;
    return "stable-warmup-id";
  });
  const attemptedIds: string[] = [];
  let attempt = 0;
  const input = {
    lock: { current: false },
    onSaveError: () => undefined,
    onSavingChange: () => undefined,
    save: async () => {
      attemptedIds.push(submissionId);
      attempt += 1;
      if (attempt === 1) throw new Error("ambiguous response");
    },
  };

  assert.equal(await runPaidWarmupSubmission(input), "failed");
  assert.equal(await runPaidWarmupSubmission(input), "saved");
  assert.equal(generatedIds, 1);
  assert.deepEqual(attemptedIds, ["stable-warmup-id", "stable-warmup-id"]);
});

test("editing uses the existing warm-up ID without generating another", () => {
  let generatedIds = 0;
  const submissionId = createPaidWarmupSubmissionId("existing-warmup-id", () => {
    generatedIds += 1;
    return "new-id";
  });

  assert.equal(submissionId, "existing-warmup-id");
  assert.equal(generatedIds, 0);
});
