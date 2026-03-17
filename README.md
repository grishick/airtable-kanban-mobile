# Airtable Kanban Mobile

A mobile Kanban board app built with React Native and Expo.

---

## Setup on a New Machine

The `ios` and `android` folders are not committed to the repository — they are generated from the project configuration.

### Prerequisites

- [Node.js](https://nodejs.org/)
- [Xcode](https://apps.apple.com/us/app/xcode/id497799835) (Mac App Store) — for iOS
- [Android Studio](https://developer.android.com/studio) — for Android
- CocoaPods (iOS only):
  ```bash
  brew install cocoapods
  ```

### Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Generate native folders:**
   ```bash
   # Both platforms
   npx expo prebuild

   # iOS only
   npx expo prebuild --platform ios

   # Android only
   npx expo prebuild --platform android
   ```
   `prebuild` also runs `pod install` for iOS automatically.

3. **Open in Xcode (iOS):**
   ```bash
   open ios/airtable-kanban-mobile.xcworkspace
   ```
   > Always open the `.xcworkspace` file, not `.xcodeproj`.

4. **Open in Android Studio (Android):**
   Open Android Studio → **Open** → select the `android/` folder.

---

## Running the App

### iOS Simulator

```bash
npm run ios
```

To target a specific simulator:
```bash
npx expo run:ios --simulator "iPhone 16 Pro"
```

List available simulators:
```bash
xcrun simctl list devices available
```

### Android Emulator

Start an emulator from Android Studio (AVD Manager), then:
```bash
npm run android
```

To target a specific emulator:
```bash
npx expo run:android --device <emulator-name>
```

List available devices/emulators:
```bash
adb devices
```

### iOS Physical Device

1. Connect your iPhone via USB.
2. In Xcode, select your device from the target device dropdown.
3. Sign the app: go to **Signing & Capabilities** → select your Apple Developer Team.
4. Press **Run (▶)** in Xcode, or:
   ```bash
   npx expo run:ios --device
   ```
   Expo will prompt you to select the connected device.

> The device must be registered in your Apple Developer account or use personal team signing (free, limited to 7-day installs).

### Android Physical Device

1. Enable **Developer Options** and **USB Debugging** on your Android device.
2. Connect via USB.
3. Verify the device is detected:
   ```bash
   adb devices
   ```
4. Run:
   ```bash
   npx expo run:android --device
   ```

### Expo Go (Quick Development)

For rapid iteration without a native build, use the [Expo Go](https://expo.dev/go) app:
```bash
npm start
```
Scan the QR code with Expo Go on your device.

> Note: Expo Go has limitations with native modules. This project uses `expo-sqlite` and `expo-secure-store`, which are supported in Expo Go.

---

## Building for Release

This project uses [EAS Build](https://docs.expo.dev/build/introduction/) (Expo Application Services) for production builds.

### Install EAS CLI

```bash
npm install -g eas-cli
eas login
```

### Configure EAS (first time only)

```bash
eas build:configure
```

This creates an `eas.json` file at the project root.

### Build for iOS

```bash
# Development build (installable on registered devices)
eas build --platform ios --profile development

# Production build (for App Store submission)
eas build --platform ios --profile production
```

### Build for Android

```bash
# APK (for direct device installation / testing)
eas build --platform android --profile preview

# AAB (for Google Play submission)
eas build --platform android --profile production
```

### Local builds (without EAS cloud)

```bash
eas build --platform ios --local
eas build --platform android --local
```

---

## Publishing to App Stores

### Apple App Store

**Prerequisites:**
- Paid [Apple Developer Program](https://developer.apple.com/programs/) membership ($99/year)
- App record created in [App Store Connect](https://appstoreconnect.apple.com/)
- Bundle identifier in `app.json` must match the App Store Connect app: `com.anonymous.airtable-kanban-mobile`
  > Update the bundle identifier to something unique before submitting (e.g. `com.yourcompany.airtablekanban`)

**Submit with EAS:**
```bash
eas submit --platform ios
```
EAS will upload the latest production build to App Store Connect for review.

**Manual submission:**
1. Download the `.ipa` from EAS dashboard.
2. Open **Xcode → Window → Organizer**.
3. Click **Distribute App** and follow the upload wizard.

### Google Play Store

**Prerequisites:**
- [Google Play Developer](https://play.google.com/console/) account ($25 one-time fee)
- App created in Google Play Console
- Package name in `app.json` must match the Play Console app
  > Set `android.package` in `app.json` (e.g. `com.yourcompany.airtablekanban`) before your first submission — it cannot be changed after publish

**Submit with EAS:**
```bash
eas submit --platform android
```

**Manual submission:**
1. Download the `.aab` from EAS dashboard.
2. In Google Play Console, go to **Production → Releases → Create new release**.
3. Upload the `.aab` and complete the release.

---

## Over-the-Air Updates (OTA)

For JS/asset-only changes (no native code changes), you can push updates instantly without going through app store review:

```bash
eas update --branch production --message "Fix card drag behavior"
```

> OTA updates require EAS Update to be configured. Run `eas update:configure` to set it up.
