# MeetNet — mobile app

Expo (SDK 57) app for MeetNet. Rules and architecture: [CLAUDE.md](CLAUDE.md).

## Run it on an Android phone (development build)

1. Install the **MeetNet Dev** APK from the latest EAS `development` build (once per native change).
2. Start the API locally (`docker compose up -d mongo`, then the server on port 5000).
3. Connect the phone over USB with USB debugging on, then:

   ```bash
   cp .env.example .env.local          # EXPO_PUBLIC_API_URL=http://localhost:5000/api
   adb reverse tcp:5000 tcp:5000       # phone → local API
   npm install
   npm run android                     # Metro + opens the dev client
   ```

## Checks

```bash
npm run check      # typecheck + lint + tests
npx expo-doctor
```
