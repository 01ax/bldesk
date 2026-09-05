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
The confirmation says:

“Nightly backups stop. Existing backups are kept until they age out.”

This view has no delete-image action. Disabling the schedule is not a way to retain an image indefinitely; keep an independent copy of data you must preserve.
