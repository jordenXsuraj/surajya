// Expo's default Metro config plus Sentry's debug ids, which tie each release bundle to the source
// map the EAS build uploads (src/lib/monitoring.ts). No other changes to the defaults.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
