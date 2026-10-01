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

## Take Backup
Take Backup asks which slot to use and for an optional name. A backup taken into a full slot replaces an existing one, which will no longer be available. BLDesk asks first and names that backup where it can. A backup into a free slot goes straight through. Both are recorded in [History](help:history).

For the daily, weekly and monthly slots, the number a slot keeps is the retention set in [Change Plan](help:server-change-plan). Suppose a server keeps two daily backups and already holds two, and you choose the daily slot. The dialog title is “Take Backup”, its button is red but asks for no typed name, and it says:

“No daily slot is free, so this backup replaces the oldest daily backup that is not locked or attached. The replaced backup will no longer be available.”

The row “Replaced backup” gives the name, ID, slot and date of the backup that goes, and the row shows it changing to “New daily backup”. History records the entry as destructive. When BinaryLane picks the oldest backup, it skips locked and attached ones.

BinaryLane's API reference does not say how many temporary backups a server can hold, so BLDesk cannot tell whether the temporary slot is full. If the server already has a temporary backup that is not locked or attached, the dialog is worded as a possibility, with the row “Replaced if no slot is free”:

“If this server has no free temporary slot, this backup replaces its oldest temporary backup that is not locked or attached. The replaced backup will no longer be available.”

Choosing a backup under “Replace Existing Image” replaces exactly that backup, and the dialog says:

“This backup replaces the backup you chose. The replaced backup will no longer be available.”

If the backup you chose is locked or attached, BLDesk does not claim it will be replaced: it shows no dialog, sends the request and shows BinaryLane's answer. Use Download on any image you need to keep before you take a backup that could replace it.

While BLDesk checks the server's backups and sends the request, the form's Cancel and close button are off, as in every form while its request runs, and cancelling the confirmation turns them back on. The take goes to the server you started it for, even if the page shows another server by then.

BLDesk reads the server's backups again when you submit, and gives up on that read after 20 seconds. If that read fails, it cannot tell whether a slot is full, or whether the backup you chose can still be replaced, so it asks anyway. For a slot, it names no backup, because it cannot tell which one would go, and the dialog says:

“Couldn't read this server's backups, so BLDesk can't say which one would be replaced if no slot is free. A backup that is replaced will no longer be available.”

For a backup you chose under “Replace Existing Image”, it says:

“Couldn't read this server's backups, so BLDesk can't check whether the backup you chose can still be replaced. If it can, this backup replaces it and the replaced backup will no longer be available.”

The row “Backup you chose” gives its name, ID, slot and date as the list on this page showed them. The button is red and History records the entry as destructive. Cancel sends nothing; confirming sends the request. When the list on this page cannot be read, it says “Couldn't read this server's backups.” with a Retry button, instead of “No Backups Found”.

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
