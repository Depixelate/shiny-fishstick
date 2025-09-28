# Tap Grid PWA

Final build of the tap-grid progressive web app.

- Daily target starts at 300 taps and increases by 100 after every completed image phase.
- Per-tap timer begins at 900&nbsp;ms and accelerates by 100&nbsp;ms each quintile down to 500&nbsp;ms.
- Failing a run resets both the tap count and target back to the daily baseline (300 taps, 900&nbsp;ms pace).
- Responsive grid automatically scales to nearly fill the screen while keeping each tile square.
- Includes offline support via service worker and optional persistent storage pinning.