import { keccak256, toUtf8Bytes } from "ethers"
import { describe, expect, test } from "vitest"
import { appendCalldataSuffix } from "../../src/orders/attribution"

/** What the fulfillment endpoints actually return, as of api-types 0.8.9. */
const API_SUFFIX = "0xcdb44011"
const CALLDATA = `0xfb0f3ee1${"00".repeat(32)}`

describe("appendCalldataSuffix", () => {
  test("appends the suffix bytes without a second 0x", () => {
    expect(appendCalldataSuffix(CALLDATA, API_SUFFIX)).toBe(
      `${CALLDATA}cdb44011`,
    )
  })

  test("the suffix the API sends is the api.opensea.io domain hash", () => {
    expect(keccak256(toUtf8Bytes("api.opensea.io")).slice(0, 10)).toBe(
      API_SUFFIX,
    )
  })

  test("accepts mixed case", () => {
    expect(appendCalldataSuffix(CALLDATA, "0xCDB44011")).toBe(
      `${CALLDATA}CDB44011`,
    )
  })

  test("returns the calldata unchanged when there is no suffix", () => {
    expect(appendCalldataSuffix(CALLDATA, undefined)).toBe(CALLDATA)
    expect(appendCalldataSuffix(CALLDATA, "")).toBe(CALLDATA)
  })

  test.each([
    ["missing 0x", "cdb44011"],
    ["too short", "0xcdb440"],
    ["too long", "0xcdb4401122"],
    ["not hex", "0xzzzzzzzz"],
    ["whole word", "opensea"],
  ])("ignores a malformed suffix (%s)", (_label, suffix) => {
    expect(appendCalldataSuffix(CALLDATA, suffix)).toBe(CALLDATA)
  })

  test("leaves the encoded arguments intact", () => {
    const withSuffix = appendCalldataSuffix(CALLDATA, API_SUFFIX)
    expect(withSuffix.startsWith(CALLDATA)).toBe(true)
    expect((withSuffix.length - CALLDATA.length) / 2).toBe(4)
  })
})
