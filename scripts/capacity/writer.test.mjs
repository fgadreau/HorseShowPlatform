import assert from "node:assert/strict";
import test from "node:test";
import { hasCapacityDeliveryWindow } from "./writer.mjs";

test("réserve un intervalle complet pour livrer la dernière mutation", () => {
  const deadline = 300_000;
  const interval = 5_000;

  assert.equal(hasCapacityDeliveryWindow(295_000, deadline, interval), true);
  assert.equal(hasCapacityDeliveryWindow(295_001, deadline, interval), false);
  assert.equal(hasCapacityDeliveryWindow(300_000, deadline, interval), false);
});
