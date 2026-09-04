---
title: Troubleshooting
summary: Separate reachability, power, installation and help-service failures.
keywords: [port 22 unreachable, running but down, apparmor, macos, update, offline]
---

# Troubleshooting
Start by separating the guest, the cloud API and this device. A successful API request does not prove that a guest service is working.

## Port 22 unreachable
The badge tests the server's SSH port from your device. Check your network or VPN, the target address and configured SSH port, external firewall order, guest firewall and whether sshd is listening. A server can be running while SSH is unreachable. Use the rescue console to inspect the guest when needed.

[Firewall help](help:firewall) explains the cloud controls. BinaryLane's [external firewall article](https://support.binarylane.com.au/support/solutions/articles/11000033088-external-firewall) distinguishes external filtering from the guest firewall.

## Server shows running but is down
The API status is not a reliable off indicator. BLDesk uses sample freshness and post-action diagnostics to infer power; missing samples can also be a collection problem. A Shutdown result of signal sent means the ACPI request was delivered, not that the guest obeyed. Check the console and current diagnostics before using a hard power action.

## Installation
On Ubuntu, an AppArmor user-namespace error can prevent an older AppImage from starting. Use a current BLDesk package; the Linux packaging includes the app-specific compatibility setup. Do not disable the system's security policy globally as a workaround.

macOS may warn about an unsigned build. Only open an installer you obtained from the project's trusted release channel. Use the OS's explicit approval flow if you choose to run it; do not disable Gatekeeper globally.

## Updates
Open the title-bar update control and check the chosen stable or beta channel. Beta deliberately includes prereleases. A desktop update may need a restart; Android downloads an APK and relies on the OS installer. Check the release notes before updating.

## What Ask BinaryLane can see
No token, no profile id, no server ids, no History, no ticket text is attached by BLDesk. Only the text in the search box is sent for questions and suggestions. Do not type secrets, names, addresses or account details into that box.

The optional chip appends only the displayed distribution and region when you click it. Feedback sends the answer's ID and a helpful boolean. The service searches published articles; it cannot diagnose your account or read your fleet.

## Help is offline or unavailable
Local help still works. The error appears below intact local results; a failed question is not automatically retried. Check your connection and submit again when ready. Questions time out after 20 seconds. Answer text is not persisted; the last few submitted searches are kept locally on this device.
