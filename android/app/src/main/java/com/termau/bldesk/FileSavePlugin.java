package com.termau.bldesk;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Saves a text file where the person chooses, with Android's own "Save as" dialog (ACTION_CREATE_DOCUMENT).
 *
 * A WebView ignores the download link a browser would use, so the page cannot save a file on its own. The dialog needs
 * no storage permission: the system hands back a URI the app may write to, in Downloads, Drive or any other provider
 * the person picks. Nothing is written unless they confirm.
 */
@CapacitorPlugin(name = "FileSave")
public class FileSavePlugin extends Plugin {

    @PluginMethod
    public void saveText(PluginCall call) {
        String filename = call.getString("filename");
        String text = call.getString("text");
        if (filename == null || filename.isEmpty() || text == null) {
            call.reject("A filename and the text to save are required.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mimeType", "application/json"));
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "saved");
    }

    @ActivityCallback
    private void saved(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        JSObject out = new JSObject();
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            // Back, or Cancel: nothing was written, and that is not an error.
            out.put("saved", false);
            call.resolve(out);
            return;
        }
        Uri uri = data.getData();
        try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt")) {
            if (stream == null) {
                call.reject("Android could not open the file to write to it.");
                return;
            }
            stream.write(call.getString("text", "").getBytes(StandardCharsets.UTF_8));
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
