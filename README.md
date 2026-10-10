# CielScenes

Shared web scenes (HTML/JS/CSS/fonts) for CieLinux, CielWin and CielDroid.

Each app consumes this repository as a git submodule and keeps its
platform-specific behavior in the host, not in these files:

| App       | Submodule path               | Host                      |
|-----------|------------------------------|---------------------------|
| CieLinux  | `scenes/`                    | Qt WebEngine (`qrc:`)     |
| CielWin   | `CielWin.App/Wallpaper/Web/` | WebView2 (virtual host)   |
| CielDroid | `app/src/main/assets/scenes` | Android WebView (assets)  |

## Host contract

- Host to page: `window.cielinuxAlertCommand(jsonString)`; on WebView2 also
  `chrome.webview` messages.
- Page to host: console markers `CIELINUX_ALERT_READY_V1`,
  `CIELINUX_ALERT_DONE_V1`, `CIELINUX_SCENE_DRAW_READY_V1 <scene>`; on WebView2
  also `chrome.webview.postMessage("ready" | "done")`.
- Query parameters: `fps=30|60`, `variant=mini`.

## Updating an app

```sh
git submodule update --remote <path>
git add <path> && git commit
```
