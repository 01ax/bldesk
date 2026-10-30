package com.termau.bldesk;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Saves a file where the person chooses, with Android's own "Save as" dialog (ACTION_CREATE_DOCUMENT): text with
 * saveText, and a binary file (an image) with stageBase64 and saveStaged.
 *
 * A WebView ignores the download link a browser would use, so the page cannot save a file on its own. The dialog needs
 * no storage permission: the system hands back a URI the app may write to, in Downloads, Drive or any other provider
 * the person picks. Nothing is written unless they confirm.
 *
 * One dialog is open at a time. Capacitor hands the result of a dialog to the last call that opened one, not to the
 * call that opened that dialog, so a second dialog opened while the first is still open would receive the first's
 * answer (and the first call would never settle). The page takes turns (lib/saveFile.ts); a second request while a
 * dialog is open is refused here as well.
 */
@CapacitorPlugin(name = "FileSave")
public class FileSavePlugin extends Plugin {

    // The bytes of the binary files being saved, by the id the page gave each: held here, not in the call that opens the
    // dialog (see stageBase64). A file whose save never starts (its pieces failed, say) is let go when newer ones arrive.
    private static final int MAX_STAGED = 3;
    private final Map<String, ByteArrayOutputStream> staged =
        new LinkedHashMap<String, ByteArrayOutputStream>() {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, ByteArrayOutputStream> eldest) {
                return size() > MAX_STAGED;
            }
        };
    // Whether a Save as dialog is open, which is from startSave until its result arrives.
    private boolean dialogOpen;

    @PluginMethod
    public void saveText(PluginCall call) {
        String filename = call.getString("filename");
        String text = call.getString("text");
        if (filename == null || filename.isEmpty() || text == null) {
            call.reject("A filename and the text to save are required.");
            return;
        }
        startSave(call, filename, call.getString("mimeType", "application/json"));
    }

    /**
     * A binary file is handed over in pieces (base64, one call each, all with the id the page gave the file) and then
     * saved with saveStaged. It cannot go in the saveStaged call itself: Capacitor keeps the options of the call that
     * opens the dialog in the activity's saved state, and a few hundred kilobytes there is more than Android lets one
     * transaction carry (TransactionTooLargeException), which closes the whole app when the dialog opens. A piece with
     * first set starts a new file under that id.
     */
    @PluginMethod
    public void stageBase64(PluginCall call) {
        String id = call.getString("id");
        String base64 = call.getString("base64");
        if (id == null || id.isEmpty() || base64 == null) {
            call.reject("The id and the base64 data to stage are required.");
            return;
        }
        byte[] piece;
        try {
            piece = Base64.decode(base64, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            // The page encodes this itself, so it is valid; if it ever were not, say so rather than write garbage.
            discardStaged(id);
            call.reject("The data to save is not valid base64.");
            return;
        }
        stage(id, piece, Boolean.TRUE.equals(call.getBoolean("first", false)));
        call.resolve();
    }

    @PluginMethod
    public void saveStaged(PluginCall call) {
        String id = call.getString("id");
        String filename = call.getString("filename");
        if (id == null || id.isEmpty() || filename == null || filename.isEmpty()) {
            call.reject("An id and a filename are required.");
            return;
        }
        if (!hasStaged(id)) {
            call.reject("There is no file staged to save.");
            return;
        }
        startSave(call, filename, call.getString("mimeType", "application/octet-stream"));
    }

    private void startSave(PluginCall call, String filename, String mimeType) {
        if (!beginDialog()) {
            discardStaged(call.getString("id"));
            call.reject("Another Save as dialog is still open. Finish or close it, then try again.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        try {
            startActivityForResult(call, intent, "saved");
        } catch (RuntimeException e) {
            endDialog();
            discardStaged(call.getString("id"));
            call.reject("Android could not open the Save as dialog: " + e.getMessage());
        }
    }

    @ActivityCallback
    private void saved(PluginCall call, ActivityResult result) {
        endDialog();
        if (call == null) {
            return;
        }
        JSObject out = new JSObject();
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            // Back, or Cancel: nothing was written, and that is not an error.
            discardStaged(call.getString("id"));
            out.put("saved", false);
            call.resolve(out);
            return;
        }
        Uri uri = data.getData();
        byte[] bytes = bytesToWrite(call);
        if (bytes == null) {
            call.reject("The file to save was lost when Android closed the app. Export it again.");
            return;
        }
        try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (stream == null) {
                call.reject("Android could not open the file to write to it.");
                return;
            }
            stream.write(bytes);
        } catch (Exception e) {
            call.reject("The file could not be written: " + e.getMessage());
            return;
        }
        out.put("saved", true);
        String name = displayName(uri);
        if (name != null) {
            out.put("name", name);
        }
        call.resolve(out);
    }

    private synchronized void stage(String id, byte[] piece, boolean first) {
        ByteArrayOutputStream bytes = staged.get(id);
        if (first || bytes == null) {
            bytes = new ByteArrayOutputStream(Math.max(piece.length, 32));
            staged.put(id, bytes);
        }
        bytes.write(piece, 0, piece.length);
    }

    private synchronized boolean hasStaged(String id) {
        return staged.containsKey(id);
    }

    private synchronized void discardStaged(String id) {
        if (id != null) {
            staged.remove(id);
        }
    }

    /** What to write for this call: its text, or its own staged bytes (which are let go). Null if the staged bytes are gone. */
    private synchronized byte[] bytesToWrite(PluginCall call) {
        if (!"saveStaged".equals(call.getMethodName())) {
            return call.getString("text", "").getBytes(StandardCharsets.UTF_8);
        }
        ByteArrayOutputStream bytes = staged.remove(call.getString("id"));
        return bytes == null ? null : bytes.toByteArray();
    }

    private synchronized boolean beginDialog() {
        if (dialogOpen) {
            return false;
        }
        dialogOpen = true;
        return true;
    }

    private synchronized void endDialog() {
        dialogOpen = false;
    }

    /** The name the provider gave the file, which can differ from the one suggested (it may add a number to avoid a clash). */
    private String displayName(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                return cursor.getString(0);
            }
        } catch (Exception ignored) {
            // The file is saved either way; the name is only for the message.
        }
        return null;
    }
}
