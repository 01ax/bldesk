# Screenshots for the threshold-alert PR (termau/bldesk#363)

Images only. Every picture uses the GUI test harness's fictitious data (made-up servers, an account called "Atlas Demo");
nothing here is a real account.

BEFORE is `main` at v1.0.63-beta.4 (b0d732c). AFTER is the PR branch rebased on that same main. Both were driven through
the same steps against the same mock fixture (`edge-web-syd-01` with a CPU and a memory alert raised), in the real Electron
app on Linux, at the same window size.

| File | Shows |
| --- | --- |
| `1-heatmap-before-after.png` | Fleet heatmap: bells on the rows of the servers BinaryLane lists as alerting |
| `2-server-page-before-after.png` | The server's page: the yellow "2 alerts triggered" pill |
| `3-alerts-tab-before-after.png` | Settings > Alerts: the banner, and all eight rules (main shows four) |
| `4-heatmap-popup-after.png` | The popup a click or tap on a bell opens |
| `5-real-phone-after.png` | The same on a real Android phone (dark theme), final build |
| `6-popup-small-window-after.png` | After the review fix: the popup with eight alerts in a 683x453 window (a 1024x680 window at 150% zoom), its list scrolling between the header and the button |
