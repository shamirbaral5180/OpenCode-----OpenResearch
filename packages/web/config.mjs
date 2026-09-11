const stage = process.env.SST_STAGE || "dev"

export default {
  url: stage === "production" ? "https://openresearch.ai" : `https://${stage}.openresearch.ai`,
  console: stage === "production" ? "https://openresearch.ai/auth" : `https://${stage}.openresearch.ai/auth`,
  email: "help@anoma.ly",
  socialCard: "https://social-cards.sst.dev",
  github: "https://github.com/anomalyco/openresearch",
  discord: "https://openresearch.ai/discord",
  headerLinks: [
    { name: "app.header.home", url: "/" },
    { name: "app.header.docs", url: "/docs/" },
  ],
}
