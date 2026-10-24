package ru.zamok.app;

import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.IsoDep;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NfcCard")
public class NfcCardPlugin extends Plugin implements NfcAdapter.ReaderCallback {

    private static final String TAG = "ZamokNfc";
    private static final int DEFAULT_TIMEOUT_MS = 25000;

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());

    private NfcAdapter adapter;
    private PluginCall startCall;
    private IsoDep isoDep;
    private boolean sessionActive = false;
    private Runnable timeoutTask;

    private NfcAdapter adapter() {
        if (adapter == null) {
            adapter = NfcAdapter.getDefaultAdapter(getContext());
        }
        return adapter;
    }

    private void clearTimeout() {
        if (timeoutTask != null) {
            main.removeCallbacks(timeoutTask);
            timeoutTask = null;
        }
    }

    private void stopReader() {
        sessionActive = false;
        clearTimeout();
        NfcAdapter current = adapter();
        if (current != null && getActivity() != null) {
            final NfcAdapter target = current;
            main.post(() -> {
                if (getActivity() == null) return;
                try {
                    target.disableReaderMode(getActivity());
                } catch (Exception error) {
                    Log.w(TAG, "disableReaderMode failed", error);
                }
            });
        }
        closeTag();
    }

    private void closeTag() {
        synchronized (this) {
            if (isoDep != null) {
                try {
                    isoDep.close();
                } catch (IOException error) {
                    Log.w(TAG, "IsoDep close failed", error);
                }
                isoDep = null;
            }
        }
    }

    private void settleStart(String code, String message) {
        PluginCall pending = startCall;
        startCall = null;
        if (pending == null) return;
        if (code == null) {
            JSObject result = new JSObject();
            result.put("connected", true);
            pending.resolve(result);
        } else {
            pending.reject(message, code);
        }
    }

    @Override
    public void onTagDiscovered(Tag tag) {
        IsoDep next = IsoDep.get(tag);
        if (next == null) {
            stopReader();
            main.post(() -> settleStart("nfc-unsupported-tag", "Карта не поддерживает IsoDep"));
            return;
        }
        synchronized (this) {
            closeTag();
            isoDep = next;
            try {
                isoDep.connect();
                isoDep.setTimeout(3000);
            } catch (IOException error) {
                Log.w(TAG, "IsoDep connect failed", error);
                isoDep = null;
                main.post(() -> {
                    stopReader();
                    settleStart("tag-lost", "Не удалось установить связь с картой");
                });
                return;
            }
        }
        main.post(() -> settleStart(null, null));
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        NfcAdapter current = adapter();
        JSObject result = new JSObject();
        result.put("available", current != null);
        result.put("enabled", current != null && current.isEnabled());
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        NfcAdapter current = adapter();
        if (current == null) {
            call.reject("NFC не поддерживается этим устройством", "nfc-unavailable");
            return;
        }
        if (!current.isEnabled()) {
            call.reject("NFC выключен в настройках", "nfc-disabled");
            return;
        }
        if (sessionActive) {
            call.reject("Считывание уже идёт", "busy");
            return;
        }
        startCall = call;
        sessionActive = true;
        int timeout = call.getInt("timeout", DEFAULT_TIMEOUT_MS);
        timeoutTask = () -> {
            stopReader();
            settleStart("timeout", "Карта не найдена. Поднесите её к задней панели телефона");
        };
        main.postDelayed(timeoutTask, timeout);
        main.post(() -> {
            if (getActivity() == null) {
                stopReader();
                settleStart("nfc-start-failed", "Экран уже закрыт");
                return;
            }
            try {
                current.enableReaderMode(
                        getActivity(),
                        this,
                        NfcAdapter.FLAG_READER_NFC_A
                                | NfcAdapter.FLAG_READER_NFC_B
                                | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK
                                | NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS,
                        null
                );
            } catch (Exception error) {
                stopReader();
                settleStart("nfc-start-failed", "Не удалось включить NFC: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void transceive(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.isEmpty()) {
            call.reject("Пустая команда APDU", "bad-apdu");
            return;
        }
        final IsoDep target;
        synchronized (this) {
            target = isoDep;
        }
        if (target == null) {
            call.reject("Карта не на связи", "no-tag");
            return;
        }
        final String command = data.replaceAll("\\s+", "").toUpperCase();
        worker.execute(() -> {
            try {
                if (!target.isConnected()) {
                    target.connect();
                    target.setTimeout(3000);
                }
                byte[] response = target.transceive(hexToBytes(command));
                JSObject result = new JSObject();
                if (response.length < 2) {
                    result.put("response", "");
                    result.put("sw", "");
                } else {
                    int bodyLength = response.length - 2;
                    byte[] body = new byte[bodyLength];
                    System.arraycopy(response, 0, body, 0, bodyLength);
                    result.put("response", bytesToHex(body));
                    result.put("sw", bytesToHex(new byte[]{response[bodyLength], response[bodyLength + 1]}));
                }
                main.post(() -> call.resolve(result));
            } catch (Exception error) {
                Log.w(TAG, "transceive failed", error);
                closeTag();
                final String detail = error.getMessage();
                main.post(() -> call.reject("Связь с картой потеряна: " + detail, "tag-lost"));
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        startCall = null;
        stopReader();
        call.resolve();
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        stopReader();
        settleStart("cancelled", "Считывание отменено");
    }

    @Override
    protected void handleOnDestroy() {
        stopReader();
        worker.shutdownNow();
        super.handleOnDestroy();
    }

    private static byte[] hexToBytes(String value) {
        int length = value.length() / 2;
        byte[] output = new byte[length];
        for (int index = 0; index < length; index += 1) {
            output[index] = (byte) Integer.parseInt(value.substring(index * 2, index * 2 + 2), 16);
        }
        return output;
    }

    private static String bytesToHex(byte[] value) {
        StringBuilder builder = new StringBuilder(value.length * 2);
        for (byte item : value) {
            builder.append(String.format("%02X", item & 0xff));
        }
        return builder.toString();
    }
}
