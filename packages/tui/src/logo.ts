export const logo = {
  // Keep the four-row, 39-column footprint without extending the block glyph geometry.
  left: Array.from({ length: 4 }, () => " ".repeat(11)),
  right: ["", "OpenResearch", "", ""].map((line) => line.padEnd(27)),
}

export const go = {
  left: ["    ", "█▀▀▀", "█_^█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
}

export const marks = "_^~,"
