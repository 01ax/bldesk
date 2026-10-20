---
title: Tray and notifications
summary: Keep desktop monitoring running and configure local tray behaviour.
keywords: [tray, notifications, close to tray, startup, login]
---

# Tray and notifications
On desktop, the tray keeps BLDesk accessible while the main window is hidden. Open Dashboard reopens the app. The Servers submenu offers Open in BLDesk, Copy IP and SSH as root for individual servers; IP-dependent actions require an address. Quit exits BLDesk.

## Close versus quit
With close-to-tray enabled, closing the window leaves the application running. Quit ends its background monitoring. BinaryLane's servers and scheduled backups continue independently.

Notifications can report server state, action results, balance conditions, confirmations of changes you make and finished update downloads. Mute them all, or one kind at a time, in [Settings](help:settings#notifications) or from the tray menu's Settings submenu; muting does not affect action progress, failures or History inside BLDesk. The OS can suppress notifications too, so check the in-app action status and History when an outcome matters.

## Settings
Desktop settings live in userData/tray.json. Close-to-tray and notification preferences belong to this device, not the BinaryLane account. The notification switches can be changed from the tray menu or the [Settings](help:settings) page; close-to-tray and launch at login only from the tray menu. Launch at login is offered on macOS and Windows, not Linux. Tray behaviour is not available on Android.

For an action requiring interaction or payment, reopen the app rather than treating the notification as completion.
