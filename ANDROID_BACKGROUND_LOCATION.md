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

The flow in `src/lib/backgroundTracker.ts` + `src/pages/VisitsPage.tsx` is a
**three-stage** sequence required by Google Play policy on Android 11+
(apps may not request background location in the same prompt as foreground):

1. **Stage 1 — Foreground prompt.** When a salesperson **punches in**, the
   app calls `BackgroundGeolocation.addWatcher({ requestPermissions: true })`.
   Android shows the standard system prompt for `ACCESS_FINE_LOCATION` +
   `ACCESS_COARSE_LOCATION`: *Allow / While using app / Don't allow*.
2. **Stage 2 — Custom rationale dialog.** If the user picks
   "While using the app", the watcher fires a `NOT_AUTHORIZED` /
   background-denied error the first time the app is backgrounded. The
   tracker invokes the `onNeedsBackgroundUpgrade` callback, which opens a
   custom in-app dialog explaining *why* background location is needed.
3. **Stage 3 — System settings deep-link.** Only after the user clicks
   **"Agree"** on the rationale dialog does the app call
   `requestBackgroundLocationUpgrade()` →
   `BackgroundGeolocation.openSettings()`, which jumps straight to
   **Settings → Apps → FieldForce → Location**, where the user can choose
   **"Allow all the time"**.

From then on, tracking continues even when the screen is off.

> The `ACCESS_BACKGROUND_LOCATION` permission MUST be declared in the
> manifest (step 1 above) — without it, Android hides the "Allow all the
> time" option entirely and stage 3 has no effect.
