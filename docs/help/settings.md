---
title: Settings
summary: Mute notifications from BLDesk, all at once or by kind.
keywords: [settings, notifications, mute, alerts, preferences, tray]
---

# Settings
Settings holds preferences for this device. Open it with the gear button in the title bar. On a phone the title bar has no room for it, so open More and choose Settings instead. Nothing here is saved to your BinaryLane account or changes anything on it; the choices stay on this device.

Today it holds the notification switches. Other preferences are not on this page yet.

## Notifications
The Notifications card has two controls. “Show notifications” is the master switch: turn it off to mute every notification. Under it, “Notify me about” says how many kinds are on, and “Choose kinds” opens a dialog, also titled “Notify me about”, with a switch for each kind:

- “Server state changes”: a server appears, changes state or is no longer listed.
- “Action results”: a server action is requested, finishes, fails, or pauses to ask you a question.
- “Billing”: prepaid credit runs low, or an invoice payment fails.
- “Changes you make”: confirmations after you change something in BLDesk, such as starting a backup, editing firewall rules or adding an SSH key, and the one-time note that BLDesk is still running in the tray.
- “BLDesk updates”: a new version has finished downloading and is ready to install.

A switch takes effect as soon as you click it; Done only closes the dialog. While “Show notifications” is off the dialog's switches are greyed out and keep their settings, so turning the master switch back on restores them.

Muting only stops notifications sent through your operating system. Action progress, failures and History inside BLDesk are not affected, and your operating system can still hide notifications on its own, so check the action status and [History](help:history) when an outcome matters.

On Android BLDesk does not show notifications at the moment, so these switches have no effect there yet.

If a change cannot be saved on the device, BLDesk shows a failure card saying so. The change still applies until BLDesk is closed, and then goes back to what was saved.

## The tray menu
On desktop, the tray menu's Settings submenu has the same switches: Show notifications and one for each kind. A change made there shows up on this page, and the other way round. Close to tray and launch at login are set from the tray menu only.

Notifications were already switchable from the tray menu before this page existed. A choice made there is kept; the kinds that had no switch start on.

## Related pages
[Tray and notifications](help:tray) covers the tray menu and close-to-tray. The link `bldesk://tab/settings` opens this page; see [Deep links](help:deep-links).
