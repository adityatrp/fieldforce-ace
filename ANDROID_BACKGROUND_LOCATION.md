# Enabling "Allow all the time" location on Android

The `android/` folder is generated locally by `npx cap add android` and is **not** stored in this Lovable project. After you run `npx cap add android` on your machine, apply the patches below **once**, then `npx cap sync android`.

---

## 1. AndroidManifest.xml

Open `android/app/src/main/AndroidManifest.xml` and ensure these permissions exist **inside `<manifest>`** (not inside `<application>`):

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<!-- Required for "Allow all the time" option on Android 10+ -->
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

> Without `ACCESS_BACKGROUND_LOCATION` declared here, Android will **only** show "While using the app" — the OS hides the "Allow all the time" choice entirely.

## 2. Sync and rebuild

```bash
npx cap sync android
npx cap run android
```

## 3. How the permission prompt works in the app

The flow in `src/lib/backgroundTracker.ts` is:

1. When a salesperson **punches in**, the app calls `BackgroundGeolocation.addWatcher({ requestPermissions: true })`.
2. Android first shows the **foreground** prompt: *Allow / While using app / Don't allow*.
3. If the user picks "While using the app", the watcher fires a `NOT_AUTHORIZED` error the first time the app is backgrounded. The app then calls `BackgroundGeolocation.openSettings()`, which deep-links the user straight to **Settings → Apps → FieldForce → Location**, where they can switch to **"Allow all the time"**.
4. From then on, tracking continues even when the screen is off.

This two-step flow is required by Google Play policy on Android 11+ — apps are not allowed to ask for background location in the same prompt as foreground.
