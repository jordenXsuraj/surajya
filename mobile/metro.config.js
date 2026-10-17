// MEASUREMENT BUILD ONLY (branch perf/cold-start-nosentry, never merged): Expo's default Metro
// config, without Sentry.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
