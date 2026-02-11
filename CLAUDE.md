# Piano Tutor Development Guide

This document defines UI patterns and standards for consistency across all practice modes.

## Mode Panel Structure

Every practice mode should follow this structure:

```
Panel
├── Header (title + info button + avg time display)
├── Settings Panel (hidden during play)
│   ├── Settings controls (selects, checkboxes)
│   └── Settings hint text
├── Challenge Display (hidden until playing)
│   ├── Challenge prompt
│   └── Feedback text
├── Complete Display (hidden until game ends)
│   └── 5-column stats grid: Rounds | Avg Time | 1st Try | Mistakes | Slow
├── Piano SVG
├── Controls Bar
│   ├── Start button
│   └── Stats display (Round X/Y, 1st Try %, Mistakes, Slow)
├── History Section
└── Breakdown Section (per-chord/key stats)
```

## Button Text & Styling Standards

Use these exact labels for consistency:

| State | Button Text | Button Color |
|-------|-------------|--------------|
| Ready to start | `Start Game` | Blue (`bg-blue-600`) |
| Currently playing | `Stop` | Gray (`bg-slate-600`) |
| Game complete | `Play Again` | Blue (`bg-blue-600`) |

**Controls layout:**
```html
<div class="flex justify-between items-center">
    <div class="space-x-4">
        <button class="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded transition">
            Start Game
        </button>
    </div>
    <div class="flex gap-4 text-xs text-slate-400">
        <span>Round: <span id="xxx_roundDisplay">0</span>/<span id="xxx_totalRounds">12</span></span>
        <span class="text-green-400">1st Try: <span id="xxx_firstTry">0%</span></span>
        <span>Mistakes: <span id="xxx_mistakes">0</span></span>
        <span>Slow: <span id="xxx_slow">0</span></span>
    </div>
</div>
```

**Implementation pattern (single toggle button):**
```javascript
// Starting game - change to Stop (gray)
startBtn.textContent = 'Stop';
startBtn.onclick = stopGame;
startBtn.classList.remove('bg-blue-600', 'hover:bg-blue-500');
startBtn.classList.add('bg-slate-600', 'hover:bg-slate-500');

// Stopping early - change to Start Game (blue)
startBtn.textContent = 'Start Game';
startBtn.onclick = startGame;
startBtn.classList.remove('bg-slate-600', 'hover:bg-slate-500');
startBtn.classList.add('bg-blue-600', 'hover:bg-blue-500');

// Completing game - change to Play Again (blue)
startBtn.textContent = 'Play Again';
startBtn.onclick = startGame;
startBtn.classList.remove('bg-slate-600', 'hover:bg-slate-500');
startBtn.classList.add('bg-blue-600', 'hover:bg-blue-500');
```

**Note:** Modes 1-13 use separate Start/Stop buttons with visibility toggling.
Modes 14+ use a single toggle button. Both patterns work - prefer single button for new modes.

## Element ID Naming

Use this prefix pattern: `{modePrefix}_{element}`

Examples:
- `shell_startBtn`
- `shell_roundsSelect`
- `shell_pianoSvg`
- `shell_challengeDisplay`

## Settings Panel

Standard settings options:
- **Rounds**: `6 | 12 | 24` (default: 12)
- **Show hints**: Checkbox (default: unchecked)
- **Type filter**: Mode-specific (e.g., chord type, scale type)

## Stats Display

During play, show in controls bar:
- `Round: X / Y`
- `1st Try: X%` (green text)
- `Mistakes: X`
- `Slow: X`

At completion, show 5-column grid:
- Rounds played
- Average time (in seconds, 1 decimal)
- First try percentage
- Total mistakes
- Slow responses (>2s for chords, >4s for scales)

## Timing Thresholds

| Mode Type | Fast | Medium | Slow |
|-----------|------|--------|------|
| Chords/voicings | <2s | 2-4s | >4s |
| Scales (8 notes) | <4s | 4-6s | >6s |
| Single notes | <1s | 1-2s | >2s |

## Timer Color Classes

```css
.timer-fast { color: #4ade80; }    /* green-400 */
.timer-medium { color: #facc15; }  /* yellow-400 */
.timer-slow { color: #f87171; }    /* red-400 */
```

## History Storage

Each mode stores history in localStorage:
- Key: `{modePrefix}_history`
- Max entries: 20 games
- Structure:
```javascript
{
  date: ISO string,
  rounds: number,
  avgTime: number (milliseconds),
  firstTryPct: number,
  mistakes: number,
  slowCount: number,
  config: { ...mode-specific settings }
}
```

## Cumulative Stats

Track problem areas across sessions:
- Key: `{modePrefix}_cumulativeStats`
- Flag as problem if mistake rate >30% over 3+ attempts

## Countdown Timer (Required)

Every mode MUST have a 3-2-1 countdown before the first challenge:

```javascript
function {prefix}RunCountdown(count) {
    if (!{prefix}_isPlaying) return;
    document.getElementById('{prefix}_displayElement').textContent = count;
    // Clear any hint/feedback text during countdown
    if (count > 0) {
        setTimeout(() => {prefix}RunCountdown(count - 1), 800);
    } else {
        {prefix}NextChallenge();
    }
}
```

**CRITICAL:** The `challengeStartTime` must be set in `NextChallenge()`, NOT in `StartGame()`.

## MIDI Handler Guards (Required)

Always guard against notes played during countdown or after game ends:

```javascript
function {prefix}OnNoteOn(midi) {
    // MUST check all three conditions to prevent timestamp bugs
    if (!{prefix}_isPlaying || !{prefix}_challenge || !{prefix}_challengeStartTime) return;
    // ... rest of handler
}
```

**Why:** If `challengeStartTime` is null, `Date.now() - null` equals `Date.now()` (full timestamp),
which corrupts timing data with values like 1767892319000ms.

## JavaScript Function Naming

```javascript
{prefix}StartGame()      // Initialize and start
{prefix}StopGame()       // User stops early
{prefix}RunCountdown()   // 3-2-1 countdown before first challenge
{prefix}NextChallenge()  // Generate next challenge (sets challengeStartTime!)
{prefix}OnNoteOn(midi)   // Handle MIDI note on (with guards!)
{prefix}OnNoteOff(midi)  // Handle MIDI note off
{prefix}EndGame()        // Game completed naturally
{prefix}ShowBreakdown()  // Render per-item stats
{prefix}LoadHistory()    // Load from localStorage
{prefix}RenderHistory()  // Render history section
{prefix}UpdateCumulativeStats()
{prefix}GetProblemAreas()
```

## Adding a New Mode

1. Add mode button to mode selector grid
2. Add panel HTML following structure above
3. Add an entry to `MODE_REGISTRY` array — this automatically handles:
   - Mode switching (switchMode)
   - MIDI routing (handleMIDI)
   - Piano drawing on init and resize
   - History loading and breakdown display on init
4. Use `{prefix}_history` and `{prefix}_cumulativeStats` for localStorage keys
5. Use `timerClass(seconds)` helper for timer color classes (or `timerClass(seconds, 3, 6)` for scales)
6. Add settings to `saveAllSettings()` and `loadAllSettings()`
7. Update README.md with new mode
8. Update IDEAS.md to mark as implemented if applicable

## Info Modal Pattern

Each mode should have an info button that opens a modal explaining:
- What the exercise practices
- The formula/pattern being learned
- Tips for practice
- Source/credit if applicable
