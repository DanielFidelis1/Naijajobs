# NaijaJobs: install and build guide

Your site now installs like a real app on phones and laptops, and the project
also contains source for a standalone Android APK and a desktop program.

## What changed (design only, your logic is untouched)

New files: `css/polish.css`, `js/polish.js`, `offline.html`, extra icons.
Edited: every page got two extra tags (the polish CSS and JS), `manifest.json`,
and `sw.js` (offline support added; your push-notification code is unchanged).
`js/app.js`, `js/config.js`, `js/shell.js`, the SQL files and the Supabase
functions were NOT modified.

Added: shadow and spacing scale, softer cards and buttons, hover and press
animations, better form focus and error states, a bottom tab bar on phones,
toast messages, an offline notice, an "Install app" prompt, a skip-to-content
link, screen-reader announcements for form messages, and safe-area support for
phones with notches.

## Option 1: Install straight from the website (easiest, no building)

Upload this folder to your host (the site must be served over HTTPS, at the
root of the domain, for example https://naijajobs.com/).

- Android phone: open the site in Chrome, tap the menu, "Install app"
  (or accept the install banner).
- Laptop: open the site in Chrome or Edge, click the install icon in the
  address bar (or the in-page install banner).

This is the only option that keeps browser push notifications working.

## Option 2: Build the APK and desktop app in the cloud (no tools to install)

1. Put this project in a free GitHub repository.
2. Open the Actions tab, choose "Build NaijaJobs apps", click "Run workflow".
3. When it finishes, download:
   - NaijaJobs-android-apk: `app-debug.apk` (copy to the phone and open it;
     Android will ask you to allow installs from this source)
   - NaijaJobs-desktop-*: Windows `.exe` installer, Mac `.dmg`, Linux `.AppImage`

The workflow was written but could not be run where it was authored, so if a
step fails, the log in the Actions tab shows exactly which one.

## Option 3: Build on your own computer

Android (needs Node 20, Java 17, Android Studio):
    cd apps/android
    npm install
    npm run setup        # creates the android/ project
    npm run open         # opens Android Studio, then Build > Build APK

Desktop (needs Node 20):
    cd apps/desktop
    npm install
    npm start            # try it
    npm run dist         # makes the installer in apps/desktop/dist

## Good to know

- Browser push notifications work in the installed website version (Option 1)
  but NOT inside the APK or desktop wrapper. Those still show in-app
  notifications and the unread badges.
- The debug APK is for testing and sharing directly. To publish on Google Play
  you need a signed release build (Android Studio: Build > Generate Signed Bundle).
- Email confirmation and password-reset links open your website, not the app.
- In the Supabase dashboard, keep your site URL in the allowed list.

## Phone layout (matches the mobile mockup)

On screens 768px wide or less (phones, and the Android app) the sidebar is
replaced by:
- a green app header with logo, notification bell (with unread count) and your
  profile picture, which opens the profile menu (My Profile, Settings,
  Announcements, Support, Log Out);
- a floating bottom bar with a sliding highlight. Clients see Home, Post Job,
  My Work, Messages. Workers see Home, Find Jobs, Applications, Messages;
- a green chat header on the conversation screen.

Laptops and wide screens keep the normal sidebar layout.
The role (client or worker) is read from your existing `profiles.account_type`.
