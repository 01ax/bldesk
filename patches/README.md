# Android HTTP Request Bodies

`@capacitor+android+8.5.2.patch` addresses #196. It changes only the native
string-body writer and the empty-mutation branch in Capacitor Android.
BLDesk's API requests use JSON; no JavaScript transport or retry policy changes.

## Why

Capacitor's default request-body writer lets `HttpURLConnection` buffer JSON.
On a reused connection, a lost response can then cause the native layer to
replay the write before JavaScript sees an error. A counting fixture reproduces
this with one native call and two handler executions.

The patch encodes the string once as UTF-8, sets fixed-length streaming to that
byte count before opening the output stream, and writes those same bytes. A
mutation with no data gets fixed-length streaming with length zero too. Reads
are unchanged. Authentication, certificate validation and response parsing
remain Capacitor's.

[Android's public API](https://developer.android.com/reference/java/net/HttpURLConnection#setFixedLengthStreamingMode(int))
documents streaming without internal body buffering. The
[Android HTTP adapter](https://android.googlesource.com/platform/prebuilts/fullsdk/sources/+/dc3f885ebe8ddc75bd9cf2d567eef4d1ed433a09/android-35/com/android/okhttp/internal/huc/HttpURLConnectionImpl.java)
selects buffering when neither streaming mode is set; the
[recovery implementation](https://android.googlesource.com/platform/external/okhttp/+/ba6e9e9/okhttp/src/main/java/com/squareup/okhttp/internal/http/HttpEngine.java)
permits replay of buffered bodies, but not an already-streamed request body.
The fixture results below are the runtime check, not a guarantee about every
Android release or every possible network failure.

The cost is less automatic write recovery: if a connection dies before the
handler executes, the write now fails instead of being retried. The client
cannot distinguish this from a lost answer after execution, so it retains the
uncertain-outcome message and asks the user to check before trying again.
A cleanly expired idle connection still succeeds in the fixture below.

## Installation And Updates

- The Android dependency is pinned to 8.5.2 while this patch is needed.
- `npm ci --legacy-peer-deps` applies it through `postinstall`, before native
  dependency setup. `patch-package --error-on-fail` stops installation if it
  cannot apply. If lifecycle scripts were deliberately skipped, run
  `npx patch-package --error-on-fail` before building.
- `npm run test:api-errors` includes clean-source application, repeated
  application, incompatible-source rejection and adapter no-resend checks.
- Review Android, core and CLI upgrades together so the Capacitor packages
  remain aligned. Review the patch against the new Android release, update
  its version and rerun the native counting checks. Remove the patch and its
  pin only after an upstream fix passes the same checks.

## Verification (26 October 2026)

The native dependency was reversed and reapplied while keeping the QA app and
TLS configuration the same. Tests use only loopback fixtures and fictitious
data. Connection IDs verify that the warm request uses an existing connection.
The table's unpatched column is the eighteen-case HTTPS/HTTP/1.1 control.
A separate eight-case plain-HTTP control covers the original POST loss cases.

| Case | Unpatched | Patched |
| --- | --- | --- |
| Cold POST; answer lost after execution | One execution, error | One execution, error |
| Reused POST; answer lost after execution | Two executions, reported success | One execution, error |
| Every POST answer lost on a reused connection | Two executions, error | One execution, error |
| Reused POST dropped before execution | Retried, one execution, success | No replay, zero executions, error |
| Empty POST and DELETE, and PUT and PATCH with a body; answer lost | Two executions, reported success | One execution, error |
| GET; answer lost | Read retried | Read still retried |
| Normal success, HTTP 400, and expired idle connection | Normal response | Normal response |

Eighteen native cases pass against HTTP/1.1 and another eighteen against
HTTPS/HTTP/1.1. They include Unicode objects, arrays, JSON strings, a 60,014-byte
body, and empty requests. Plain HTTP checks include FIN and RST; HTTPS checks
include orderly and abrupt connection loss. Received body bytes match the
input. Native 204 and 205 responses do not replay the request. An untrusted
fixture certificate is rejected before any HTTP request reaches its handler.
The repeated patched runs record only `content-length`, `transfer-encoding`
and `content-type`: write lengths equal the received UTF-8 byte counts,
including zero for empty POST and DELETE; no write uses chunked transfer.
Empty PUT and PATCH were not exercised.

In the real Add a Cloud Server form, dropping the answer after a successful
fake-backend creation yields one POST and one fixture server. The form remains
open with the existing uncertain-outcome guidance to check before trying
again. No renderer exception occurs; the logged request body passes the public
API schema check. No live API test is claimed.

Fourteen additional HTTP/HTTPS status checks preserve 401 (including a Basic
challenge) and 403 responses. POST responses with 301, 302 or 303 redirect to
a GET; 307 and 308 return without replaying the write at the redirect target.
The client uses bearer tokens, not interactive challenge authentication.

HTTP/2 was not exercised: the tested native transport rejected an HTTP/2-only
listener during protocol negotiation. Multipart, binary and form-urlencoded
object upload paths, and requests without a Content-Type, are not changed or
verified by this patch. The BLDesk API adapter always sends JSON Content-Type.
The existing `openapi-fetch` JSON-parse
failure on an empty 205 remains separate; its regression asserts no resend,
not successful parsing. Other redirect chains and interactive authentication
are not covered; streaming is not a general-purpose replayable upload body.
