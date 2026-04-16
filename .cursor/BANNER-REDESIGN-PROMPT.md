# Banner Redesign — Implementation Prompt for Cursor

## Overview
Redesign the legal hours banner in `index.html` / `styles.css` / `app.js`. Replace the current layout (sun arc + hunter cartoon + sunrise/sunset columns) with a new timeline bar design. The visual reference is in `banner-final-f.html` — open it in a browser to see the exact target.

## What to remove
1. **Hunter SVG templates** — Delete the entire `#tpl-hunter` div (contains `#hunter-awake` and `#hunter-asleep` SVGs) from `index.html`
2. **Sun arc SVG** — Remove the `#sun-arc-svg` element and the `drawSunArc()` function from `app.js`
3. **Banner icon** — Remove `#banner-icon` div (was used to show the hunter)
4. **Hunter rendering code** in `renderBanner()` in `app.js` — the block that reads `hunter-awake`/`hunter-asleep` and injects into `#banner-icon`
5. **Old sunrise/sunset column layout** — The `.sun-time-block` columns flanking the arc (left=sunrise, right=sunset)
6. **Old CSS** for `.sun-arc-wrap`, `.sun-arc-svg`, `.banner-status-block`, `.sun-time-block`, `.sun-time-icon`, `.sun-time-label`, `.sun-time-value`, `.sun-time-legal`, `.status-icon-big`

## New HTML structure (replace the `banner-main-row` contents)
The new banner has this structure top to bottom:

```
1. Top row: Date (left) | Location + edit + info button (right)
2. Status: dot + "Legal to Shoot" label (centred)
3. Countdown: large monospace timer (centred)  
4. "Remaining" or "Until legal" label (centred)
5. Timeline bar section:
   - Left column (60px): "LEGAL START" label, time (e.g. 04:52), "↑ Rise 05:52"
   - Centre (flex): horizontal progress bar with sun/moon marker
   - Right column (60px): "LEGAL END" label, time (e.g. 21:34), "↓ Set 20:34"
6. Moon + activity row (tappable, opens activity forecast):
   - Moon SVG icon + "Waning Gibbous · 68%" text
   - Activity score badge "🦌 72%" (right)
   - "View deer activity forecast ›" link (right-aligned, below)
```

## Three colour states

The banner has three states controlled by `bannerState.isLegal` and `bannerState.isTwilight`:

### Legal (isLegal && !isTwilight)
- Status dot: `#7adf7a` with `box-shadow: 0 0 8px rgba(122,223,122,0.5)`
- Status label: "Legal to Shoot" in `#7adf7a`
- Countdown colour: `#7adf7a`
- Banner border: `1px solid rgba(200,168,75,0.1)`
- Banner background: `linear-gradient(180deg,#0c1e08,#0a1606)`
- Timeline bar: green centre zone `rgba(122,223,122,0.25)`, amber twilight zones at each end `rgba(240,192,64,0.2)` (6% width each)
- Sun marker: `#f5c842` with glow
- Legal start/end times: `rgba(122,223,122,0.7)`
- Activity badge: green border/text

### Twilight (isLegal && isTwilight)  
- SAME countdown behaviour (still counting down to legal end)
- Status label: STILL "Legal to Shoot" (not "Twilight")
- ALL colours shift to amber `#f0c040`
- Banner border: `1px solid rgba(240,192,64,0.12)`
- Banner background: `linear-gradient(180deg,#1a1808,#140e04)`
- Sun marker shifts to `#e87820` (sunset orange)
- Sun position moves into the twilight zone at the relevant end of the bar
- Legal end time highlighted brighter amber
- Activity badge: amber border/text

### Outside Legal Hours (!isLegal)
- Status dot: `rgba(255,80,80,0.4)` (red, no glow)
- Status label: "Outside of Legal Hours" in `rgba(255,255,255,0.35)`
- Countdown: `rgba(255,255,255,0.18)` — counts up to next legal start
- Label: "Until legal"
- Banner border: `1px solid rgba(255,80,80,0.08)` (red tint)
- Banner background: `linear-gradient(180deg,#0e0808,#0a0606)` (dark red-ish)
- Timeline bar: RED tint `rgba(255,60,60,0.1)`, ticks red
- Moon crescent replaces sun on the bar
- All times dimmed to ~0.2 opacity
- Activity badge: very dim
- "View deer activity forecast ›" link very dim

## Timeline bar implementation

The bar represents the legal window (not the full 24h day). It spans from legal start to legal end.

- **Track**: `height:8px; background:rgba(255,255,255,0.03); border-radius:4px`
- **Legal window fill**: full width of the bar, with dawn twilight zone (left 6%), core daylight (middle 88%), dusk twilight zone (right 6%)
- **Elapsed overlay**: covers from left edge to sun position, `rgba(state_colour,0.08)`
- **Sun marker**: positioned at `(currentMinute - legalStartMin) / (legalEndMin - legalStartMin) * 100%` along the bar
  - During legal: golden circle with radial gradient and glow
  - During twilight: orange `#e87820`
  - Outside legal hours: replaced with a moon crescent SVG
