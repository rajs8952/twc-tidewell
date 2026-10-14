// Metro (the app's bundler). The app installs on its own (npm, not the pnpm
// workspace). Shared OmniWell code it uses:
//   @rajs8952/core              linked in package.json (no dependencies)
//   @rajs8952/storage/supabase  Supabase queries for every tracker
//   @rajs8952/trackers/hub      the Home cards' summaries
//   @rajs8952/interventions     the crisis and support prompts' rules
//   @omniwell/web/*             plain logic from the website's lib/ (insights, programmes, tips)
// The last three are read straight from packages/ (their package.json lists the
// website's workspace dependencies, which npm can't install). Everything they
// import at runtime is @rajs8952/core; their supabase-js imports are types only.
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const packages = path.resolve(__dirname, '../../packages')
const SHARED = {
  '@rajs8952/storage/supabase': path.join(packages, 'storage/src/supabase.ts'),
  '@rajs8952/trackers/hub': path.join(packages, 'trackers/src/hub.ts'),
  '@rajs8952/interventions': path.join(packages, 'interventions/src/index.ts'),
}

const webLib = path.resolve(__dirname, '../web/lib')

const config = getDefaultConfig(__dirname)

config.watchFolders = [...['core', 'storage', 'trackers', 'interventions'].map((p) => path.join(packages, p)), webLib]
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')]
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (SHARED[moduleName]) return { type: 'sourceFile', filePath: SHARED[moduleName] }
  // Only modules that are plain TypeScript (no React, Next.js or browser APIs) are imported this way.
  if (moduleName.startsWith('@omniwell/web/')) return { type: 'sourceFile', filePath: path.join(webLib, `${moduleName.slice('@omniwell/web/'.length)}.ts`) }
  // Shared code resolves @rajs8952/core (and anything else) from this app's node_modules.
  if (moduleName.startsWith('@rajs8952/core')) {
    return context.resolveRequest({ ...context, originModulePath: path.join(__dirname, 'package.json') }, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
