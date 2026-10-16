# Android & Google Play Internal Testing Plan

This plan covers taking **AAO** (`com.mshumba.aao`) to Google Play's **Internal testing** track, enabling Google's native sign-in sheet on Android, completing Google Play's **Data safety** form from the published Privacy Policy (`https://aaolearning.com/privacy`), and building and submitting the first Android App Bundle (`.aab`) with EAS.

---

## 1. Google Play Console Setup & Internal Testing Track

### Step 1.1 — Set up the Google Play Developer account
1. Sign in with the owner's Google account at [Google Play Console Sign-up](https://play.google.com/console/signup) and pay the one-time $25 registration fee.
2. Complete [Google Play developer account verification](https://support.google.com/googleplay/android-developer/answer/10788890) (government ID, contact email, and phone verification).
   - **Account type note:** Personal developer accounts created after November 2023 can use **Internal testing** immediately (up to 100 testers, no review wait), and require a 14-day closed test with at least 12 opted-in testers before unlocking public **Production** access ([App testing requirements for new personal developer accounts](https://support.google.com/googleplay/android-developer/answer/14151465)). Organization accounts require a D-U-N-S number and do not have the 12-tester gate.

### Step 1.2 — Create the AAO app record
1. In [Google Play Console](https://play.google.com/console), click **Create app** ([Create and set up your app](https://support.google.com/googleplay/android-developer/answer/9859152)).
2. Fill in the initial details:
   - **App name:** `AAO`
   - **Default language:** `English (United States) – en-US`
   - **App or game:** **App**
   - **Free or paid:** **Free**
3. Tick the **Developer Program Policies** and **US export laws** declarations and click **Create app**.
4. The package name `com.mshumba.aao` (`android.package` in `app.json`) is locked to this Play Console app record automatically when you upload the first `.aab` in Step 4.

### Step 1.3 — Play App Signing with EAS-managed keys
Google Play requires **Play App Signing** for all new apps distributed as Android App Bundles (`.aab`) ([Use Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)):
1. **Upload key (managed by EAS):** On the first `eas build -p android --profile production`, EAS generates and stores an Android keystore on Expo's servers (`eas credentials -p android`). EAS signs every `.aab` with this **upload key**.
2. **App signing key (managed by Google Play):** In Play Console under **Test and release → Setup → App integrity → Play App Signing**, leave the default **Use Google-generated key** selected when uploading the first `.aab`. Google Play verifies your upload key, strips it, and re-signs the app with Google Play's **App signing key** before delivering it to testers and devices.
3. Because Google Play re-signs `.aab` builds with its own App signing key, **both** SHA-1 fingerprints (EAS's upload keystore SHA-1 and Play's App signing key SHA-1) are registered in Google Cloud in Section 2 below.

### Step 1.4 — Set up the Internal testing track and testers
1. In Play Console, open **Test and release → Testing → Internal testing** ([Set up an open, closed, or internal test](https://support.google.com/googleplay/android-developer/answer/9845334)).
2. Open the **Testers** tab and click **Create email list**:
   - **List name:** `AAO Internal Testers`
   - **Email addresses:** add the Google account emails (Gmail or Google Workspace) of up to 100 testers, separated by commas or newlines, then click **Save changes**.
3. Save the **Testers** tab. Once the first `.aab` is uploaded and rolled out on the **Releases** tab (Step 4.4 below), return to the **Testers** tab, click **Copy link** under **How testers join your test**, and send that opt-in URL to testers.
4. Each tester opens the opt-in link on their Android phone, taps **Accept invite**, and taps **Download it on Google Play**. Internal testing builds do not wait for Google Play review and become installable within a few minutes of upload.

### Step 1.5 — Store listing basics
Open **Grow users → Store presence → Main store listing** ([Add preview assets to showcase your app](https://support.google.com/googleplay/android-developer/answer/9866151)):
1. **App name:** `AAO`
2. **Short description** (up to 80 characters):
   `Find and watch public sermons by Apostle Arome Osayi, guided paths and topics.`
3. **Full description** (up to 4,000 characters):
   Describe browsing sermons, guided paths, need-based search, saving sermons, and resuming where you left off across devices. Include the non-endorsement notice from `README.md` (`AAO is an independent app for finding and watching public sermons and isn't endorsed by the ministry whose sermons it shows.`).
4. **Graphics:**
   - **App icon:** 512 × 512 px 32-bit PNG (export from `assets/icon-source` or resize `assets/icon.png`).
   - **Feature graphic:** 1024 × 500 px PNG or JPEG (ivory/navy cover graphic).
   - **Phone screenshots:** 2 to 8 PNG/JPEG screenshots (16:9 or 9:16 aspect ratio, between 320 px and 3840 px per side).
5. **App category and contact details** (**Grow users → Store presence → Store settings**):
   - **App or game:** App
   - **Category:** **Education** (or **Lifestyle**)
   - **Email address:** `support@aaolearning.com` (required)
   - **Website:** `https://aaolearning.com`

### Step 1.6 — App content declarations, Content rating & Target audience
Open **Monitor and improve → Policy and programs → App content** ([Prepare your app for review](https://support.google.com/googleplay/android-developer/answer/9859455)) and complete each card:

1. **Privacy policy:**
   - URL: `https://aaolearning.com/privacy`
2. **App access** ([App access instructions](https://support.google.com/googleplay/android-developer/answer/9859455#app_access)):
   - Choose **All or some functionality in my app is restricted**.
   - Click **Add instructions**:
     - **Name:** `Reviewer password sign-in`
     - **Username / email and password:** enter the dedicated review account's email and password (the same review account used for App Store Connect).
     - **Instructions:** `Tap Account → Sign in → Sign in with email instead → Use a password instead, then enter the email and password above. (Please use password sign-in rather than the 6-digit email code.) Make sure the Supabase project is active during review.`
3. **Ads** ([Ads declaration](https://support.google.com/googleplay/android-developer/answer/9859455#ads)):
   - Select **No, my app does not contain ads**.
4. **Content rating** ([Content ratings for apps and games](https://support.google.com/googleplay/android-developer/answer/9859655)):
   - Click **Start questionnaire**, enter `support@aaolearning.com`, and choose category **Reference, News, or Educational** (or **Utility, Productivity, Communication, or Other**).
   - Answer **No** to all questions on violence, fear, sexuality, profanity, controlled substances, user-generated content / social interaction (viewers cannot post, comment, or message other users), physical location sharing, and digital goods purchases.
   - Submit and apply the generated IARC ratings.
5. **Target audience and content** ([Manage target audience and app content settings](https://support.google.com/googleplay/android-developer/answer/9867159)):
   - **Target age group:** tick **13–15**, **16–17**, and **18 and over**. Do **not** tick any group under 13 (matching the Privacy Policy: *"AAO isn't directed to children under 13"*).
   - **Appeal to children:** select **No** (the store listing is not designed for children).
6. **Data safety:**
   - Complete using the draft in **Section 3** below ([Provide information for Google Play's Data safety section](https://support.google.com/googleplay/android-developer/answer/10787469)).
   - Under the **Account deletion** section of Data safety ([Understanding Google Play's app account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)), provide `https://aaolearning.com/privacy` (which explains deleting via `Account › Delete account` or emailing `support@aaolearning.com`).
7. **Advertising ID** ([Advertising ID declaration](https://support.google.com/googleplay/android-developer/answer/6048248)):
   - Does your app use Advertising ID? **No**.
8. **Remaining declarations** (**News apps**, **COVID-19**, **Government apps**, **Financial features**, **Health apps**):
   - Answer **No** / **My app does not provide any financial or health features** on each card.

---

## 2. Native Google Sign-In on Android

### How it works
- On Android, `@react-native-google-signin/google-signin` configures Google Play Services with the **Web application** client ID (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`) so the returned ID token is minted for that web client.
- **Supabase already lists that Web client ID** under **Authentication → Sign In / Providers → Google → Client IDs**, so Supabase accepts the ID token from Android without any change in Supabase.
- To allow Android to open Google's native sign-in sheet and issue that token, Google Cloud needs an **Android** OAuth 2.0 client matching package `com.mshumba.aao` and the app's **SHA-1 signing certificate fingerprint** ([Authenticate Using Google Sign-In on Android](https://developers.google.com/identity/sign-in/android/start-integrating#configure_a_project)).

### Step 2.1 — Get the SHA-1 fingerprint(s)
You need up to two SHA-1 fingerprints depending on how testers install the app:

1. **EAS upload / preview keystore SHA-1** (used by `preview` APKs installed directly from EAS, and used to sign `.aab` uploads before Play re-signs them):
   Run from the main repo checkout (after the keystore is created during the first Android build or via `eas credentials`):
   ```sh
   eas credentials -p android
   ```
   Select `production` (and check `preview` to confirm it uses the same keystore) → **Keystore: Manage everything needed to build your project** → copy the **SHA1 Fingerprint** (e.g. `AA:BB:CC:…`). See [Expo Android credentials](https://docs.expo.dev/app-signing/managed-credentials/#android).
2. **Google Play App Signing key SHA-1** (used on every build installed from Google Play, including the **Internal testing** track, because Play App Signing re-signs uploaded `.aab` bundles):
   - Open [Google Play Console](https://play.google.com/console) → select **AAO** → **Test and release → Setup → App integrity** ([Use Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756)).
   - Next to **Play App Signing**, open **Settings** and copy the **SHA-1 certificate fingerprint** under **App signing key certificate** (distinct from the **Upload key certificate** below it).

### Step 2.2 — Create the Android OAuth client(s) in Google Cloud
1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) (or [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients)) and select the `AAO` project.
2. Click **Create credentials → OAuth client ID** (or **Create client**):
   - **Application type:** **Android**
   - **Name:** `AAO Android (Play App Signing)`
   - **Package name:** `com.mshumba.aao`
   - **SHA-1 certificate fingerprint:** paste the **App signing key certificate SHA-1** from Play Console.
   - Click **Create**.
3. If you also distribute direct `preview` APKs from EAS (which are signed with the EAS keystore rather than re-signed by Play), click **Create credentials → OAuth client ID** a second time:
   - **Application type:** **Android**
   - **Name:** `AAO Android (EAS Keystore)`
   - **Package name:** `com.mshumba.aao`
   - **SHA-1 certificate fingerprint:** paste the **SHA1 Fingerprint** from `eas credentials -p android`.
   - Click **Create**.
4. **No new environment variable is needed for the Android client ID:** Google Play Services matches Android OAuth clients automatically by `(package name, SHA-1)`. Ensure `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is set in EAS for the `production` and `preview` environments:
   ```sh
   eas env:list --environment production
   eas env:list --environment preview
   ```

---

## 3. Draft of Google Play's Data Safety Form

This draft is based strictly on the published Privacy Policy at [https://aaolearning.com/privacy](https://aaolearning.com/privacy) (last updated 15 October 2026) and [Google Play's Data safety requirements](https://support.google.com/googleplay/android-developer/answer/10787469).

### 3.1 — Data collection and security overview
| Question | Answer | Basis in `https://aaolearning.com/privacy` |
| --- | --- | --- |
| Does your app collect or share any of the required user data types? | **Yes** | Collects account details, topics, saved sermons, watch/path progress, searches, and crash reports. |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | *"Connections between the app, Supabase and OpenAI are encrypted."* |
| Do you provide a way for users to request that their data is deleted? | **Yes** | *"You can delete your account at any time in Account › Delete account."* + `support@aaolearning.com` (`https://aaolearning.com/privacy`). |

### 3.2 — Data types to select and their per-item answers
For every item below unless flagged in Section 3.3:
- **Collected:** **Yes**
- **Shared with third parties:** **No** (Supabase is explicitly named as *"a hosted database service that processes them on AAO's behalf"*, which qualifies as a service provider under Google Play's definition; see Section 3.3 for OpenAI, YouTube, and Sentry).
- **Processed ephemerally:** **No**
- **Data collection is required or optional:** **Optional** for all account and search fields (guests can browse without an account and without searching; users can delete their account at any time), **Required** for crash reports.

| Play Category | Data Type | Collected | Shared | Optional / Required | Purpose(s) to tick | Policy basis |
| --- | --- | --- | --- | --- | --- | --- |
| **Personal info** | **Name** | Yes | No | Optional | App functionality; Account management | *"Your first name, if you add one"* / name shared by Apple or Google to greet you by name. |
| **Personal info** | **Email address** | Yes | No | Optional | App functionality; Account management | *"Your email address"* + sending sign-in, confirmation, and password-reset codes. |
| **Personal info** | **User IDs** | Yes | No | Optional | App functionality; Account management; Fraud prevention, security, and compliance | Account ID, sign-in method (Apple/Google/email), and per-account search rate-limit counter. |
| **Personal info** | **Other info** *(religious beliefs / sensitive context)* | Yes | *See 3.3 (OpenAI)* | Optional | App functionality | *"The sermons you save, the topics and paths you choose and what you type into Search may say something about your religious beliefs or what you're going through."* |
| **App activity** | **In-app search history** | Yes | *See 3.3 (OpenAI)* | Optional | App functionality | *"When you type what you're going through into Search, the words you type are sent to OpenAI… AAO keeps the answer for up to 24 hours."* (Recent searches stay on-device.) |
| **App activity** | **App interactions** / **Other actions** | Yes | *See 3.3 (YouTube)* | Optional | App functionality | Topics chosen, sermons saved, watch position in each sermon, and guided paths started / days finished. |
| **App info and performance** | **Crash logs** | Yes | No | Required | App functionality | *"When the app crashes or hits an error, it sends a report to Sentry, a crash-reporting service, so the problem can be fixed."* |
| **App info and performance** | **Diagnostics** | *See 3.3 (Sentry)* | No | Required | App functionality | Sentry `tracesSampleRate: 0.1` speed traces from 10% of sessions (see 3.3 below). |
| **Device or other IDs** | **Device or other IDs** | Yes | *See 3.3 (YouTube)* | Required | App functionality; Fraud prevention, security, and compliance | Device model, OS, and app version in Sentry reports; scrambled IP rate-limit counter and short-lived Supabase IP logs; YouTube player device/usage info. |

### 3.3 — What `https://aaolearning.com/privacy` does not settle (owner decisions needed)

1. **YouTube's embedded player (`WebView`)**
   - **What the policy says:** *"Sermons play through YouTube's embedded player, and their artwork loads from YouTube's servers. When the player loads, YouTube (part of Google) may set cookies and collect device and usage information under Google's own terms and privacy policy."*
   - **What isn't settled for Data safety:** Google Play requires apps to declare data collected by embedded third-party players/SDKs. Because YouTube collects device identifiers, IP address (approximate location), and video playback interactions under Google's own terms rather than as a contracted service provider acting solely for AAO, Google Play's Data safety rules treat those data types (**Device or other IDs** and **App activity → App interactions / Installed apps**) as **Collected** and **Shared** with a third party. Confirm whether to tick **Shared: Yes** on **Device or other IDs** and **App interactions** for the YouTube embed.

2. **Sentry crash reports and 10% speed traces (`src/lib/monitoring.ts`)**
   - **What the policy says:** *"No analytics. If that changes, this policy will say so before it does."* and *"When the app crashes or hits an error, it sends a report to Sentry, a crash-reporting service, so the problem can be fixed. A report holds the error, the device model, its operating system and the app version. It never includes your name, email address, IP address, topics, searches or saved sermons."*
   - **What isn't settled:**
     - **Speed traces (`tracesSampleRate: 0.1`):** `src/lib/monitoring.ts` sets `tracesSampleRate: 0.1`, which sends performance/speed trace transactions from 10% of release sessions to Sentry even when no crash or error occurs. In Play's Data safety form, performance traces fall under **App info and performance → Diagnostics**, which the current privacy policy doesn't mention. Either (a) add a brief mention of performance diagnostics to `https://aaolearning.com/privacy` and tick **Diagnostics** in Data safety, or (b) set `tracesSampleRate: 0` in `src/lib/monitoring.ts` if only crash reports are intended.
     - **IP addresses in Sentry:** Although `sendDefaultPii: false` and `delete event.user` are set in `src/lib/monitoring.ts`, Sentry's ingestion server sees the client's IP address on every HTTPS request and stores it by default unless **"Prevent Storing of IP Addresses"** is enabled in **Sentry → Project Settings → Security & Privacy**. Verify that setting is turned on in Sentry so the policy's statement (*"It never includes your … IP address"*) is accurate.

3. **OpenAI search processing (`supabase/functions/search` and `quotes`)**
   - **What the policy says:** *"When you type what you're going through into Search, the words you type are sent to OpenAI, an AI service, so it can understand what you mean and find the moments in sermons that speak to it. They are sent without your name, email address or account."* and *"So the same question is answered faster next time, AAO keeps the answer for up to 24 hours. It's kept under a scrambled code made from the question, not the words themselves, and it isn't linked to you or your account. After 24 hours it's deleted."*
   - **What isn't settled for Data safety:**
     - **Service provider ("Shared: No") vs. Third party ("Shared: Yes"):** Under Play's Data safety rules, sending search text to OpenAI is **Collected (not Shared)** if OpenAI processes the text solely on AAO's behalf under OpenAI's API terms (with training opt-out enabled), or **Collected and Shared** if not treated strictly as a service provider. Confirm that your OpenAI API organization has **data sharing for model training turned off**, and decide whether to mark **In-app search history** as **Shared: No** (service provider) or **Shared: Yes**.
     - **Not ephemeral:** Play only allows marking data as **Ephemeral** if it is kept exclusively in memory for no longer than needed to service the request in real time. Because AAO caches search answers in Supabase for 24 hours (and OpenAI retains API abuse-monitoring logs for up to 30 days by default), mark **In-app search history** as **Ephemeral: No**.

---

## 4. How to Build and Send the First Internal Build

Do **not** commit the service-account JSON file to git. Run these steps from the main repository checkout once this branch is merged.

### Step 4.1 — Create the Google Cloud service-account JSON key for `eas submit`
Follow [Expo's Android submission guide](https://docs.expo.dev/submit/android/):
1. Open [Google Cloud Console → APIs & Services → Library](https://console.cloud.google.com/apis/library/androidpublisher.googleapis.com) in the `AAO` project and enable the **Google Play Android Developer API**.
2. Open [Google Cloud Console → IAM & Admin → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts) ([Create a service account](https://cloud.google.com/iam/docs/service-accounts-create)):
   - Click **Create service account**.
   - **Service account name:** `eas-submit`
   - Click **Create and continue**, then click **Done**.
3. Click the newly created `eas-submit@…iam.gserviceaccount.com` service account → open the **Keys** tab → **Add key → Create new key → JSON** → **Create**.
4. Move the downloaded JSON file somewhere safe outside the repo (for example `~/.keys/aao-play-service-account.json`, `chmod 600`).

### Step 4.2 — Grant the service account access in Play Console
1. Open [Google Play Console → Users and permissions](https://play.google.com/console/users-and-permissions) ([Manage developer account users and permissions](https://support.google.com/googleplay/android-developer/answer/9844686)).
2. Click **Invite new users** and paste the service account's `eas-submit@…iam.gserviceaccount.com` email address.
3. Under **App permissions**, click **Add app**, select **AAO**, and grant **Admin (all permissions)** (or at minimum: **View app information (read-only)**, **Release to testing tracks**, and **Manage testing tracks and edit tester lists**).
4. Click **Invite user** → **Send invite**.

### Step 4.3 — Check EAS environment variables and build the `.aab`
1. Confirm the production EAS environment has the Supabase URL, publishable key, Google Web client ID (`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`), and Sentry DSN:
   ```sh
   eas env:list --environment production
   ```
2. Start the production Android build on EAS (which builds an `.aab` for Google Play):
   ```sh
   eas build -p android --profile production
   ```
   - On the first Android build, EAS asks to generate a new Android Keystore; answer **Yes**.
   - If prompted where to start remote `versionCode` numbering, start at `1`.

### Step 4.4 — Upload the very first `.aab` in Play Console (one-time Google requirement)
Google Play's API does not allow `eas submit` to upload the very first binary of a brand-new app; the first `.aab` must be uploaded once through the Play Console web UI ([Prepare and roll out a release](https://support.google.com/googleplay/android-developer/answer/9859348)):
1. When `eas build -p android --profile production` finishes, download the `.aab` file from the build link printed by EAS (or from [expo.dev](https://expo.dev)).
2. In [Google Play Console](https://play.google.com/console) → **AAO** → **Test and release → Testing → Internal testing**, click **Create new release**.
3. Under **App bundles**, upload the `.aab` file.
4. Enter a release name (e.g. `0.1.0 (1)`) and release notes, click **Next**, and click **Save and publish** / **Start rollout to Internal testing**.
5. Copy the **App signing key certificate SHA-1** from **Test and release → Setup → App integrity → Play App Signing** and finish **Section 2** above so Google sign-in works on builds installed from Google Play.

### Step 4.5 — Send later builds with `eas submit`
Once the first `.aab` has been uploaded manually in Step 4.4, every subsequent Android build can be submitted from the terminal:
```sh
eas submit -p android --profile production
```
- On the first run of `eas submit -p android`, EAS asks for the path to your `~/.keys/aao-play-service-account.json` file and uploads it to EAS Credentials so later submissions don't need the local file.
- You can also build and submit in one command once Step 4.4 is complete:
  ```sh
  eas build -p android --profile production --auto-submit
  ```