- **Sunrise tick**: thin 2px line at `(sunriseMin - legalStartMin) / (legalEndMin - legalStartMin) * 100%` position, colour `#e8a020`
- **Sunset tick**: same calculation for sunset, colour `#e87820`
- **Start/end ticks**: at 0% and 100%, colour matches state (green/amber/red)

## JavaScript changes in app.js

### `renderBanner()` function
Update to:
1. Remove all hunter icon rendering code
2. Set the status label to "Legal to Shoot" (green), "Legal to Shoot" (amber, during twilight), or "Outside of Legal Hours"
3. Set countdown colour: green / amber / dim based on state
4. Update the timeline bar sun/moon position
5. Update the bar colours based on state
6. Apply the correct banner background/border based on state

### Remove `drawSunArc()` 
Delete entirely. Replace with a new function `updateTimelineBar()` that:
- Calculates sun position as percentage: `(curMin - lsMin) / (leMin - lsMin) * 100`, clamped 0-100
- Calculates sunrise/sunset tick positions the same way
- Updates the sun marker element's `left` CSS percentage
- Updates sunrise/sunset tick positions
- Swaps sun for moon when outside legal hours

### `updateBannerClock()`
- Keep the countdown logic exactly as-is (it already handles all three states correctly)
- Just update the element references if IDs change

### Moon widget
- Keep `#moon-widget` and `toggleActivityPanel()` functionality
- Add the "View deer activity forecast ›" link as a `<div>` below the moon/badge row
- The entire section (moon + badge + link) is tappable and calls `toggleActivityPanel()`

## CSS changes in styles.css

Remove old classes: `.sun-arc-wrap`, `.sun-arc-svg`, `.banner-status-block`, `.sun-time-block`, `.sun-time-icon`, `.sun-time-label`, `.sun-time-value`, `.sun-time-legal`

Add new classes for the timeline bar and updated layout. Use the design token colours from the existing system:
- `--moss: #5a7a30`
- `--gold: #c8a84b`  
- `--amber: #f0c870`
- `--leaf: #7adf7a`

## Important: preserve existing element IDs
These IDs are referenced elsewhere in app.js and MUST be kept (update their content/styling but keep the ID):
- `#banner-label` — status text
- `#banner-sublabel` — secondary text  
- `#banner-countdown` — countdown timer
- `#sunrise-time` — sunrise time value (move to new position)
- `#sunset-time` — sunset time value (move to new position)
- `#legal-start-time` — legal start time value
- `#legal-end-time` — legal end time value
- `#moon-widget` — moon phase tappable area
- `#moon-svg` — moon phase SVG
- `#moon-phase-name` — moon phase text
- `#moon-illumination` — illumination percentage
- `#activity-score-badge` — deer activity score badge
- `#activity-pip` — activity indicator dot
- `#banner-date`, `#banner-date-day`, `#banner-date-num`, `#banner-date-month`, `#banner-date-year`
- `#banner-location-text`, `#edit-location-btn`, `#live-dot`
- `#info-btn`
- `#sun-dot` — can be repurposed as the timeline sun marker

## New element IDs needed
- `#timeline-bar` — the progress bar container
- `#timeline-legal-fill` — the legal window coloured fill
- `#timeline-elapsed` — the elapsed portion overlay
- `#timeline-sunrise-tick` — sunrise position marker
- `#timeline-sunset-tick` — sunset position marker
- `#timeline-start-tick` — legal start tick (left edge)
- `#timeline-end-tick` — legal end tick (right edge)
- `#forecast-link` — the "View deer activity forecast ›" text

## File locations
- `index.html` — HTML structure
- `styles.css` — all CSS  
- `app.js` — all JavaScript
- `banner-final-f.html` — visual reference (DO NOT modify this file)

## Testing checklist
After implementation, verify:
- [ ] Legal state shows green countdown, green bar, golden sun marker
- [ ] Twilight state shows amber countdown, amber bar, orange sun in twilight zone
- [ ] Outside legal hours shows dim countdown, red-tinted bar, moon marker
- [ ] Countdown timer ticks every second (existing `updateBannerClock` logic)
- [ ] Sun/moon position updates on the timeline bar
- [ ] Sunrise/sunset ticks appear at correct positions
- [ ] Legal start/end times display correctly
- [ ] Moon widget tap opens activity forecast panel (existing `toggleActivityPanel`)
- [ ] Activity score badge shows/hides correctly
- [ ] Location edit button works
- [ ] Info button works
- [ ] No console errors
- [ ] Hunter SVG templates fully removed
- [ ] `drawSunArc` function fully removed
