# Stable viewport in the installed app

The Home Screen application now permits ordinary horizontal/vertical touch
scrolling while preventing pinch and double-tap zoom via `touch-action: pan-x
pan-y`. Standalone mode is detected through the display-mode media query and
iOS's `navigator.standalone`. Safari gesture events are cancelled only in this
installed mode. Ordinary browser tabs retain browser zoom.

Mobile text inputs, selects and textareas now use at least the existing 16 px
base font size, including search and filter controls, to avoid small-field focus
zoom. There are no changes to authentication, data storage or permissions.

The implementation follows [W3C's touch-action specification](https://www.w3.org/TR/pointerevents/latest/).
Viewport scale restrictions alone are insufficient on iOS Safari; WebKit
[documents that Safari can ignore them](https://webkit.org/blog/7367/new-interaction-behaviors-in-ios-10/).
No maximum-scale or user-scalable restriction was added to ordinary browser tabs.

## Verification

The desktop/mobile browser suite passed 23 scenarios. Seven scenarios were
skipped: three mobile-only gesture cases on desktop, and four hosted-only checks.
The new mobile checks use CDP touch pinch gestures: installed mode stays at scale
1, while an ordinary browser tab increases its scale. Single-touch scrolling,
Safari gesture cancellation, dialog typing/closing, mobile font sizes and
horizontal overflow checks also pass. Existing import/export and customer-policy
workflows passed. Production build/TypeScript, lint, formatting and whitespace
checks passed.

These checks use Chrome's iPhone emulation and an emulated standalone flag;
physical iPhone Safari/Home Screen behavior was not tested. The installed app
should be fully closed and reopened after publication to load the new bundle.
