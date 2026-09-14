# Research Reports

Use `/research <question>` to create a new research bundle:

- `reports/<topic>/report.html`: the final research report as a single self-contained HTML page (findings, claim-level citations, counterevidence, confidence, limitations, and the generated source register).
- `reports/<topic>/evidence.jsonl`: the append-only evidence ledger of source/claim records the report is validated against.

`report_write` renders the HTML page from the markdown report and the ledger; it does not write a markdown or text report. The source register is generated from the ledger, never authored by the model, and an optional search log is rendered into the page as an appendix.

Existing bundles must not be overwritten. Use a new numbered topic directory for subsequent runs.
Use `/verify <report-path>` to audit a report without modifying its original evidence.

These files are research artifacts, not guarantees of accuracy or exhaustiveness. Review consequential conclusions against the cited primary sources. Never commit credentials, private source material, or copyrighted full texts without authorization.
