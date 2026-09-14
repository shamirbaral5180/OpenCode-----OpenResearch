---
description: Deeply research a topic and save a cited report, source register, and search log without overwriting prior work.
agent: research
---

Conduct deep research on the following user request:

<research-request>
$ARGUMENTS
</research-request>

Apply the research agent's complete deep research workflow and evidence discipline. If no topic is provided, ask for one before searching or creating files. Clarify only material ambiguities; otherwise state assumptions and proceed through planning, broad discovery, primary-source reading, targeted follow-up, counterevidence, synthesis, and a claim-level citation audit.

Finish by finalizing the report through report_write, which writes a single self-contained HTML page at reports/<topic>/report.html (with the source register generated from the evidence ledger). If the topic directory already contains a report, select an unused numbered topic directory as specified by the agent. Preserve all existing files. Use actual searches and inspected sources, clearly label access limitations, and never manufacture evidence to fill a gap.

Finish with the answer in brief, confidence and major limitations, and the actual saved report.html path. Do not merely propose a research plan when tools and evidence allow execution.
