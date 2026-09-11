import { expect, test } from "bun:test"
import { sessionEpilogue } from "../../src/util/presentation"
import { logo, marks } from "../../src/logo"
import stripAnsi from "strip-ansi"

test("formats session continuation summary", () => {
  const epilogue = sessionEpilogue({ title: "A session", sessionID: "ses_123" })
  expect(epilogue).toContain("A session")
  expect(epilogue).toContain("openresearch -s ses_123")
  expect(stripAnsi(epilogue)).toContain("OpenResearch")
})

test("text wordmark preserves the terminal logo footprint without shadow markers", () => {
  expect(logo.left).toHaveLength(4)
  expect(logo.right).toHaveLength(4)
  const lines = logo.left.map((line, index) => `${line} ${logo.right[index]}`)
  expect(lines.every((line) => line.length === 39)).toBe(true)
  expect(lines.join("\n").trim()).toBe("OpenResearch")
  expect([...marks].some((mark) => lines.join("").includes(mark))).toBe(false)
  expect(stripAnsi(sessionEpilogue({ title: "Research", sessionID: "ses_123" })).split("\n").slice(0, 4)).toEqual(
    lines.map((line) => `  ${line}`),
  )
})
