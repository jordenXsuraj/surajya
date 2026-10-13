// Push tokens never go into a log whole. Expo's error texts quote the token itself
// ('"ExponentPushToken[…]" is not a registered push notification recipient'), so every
// log line that may carry such a text goes through this: the first 4 characters stay,
// enough to tell two devices apart while debugging.
const PUSH_TOKEN = /(Expo(?:nent)?PushToken\[)([^\]]*)\]/g

function redactPushTokens(text) {
  return String(text ?? '').replace(PUSH_TOKEN, (_, head, id) => `${head}${id.slice(0, 4)}…]`)
}

module.exports = { redactPushTokens }
