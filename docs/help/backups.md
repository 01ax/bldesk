---
title: Backups
summary: Take, attach and restore images while keeping the target clear.
keywords: [backup, restore, retention, schedule, image, attach, offsite]
---

# Backups
Choose a server to inspect its images, take a backup, manage automatic backups, attach an image or restore its disk. Inside Server Details the same view is pinned to that server.

## Choose the right operation
Take Backup creates an image; Restore overwrites the server's current disk. Attach exposes an image as a read-only secondary drive for file recovery. Check the image date and target before either operation.

Purchased daily, weekly and monthly counts and offsite options are in Change Plan. Retention and scheduling belong to BinaryLane; see [automated backups](https://support.binarylane.com.au/support/solutions/articles/11000033794-automated-backups). Keeping BLDesk open is not required for the schedule.

## Worked example
Suppose you want to restore example image before-upgrade, ID 123, to the selected server. Take another backup first if you may need its current state. Choose Restore on the intended image.

The dialog title is “Restore from backup”, with:

“Overwrites the server's current disk with image "before-upgrade" (#123). Everything written since that image was taken is lost.”

The note says:

“Take a backup first if the current state might be needed again.”

Verify the server name and image in the change table. Type the target name, then choose “Restore”. Follow the action in History and check the guest once complete. Your dialog substitutes the actual image name and ID.

## Disabling automatic backups
“Disable Schedule” is not a pause. BinaryLane's API reference calls the action destructive and says it asks for no further confirmation, so the dialog is your only check. The dialog title is “Disable automated backups”. Its button is red but asks for no typed name, so read the summary before you confirm. The request is recorded in History.

The summary says:

“Changes the server's options to remove its daily backups. This is not a pause: BinaryLane removes them, including any you took with Take Backup into a daily slot, and does not ask again.”

The notes say:

“BinaryLane does this only when the server has the two daily backups that enabling automated backups creates.”

“Temporary backups you took with Take Backup are not removed.”

The reference says previous backups will no longer be available. When this page was last checked against BinaryLane, the daily backups were removed and a temporary backup was kept, so the dialog says only that.

Before you disable, use Download on any image you need to keep.
