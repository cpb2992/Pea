# pea. 🌱 — iOS + Android family companion

**A little help with a lot of life.**

A real React Native / Expo mobile application project for **iPhone and Android**, personalized for Pankhuri. One source codebase builds into separate iOS and Android native applications. This release is a self-contained, offline-first personal planner. **It has not yet been compiled, device-tested, signed, submitted, or approved by Apple or Google.** See the release checklist before publishing.

## What it does

| App tab | Features that work without a server |
|---|---|
| **Home** | Personalized greeting, next three priorities, evening reset progress, daily dinner and kids' lunch suggestions |
| **Planner** | Day navigation, upcoming week strip, school/family/appointment events, recurring daily household routines, completion tracking and responsibility assignment |
| **Meals** | Lunchbox and dinner recipes with simple instructions, next-idea rotation by date, grocery ingredient collection, checkable grocery list and native sharing |
| **Work** | Generic checklist for new international admits, sample email drafts with native sharing, reference to official resources |
| **Pea Pod** | Cute resource center, **Me Time** wishlists for thrillers, spicy romance, movies, Sephora/makeup, and TikTok finds; optional private reminders, immigration resources, and privacy controls |

- **Me Time:** Create personal lists for thrillers, spicy romance, movies, makeup/Sephora wishlist and TikTok links; add notes and optional HTTPS links, cycle read/watched/tried status, and remove items by long-press. Content is entered by the user; this app does not connect to TikTok, Sephora or streaming services.
- **Design:** soft sage green, blush pink, warm cream, simple pea-pod icon, uncluttered cards, five clear tabs.
- **Local storage:** tasks, events, grocery items, meal choices and Me Time favorites use AsyncStorage on the device. Personal reminder settings and check-in history use Expo SecureStore (device-backed encrypted storage). No accounts, cloud sync, analytics, advertising, or server are configured.
- **Notifications:** an *opt-in* device-local, daily personal reminder with neutral notification text. The owner enters her own label and time, and can hide its label from the Home tab. Reminders are off by default. Delivery is subject to the operating system, permissions and power settings; Pea is not a medical product.
- **Work privacy:** no real student records or BU integration. **Do not type protected university/student information** into its free-text tasks or templates.

## Requirements

- Node.js 22.13+ and npm
- An Expo account and EAS CLI for hosted signed builds
- For App Store distribution: an Apple Developer Program membership and App Store Connect setup
- For Google Play: a Google Play Console developer account
- For local Android native builds: Android SDK/JDK; for local iOS builds: macOS/Xcode. **Expo EAS cloud builds can produce both platform builds without a Mac.**

The project uses Expo SDK 58, React Native 0.88, and React 19.3, released October 2026. At the time of writing, the SDK 58 version of the normal Expo Go app may not yet be available in app stores, so use a **development build** to test it.

## Run the source

```bash
unzip pea-ios-android-app.zip
cd pea-crossplatform
npm install
npx expo install --fix
npx expo start
```

To use a native development client:

```bash
npm install --global eas-cli
eas login
eas build:configure
# Then:
eas build --platform android --profile development
eas build --platform ios --profile development
```

You need an appropriate registered/signed iOS development device or simulator; this is not a browser app.

## Build an installable Android APK (private test)

```bash
eas build --platform android --profile preview
```

The `preview` profile has `android.buildType=apk`, which creates an installable Android APK. The resulting `.apk` link comes from Expo once cloud compilation completes.

## Build for Google Play (Android App Bundle)

1. Check that the Android `package` in `app.json` is unique and associated with your publisher account. If changed after release, it becomes a different app.
2. Create the app in Google Play Console, complete your listing, privacy policy URL, Data safety section, content rating, audience disclosures, and any applicable testing requirements.
3. Run:

```bash
eas build --platform android --profile production
```

This produces a signed `.aab`, *not an APK*. Submit in the Play Console or, after configuring a Google service-account key and API access:

```bash
eas submit --platform android --latest
```

First release can be uploaded manually through Play Console if API integration is not yet available. Publishing is subject to Google's review and testing rules.

## Build for iOS / TestFlight / App Store

1. Confirm a unique `ios.bundleIdentifier` in `app.json`.
2. Sign into Apple Developer and set up App Store Connect; EAS assists with credentials. You must control the Apple signing account.
3. For a private device test, register the device with EAS if using ad hoc/internal distribution:

```bash
eas device:create
eas build --platform ios --profile preview
```

4. For TestFlight/App Store Connect:

```bash
eas build --platform ios --profile production
eas submit --platform ios --latest
```

Finish metadata and review in App Store Connect. **Uploading a build is not App Store publication**; Apple review is required. TestFlight is generally easier for a personal surprise than public store listing.

## Before publishing

See `docs/RELEASE_CHECKLIST.md`, `docs/PRIVACY_POLICY.md`, and `store/STORE_LISTING.md`. Host the privacy policy on a public HTTPS address you control, because the store listing needs a public URL. Replace placeholder store contact details; verify the bundle identifiers; capture actual running-device screenshots; test notifications and task behavior across iOS and Android; review both platforms' privacy questions. **The sample brand name has not been trademark-cleared.**

## Data / safety boundaries

1. General plans reside locally and can be lost when changing phones/reinstalling the app. **Task assignment is a label, not live syncing with a partner's phone.** The shared grocery list is native text sharing, not a collaborative synced list.
2. Private reminders are elective and store no medication identity by default. Neither iOS nor Android guarantees alerts at an exact time. For a missed medication dose, use the product's instructions and consult a qualified clinician/pharmacist.
3. Work checklists are generic. There is *no* Outlook, SEVIS, OnBase, Terra Dotta, Campus Solutions or BU data connection. Verify all immigration guidance against official current sources and BU-approved procedures. Never paste protected student records into a personal consumer application without institutional authorization.
4. The Pea Pod government resource links are bookmarks only, **not regulatory monitoring or automatically updated alerts**.
5. This code has undergone static syntax/data checks but **runtime device testing and installation have not been possible in this environment**, which lacks npm network access, native SDKs, and signing credentials. You should test on both devices before distributing.

## Files

```
App.tsx                 Native UI + interactions (React Native/TypeScript)
index.js                Native entry point
app.json                Expo config, iOS bundle ID, Android package ID, icons
package.json            App dependencies + useful build scripts
eas.json                Preview APK and production Android AAB + iOS build profiles
src/data.ts             Local models, recipes, starter tasks, email templates, official resources
src/theme.ts            Sage / pink / cream design tokens
src/notifications.ts    Neutral, opt-in local reminders
docs/PRIVACY_POLICY.md  Privacy-policy template, requires public hosting
store/STORE_LISTING.md  Store description, keywords, draft data-safety details
```

**Official docs:** [Expo SDK 58](https://expo.dev/changelog/sdk-58) · [EAS Build](https://docs.expo.dev/build/setup/) · [Android Submit](https://docs.expo.dev/submit/android/) · [iOS Submit](https://docs.expo.dev/submit/ios/)


### Easy Android install route (GitHub cloud build)
See [`ANDROID_BUILD_NO_PC.md`](ANDROID_BUILD_NO_PC.md). The GitHub Action builds on pushes to `main` and checks APK signing before making the APK available. This is still untested on GitHub.
