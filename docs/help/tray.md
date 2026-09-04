---
title: Tray and notifications
summary: Keep desktop monitoring running and configure local tray behaviour.
keywords: [tray, notifications, close to tray, startup, login]
---

# Tray and notifications
On desktop, the tray keeps BLDesk accessible while the main window is hidden. Its menu can reopen the app and quit it; tray settings control close-to-tray, launch at login and notifications.

## Close versus quit
With close-to-tray enabled, closing the window leaves the application running. Quit ends its background monitoring. BinaryLane's servers and scheduled backups continue independently.

Notifications can report server state, action results and balance conditions. The OS can suppress them, so check the in-app action status and History when an outcome matters.

## Settings
Desktop settings live in userData/tray.json. These preferences belong to this device, not the BinaryLane account. Launch at login depends on OS support and permission. Tray behaviour is not available on Android.

For an action requiring interaction or payment, reopen the app rather than treating the notification as completion.
