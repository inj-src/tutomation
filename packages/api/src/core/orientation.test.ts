import assert from "node:assert/strict"
import test from "node:test"

import { correctionRotation } from "./orientation.js"

test("maps Paddle orientation labels to Sharp correction rotations", () => {
  assert.equal(correctionRotation(0), 0)
  assert.equal(correctionRotation(90), 270)
  assert.equal(correctionRotation(180), 180)
  assert.equal(correctionRotation(270), 90)
})
