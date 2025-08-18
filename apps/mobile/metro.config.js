// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Alias 'tslib' to its ESM build to fix "cannot destructure __extends of default" on web
// Ref: https://www.amarjanica.com/solved-in-metro-cannot-destructure-property-__extends-of-_tslib-default-as-it-is-undefined/
const ALIASES = {
  tslib: require.resolve('tslib/tslib.es6.js'),
};

// Keep any existing resolver and inject our alias
const prevResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const target = ALIASES[moduleName] ?? moduleName;
  const resolver = prevResolveRequest ?? context.resolveRequest;
  return resolver(context, target, platform);
};

module.exports = config;
