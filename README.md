# Airtable Kanban Mobile

A mobile Kanban board app built with React Native and Expo.

## Setup on a New Machine

The `ios` and `android` folders are not committed to the repository — they are generated from the project configuration.

### Prerequisites

- [Node.js](https://nodejs.org/)
- [Xcode](https://apps.apple.com/us/app/xcode/id497799835) (from the Mac App Store)
- CocoaPods:
  ```bash
  brew install cocoapods
  ```

### Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Generate the native iOS folder:**
   ```bash
   npx expo prebuild --platform ios
   ```
   This also runs `pod install` automatically.

3. **Open in Xcode:**
   ```bash
   open ios/airtable-kanban-mobile.xcworkspace
   ```
   > Always open the `.xcworkspace` file, not `.xcodeproj`.

## Running the App

```bash
# Start the Expo dev server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android
```
