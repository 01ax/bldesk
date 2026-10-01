---
title: Troubleshooting
summary: Separate reachability, power, installation and help-service failures.
keywords: [port 22 unreachable, running but down, apparmor, macos, update, offline, failed change]
---

# Troubleshooting
Start by separating the guest, the cloud API and this device. A successful API request does not prove that a guest service is working.

## Port 22 unreachable
The badge tests port 22 at the public address from your device, not your custom SSH destination or connect-bar port. Check your network or VPN, the target address and configured SSH port, external firewall order, guest firewall and whether sshd is listening. A server can be running while SSH is unreachable. Use the rescue console to inspect the guest when needed.

If your company blocks public SSH and uses a tailnet, WireGuard or a bastion instead, a red public-address badge may be expected. In [Remote access](help:server-remote-access#connect-to), set Connect to → Custom… to your private hostname, IP or existing SSH-config alias (or Server name when it already matches). Connect the required VPN first. Desktop BLDesk uses system OpenSSH; it does not set up Tailscale or change your firewall. The badge continues to test the public address even when SSH works through the private route.

[Firewall help](help:firewall) explains the cloud controls. BinaryLane's [external firewall article](https://support.binarylane.com.au/support/solutions/articles/11000033088-external-firewall) distinguishes external filtering from the guest firewall.

## Server shows running but is down
The API status is not a reliable off indicator. BLDesk uses sample freshness and post-action diagnostics to infer power; missing samples can also be a collection problem. A Shutdown result of signal sent means the ACPI request was delivered, not that the guest obeyed. Check the console and current diagnostics before using a hard power action.

## Installation
On Ubuntu, an AppArmor user-namespace error can prevent an older AppImage from starting. Use a current BLDesk package; the Linux packaging includes the app-specific compatibility setup. Do not disable the system's security policy globally as a workaround.

macOS may warn about an unsigned build. Only open an installer you obtained from the project's trusted release channel. Use the OS's explicit approval flow if you choose to run it; do not disable Gatekeeper globally.

## Updates
Open the title-bar update control and check the chosen stable or beta channel; BLDesk remembers the choice, on Android as well as on the desktop. Beta deliberately includes prereleases. A desktop update may need a restart; Android downloads an APK and relies on the OS installer. Once an update has downloaded, Restart to update stays until you install it, you change the update channel, or a newer one starts to download: a later check that finds nothing newer or fails, such as when the machine is offline, does not take the button away. Check the release notes before updating.

## What Ask BinaryLane can see
No token, no profile id, no server ids, no History, no ticket text is attached by BLDesk. Only the text in the search box is sent for questions and suggestions. Do not type secrets, names, addresses or account details into that box.

The optional chip appends only the displayed distribution and region when you click it. Feedback sends the answer's ID and a helpful boolean. The service searches published articles; it cannot diagnose your account or read your fleet.

## A list says it couldn't load
VPC networks, load balancers, SSH keys, DNS zones and DNS records show a red notice such as “Couldn't load the VPC networks.”, with the API's reason and a Retry button, when BinaryLane could not be reached or refused the read. Such a page does not show its empty-list message, because that would claim the account has none. If an earlier load succeeded, the notice says “Couldn't refresh the VPC networks.” instead and the older list stays below it. Check your connection and token, then press Retry.

## A change says it failed
When BinaryLane refuses a change, or the request fails, BLDesk says so inside its window, with BinaryLane's reason when it gives one, and History records the change as Failed. A dialog that sent the change, such as Add Record, Create VPC or Take Backup, stays open with what you entered and shows the reason in red, for example “Failed to add record: …”; correct it and save again, or Cancel. A server's Settings and Network tabs and the firewall's Add Rule form show the reason in a red notice on the page. Many other changes made from a button on a page, such as deleting a firewall rule or rebooting a server, are reported in a toast at the bottom right with a red warning sign, for example “Failed to delete rule”, with the reason under it. A terminal or rescue console that does not open, and a bldesk:// link that cannot be followed, are reported the same way. A failure toast stays until you close it, except that only the three latest are kept, a failure that repeats the one before it is counted on that toast instead of being shown again, and switching to another account clears them.

## The sidebar says the API is not answering
The status at the foot of the sidebar follows the server-list read, which BLDesk repeats every 15 seconds. It says “API Online” while that read works, “API not answering” when it fails, and “API refused the token” when BinaryLane answers 401 or 403. While it is failing, the Servers page shows a red notice above the list and keeps the last list BLDesk saved, which may be out of date; Retry reads it again. A server's power state and the other pages come from separate reads and can still work.

## Help is offline or unavailable
Local help still works. The error appears above intact local results; a failed question is not automatically retried. Check your connection and submit again when ready. Questions time out after 20 seconds. Answer text is not persisted; the last few submitted searches are kept locally on this device.
