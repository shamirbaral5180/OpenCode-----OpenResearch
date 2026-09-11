import path from "path"

process.env.OPENRESEARCH_DB = ":memory:"
process.env.NPM_CONFIG_AUDIT = "false"
process.env.OPENRESEARCH_MODELS_PATH = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
process.env.OPENRESEARCH_DISABLE_MODELS_FETCH = "true"
