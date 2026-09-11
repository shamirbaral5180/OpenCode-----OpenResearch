import { resolveChannel } from "./utils"

const arg = process.argv[2]
const channel = arg === "dev" || arg === "beta" || arg === "prod" ? arg : resolveChannel()

const appId =
  channel === "prod" ? "com.srbcorporation.openresearch" : `com.srbcorporation.openresearch.${channel}`
const productName = channel === "prod" ? "OpenResearch" : `OpenResearch ${channel.charAt(0).toUpperCase() + channel.slice(1)}`
const summary = `Deep research assistant${channel !== "prod" ? ` (${channel})` : ""}`

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>${appId}</id>

  <metadata_license>CC0-1.0</metadata_license>
  <project_license>MIT</project_license>

  <name>${productName}</name>
  <summary>${summary}</summary>

  <developer id="com.srbcorporation">
    <name>SRB Corporation</name>
  </developer>

  <description>
    <p>
      OpenResearch investigates questions with traceable evidence, citations, and connected research tools.
    </p>
  </description>

  <launchable type="desktop-id">${appId}.desktop</launchable>

  <content_rating type="oars-1.1" />

</component>
`

await Bun.write(`resources/${appId}.metainfo.xml`, xml)
console.log(`Generated metainfo for ${channel} at resources/${appId}.metainfo.xml`)
