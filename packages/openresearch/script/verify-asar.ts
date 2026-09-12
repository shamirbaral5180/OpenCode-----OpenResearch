import fs from "fs"

const file = process.argv[2]
const text = fs.readFileSync(file).toString("latin1")

const checks: Array<[string, string]> = [
  ["appendLine has action param", 'appendLine = (fs16, directory2, topic, record11, action'],
  ["appendLine routes update", 'action === "update" ? update'],
  ["collapse exists", "function collapse(records)"],
  ["RecordSchema exists", "RecordSchema = exports_Schema.Struct"],
  ["parse decodes via RecordSchema", "decodeUnknownOption(RecordSchema"],
  ["html missing citation check", "is missing citation"],
  ["ledger error surfaced", "evidence ledger"],
  ["worktree-relative evidence pattern", "path80.relative(instance2.worktree"],
]

let all = true
for (const [label, needle] of checks) {
  const ok = text.includes(needle)
  if (!ok) all = false
  console.log(`${ok ? "OK  " : "MISS"}  ${label}`)
}
console.log(all ? "\nALL FIXES PRESENT IN PACKAGED ASAR" : "\nSOME FIXES MISSING")
