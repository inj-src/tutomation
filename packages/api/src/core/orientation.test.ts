import assert from "node:assert/strict"
import test from "node:test"

import { correctionRotation } from "./orientation.js"

test("uses LiteRT's clockwise correction directly with Sharp", () => {
  assert.equal(correctionRotation(0), 0)
  assert.equal(correctionRotation(90), 90)
  assert.equal(correctionRotation(180), 180)
  assert.equal(correctionRotation(270), 270)
})
