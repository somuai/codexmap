 # Design System Inspired by Miro

## 1. Visual Theme & Atmosphere

Miro's website is a clean, collaborative-tool-forward platform that communicates "visual thinking" through generous whitespace, pastel accent colors, and a confident geometric font. The design uses a predominantly white canvas with near-black text (`#1c1c1e`) and a distinctive pastel color palette — coral, rose, teal, orange, yellow, moss — each representing different collaboration contexts.

The typography uses Roobert PRO Medium as the primary display font with OpenType character variants (`"blwf", "cv03", "cv04", "cv09", "cv11"`) and negative letter-spacing (-1.68px at 56px). Noto Sans handles body text with its own stylistic set (`"liga" 0, "ss01", "ss04", "ss05"`). The design is built with Framer, giving it smooth animations and modern component patterns.

**Key Characteristics:**
- White canvas with near-black (`#1c1c1e`) text
- Roobert PRO Medium with multiple OpenType character variants
- Pastel accent palette: coral, rose, teal, orange, yellow, moss (light + dark pairs)
- Blue 450 (`#5b76fe`) as primary interactive color
- Success green (`#00b473`) for positive states
- Generous border-radius: 8px–50px range
- Framer-built with smooth motion patterns
- Ring shadow border: `rgb(224,226,232) 0px 0px 0px 1px`

## 2. Color Palette & Roles

### Primary
- **Near Black** (`#1c1c1e`): Primary text
- **White** (`#ffffff`): `--tw-color-white`, primary surface
- **Blue 450** (`#5b76fe`): `--tw-color-blue-450`, primary interactive
- **Actionable Pressed** (`#2a41b6`): `--tw-color-actionable-pressed`

### Pastel Accents (Light/Dark pairs)
- **Coral**: Light `#ffc6c6` / Dark `#600000`
- **Rose**: Light `#ffd8f4` / Dark (implied)
- **Teal**: Light `#c3faf5` / Dark `#187574`
- **Orange**: Light `#ffe6cd`
- **Yellow**: Dark `#746019`
- **Moss**: Dark `#187574`
- **Pink** (`#fde0f0`): Soft pink surface
- **Red** (`#fbd4d4`): Light red surface
- **Dark Red** (`#e3c5c5`): Muted red

### Semantic
- **Success** (`#00b473`): `--tw-color-success-accent`

### Neutral
- **Slate** (`#555a6a`): Secondary text
- **Input Placeholder** (`#a5a8b5`): `--tw-color-input-placeholder`
- **Border** (`#c7cad5`): Button borders
- **Ring** (`rgb(224,226,232)`): Shadow-as-border

## 3. Typography Rules

### Font Families
- **Display**: `Roobert PRO Medium`, fallback: Placeholder — `"blwf", "cv03", "cv04", "cv09", "cv11"`
- **Display Variants**: `Roobert PRO SemiBold`, `Roobert PRO SemiBold Italic`, `Roobert PRO`
- **Body**: `Noto Sans` — `"liga" 0, "ss01", "ss04", "ss05"`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing |
|------|------|------|--------|-------------|----------------|
| Display Hero | Roobert PRO Medium | 56px | 400 | 1.15 | -1.68px |
| Section Heading | Roobert PRO Medium | 48px | 400 | 1.15 | -1.44px |
| Card Title | Roobert PRO Medium | 24px | 400 | 1.15 | -0.72px |
| Sub-heading | Noto Sans | 22px | 400 | 1.35 | -0.44px |
| Feature | Roobert PRO Medium | 18px | 600 | 1.35 | normal |
| Body | Noto Sans | 18px | 400 | 1.45 | normal |
| Body Standard | Noto Sans | 16px | 400–600 | 1.50 | -0.16px |
| Button | Roobert PRO Medium | 17.5px | 700 | 1.29 | 0.175px |
| Caption | Roobert PRO Medium | 14px | 400 | 1.71 | normal |
| Small | Roobert PRO Medium | 12px | 400 | 1.15 | -0.36px |
| Micro Uppercase | Roobert PRO | 10.5px | 400 | 0.90 | uppercase |

## 4. Component Stylings

### Buttons
- Outlined: transparent bg, `1px solid #c7cad5`, 8px radius, 7px 12px padding
- White circle: 50% radius, white bg with shadow
- Blue primary (implied from interactive color)

### Cards: 12px–24px radius, pastel backgrounds
### Inputs: white bg, `1px solid #e9eaef`, 8px radius, 16px padding

## 5. Layout Principles
- Spacing: 1–24px base scale
- Radius: 8px (buttons), 10px–12px (cards), 20px–24px (panels), 40px–50px (large containers)
- Ring shadow: `rgb(224,226,232) 0px 0px 0px 1px`

## 6. Depth & Elevation
Minimal — ring shadow + pastel surface contrast

## 7. Do's and Don'ts
### Do
- Use pastel light/dark pairs for feature sections
- Apply Roobert PRO with OpenType character variants
- Use Blue 450 (#5b76fe) for interactive elements
### Don't
- Don't use heavy shadows
- Don't mix more than 2 pastel accents per section

## 8. Responsive Behavior
Breakpoints: 425px, 576px, 768px, 896px, 1024px, 1200px, 1280px, 1366px, 1700px, 1920px

## 9. Agent Prompt Guide
### Quick Color Reference
- Text: Near Black (`#1c1c1e`)
- Background: White (`#ffffff`)
- Interactive: Blue 450 (`#5b76fe`)
- Success: `#00b473`
- Border: `#c7cad5`
### Example Component Prompts
- "Create hero: white background. Roobert PRO Medium 56px, line-height 1.15, letter-spacing -1.68px. Blue CTA (#5b76fe). Outlined secondary (1px solid #c7cad5, 8px radius)."
# CodexMap — UI Design Specification
## Based on Official Miro Design Tokens (`npx getdesign@latest add miro`)

---

## 1. Design Identity

**Product:** CodexMap — Real-time multi-agent codebase intelligence  
**Aesthetic:** Miro official design system — white canvas, Roobert PRO typography, pastel accent pairs, Blue 450 interactive  
**Tone:** Visual thinking tool. Open, collaborative, precise. A living Miro board where your codebase thinks.  
**Unforgettable Element:** Node cards use Miro's pastel light/dark pairs — green nodes in teal pastel, red nodes in coral pastel — making drift feel like a Miro board coming alive.

---

## 2. Official Color Tokens

```css
/* ── Primary ── */
--color-near-black:          #1c1c1e;   /* All primary text */
--color-white:               #ffffff;   /* Primary surface, canvas */
--color-blue-450:            #5b76fe;   /* Primary interactive — buttons, links, rings */
--color-actionable-pressed:  #2a41b6;   /* Button pressed state */

/* ── Pastel Accent Pairs (light/dark) ── */
--color-coral-light:   #ffc6c6;   --color-coral-dark:  #600000;
--color-rose-light:    #ffd8f4;
--color-teal-light:    #c3faf5;   --color-teal-dark:   #187574;
--color-orange-light:  #ffe6cd;
--color-yellow-dark:   #746019;
--color-pink:          #fde0f0;
--color-red-light:     #fbd4d4;
--color-red-muted:     #e3c5c5;

/* ── Semantic ── */
--color-success:       #00b473;   /* Positive states, on-scope green */

/* ── Neutrals ── */
--color-slate:         #555a6a;   /* Secondary text */
--color-placeholder:   #a5a8b5;   /* Input placeholder, muted labels */
--color-border:        #c7cad5;   /* Button borders, dividers */
--color-ring:          rgb(224,226,232);  /* Ring shadow border */

/* ── Grade Mapping (using official pastel pairs) ── */
/* GREEN (on-scope)  → teal pair */
--grade-green-bg:      #c3faf5;   /* --color-teal-light */
--grade-green-text:    #187574;   /* --color-teal-dark */
--grade-green-border:  #187574;

/* YELLOW (review)   → orange/yellow pair */
--grade-yellow-bg:     #ffe6cd;   /* --color-orange-light */
--grade-yellow-text:   #746019;   /* --color-yellow-dark */
--grade-yellow-border: #d4850a;

/* RED (critical)    → coral pair */
--grade-red-bg:        #ffc6c6;   /* --color-coral-light */
--grade-red-text:      #600000;   /* --color-coral-dark */
--grade-red-border:    #600000;

/* ── Elevation ── */
--shadow-ring:    rgb(224,226,232) 0px 0px 0px 1px;
--shadow-card:    rgb(224,226,232) 0px 0px 0px 1px, 0 2px 8px rgba(0,0,0,0.06);
--shadow-panel:   0 8px 32px rgba(0,0,0,0.10), rgb(224,226,232) 0px 0px 0px 1px;
--shadow-toolbar: 0 2px 12px rgba(0,0,0,0.08);
```

---

## 3. Official Typography

```css
/* ── Font Families ── */
@import url('https://fonts.cdnfonts.com/css/roobert');  /* Roobert PRO */
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600&display=swap');

--font-display: 'Roobert PRO Medium', sans-serif;
--font-body:    'Noto Sans', sans-serif;
--font-mono:    'IBM Plex Mono', monospace;   /* CodexMap-specific: code blocks */

/* ── OpenType Features (Miro-official) ── */
.display { font-feature-settings: "blwf", "cv03", "cv04", "cv09", "cv11"; }
.body    { font-feature-settings: "liga" 0, "ss01", "ss04", "ss05"; }

/* ── Type Scale (from DESIGN.md) ── */
```

| Role | Font | Size | Weight | Line Height | Letter Spacing |
|---|---|---|---|---|---|
| Dashboard Hero | Roobert PRO Medium | 56px | 400 | 1.15 | −1.68px |
| Section Header | Roobert PRO Medium | 48px | 400 | 1.15 | −1.44px |
| Panel Title | Roobert PRO Medium | 24px | 400 | 1.15 | −0.72px |
| Sub-heading | Noto Sans | 22px | 400 | 1.35 | −0.44px |
| Feature Label | Roobert PRO Medium | 18px | 600 | 1.35 | normal |
| Body | Noto Sans | 18px | 400 | 1.45 | normal |
| Body Standard | Noto Sans | 16px | 400–600 | 1.50 | −0.16px |
| Button | Roobert PRO Medium | 17.5px | 700 | 1.29 | 0.175px |
| Caption | Roobert PRO Medium | 14px | 400 | 1.71 | normal |
| Small | Roobert PRO Medium | 12px | 400 | 1.15 | −0.36px |
| Mono / Code | IBM Plex Mono | 12px | 400 | 1.5 | normal |
| Micro Label | Roobert PRO | 10.5px | 400 | 0.90 | uppercase |

---

## 4. Layout Structure

```
┌──────────────────────────────────────────────────────────────────────┐
│  TOP TOOLBAR (56px, white, shadow-toolbar)                           │
│  [⬡ CodexMap]  [TodoAPI ▾]  ·  [Drift 67]  [● Live]  [Share]       │
│  [⚠ Collapse: 3 modules diverged                      Dismiss ✕]    │  ← coral-light bg
├──────────┬───────────────────────────────────────┬───────────────────┤
│  LEFT    │                                       │  RIGHT PANEL      │
│  SIDEBAR │     INFINITE CANVAS                  │  (320px)          │
│  (248px) │     #ffffff background                │  white surface    │
│  white   │     dot grid · zoomable · draggable   │  slides in from   │
│  border  │                                       │  right on click   │
│  right   │     Node cards:                       │                   │
│          │     white, ring shadow                │  Roobert PRO      │
│  Drift   │     pastel grade backgrounds          │  panel headers    │
│  Chart   │     Roobert PRO node names            │                   │
│          │     grouped in pastel containers      │                   │
│  Score   │                                       │                   │
│  Table   │                                       │                   │
│  Agent   │                                       │                   │
│  Feed    │                                       │                   │
└──────────┴───────────────────────────────────────┴───────────────────┘
│  BOTTOM TOOLBAR (48px, white, shadow-up)                             │
│  [🔍 Search]    [Fit] [+] [−] [100%]    [Layout] [Export] [⚙]      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 5. Top Toolbar

**Height:** 56px · **Background:** `#ffffff` · **Shadow:** `--shadow-toolbar`  
**Border-bottom:** `1px solid #c7cad5`

| Element | Spec |
|---|---|
| Logo | 32px hexagon · Roobert PRO Medium · "CodexMap" `#1c1c1e` |
| Project | "TodoAPI ▾" · Noto Sans 16px · `#555a6a` |
| Drift Score | Pill: Roobert PRO Medium 17.5px · `--grade-yellow-bg` · `--grade-yellow-text` · 8px radius |
| Status | `● Live` · `#00b473` dot · Noto Sans 14px |
| Agent pills | 4 pills · active = `#5b76fe` bg white text · idle = outlined `#c7cad5` |
| Share button | `#5b76fe` bg · white text · Roobert PRO Medium 17.5px · 8px radius · 7px 12px padding |

**Collapse Banner:**
```
background:    --color-coral-light (#ffc6c6)
border-bottom: 2px solid --color-coral-dark (#600000)
color:         --color-coral-dark
font:          Roobert PRO Medium 14px
text:          "⚠  Architectural Collapse Detected — 3 modules diverged"
right:         [Dismiss ✕] Noto Sans, #600000
animation:     height 0→40px, 250ms ease · auto-dismiss 10s
```

---

## 6. Left Sidebar

**Width:** 248px · **Background:** `#ffffff`  
**Right border:** `1px solid #c7cad5` (official border color)  
**No glass, no blur — flat white like official Miro panels**

### 6.1 Drift Timeline Chart (200px)
- White bg · `#c7cad5` grid lines
- Three zone fills (10% opacity): teal-light / orange-light / coral-light
- Smooth curve, color by zone
- Inflection markers: `#5b76fe` dots + Roobert PRO 10.5px uppercase timestamp labels
- Real-time via WebSocket · 60s polling fallback

### 6.2 Score Breakdown Table
```
Roobert PRO Medium 14px labels
Noto Sans 16px values (semibold)
Progress bars: ring-shadow track, colored fill per grade pastel

S1  Cosine        0.72  ████░  (teal fill)
S2  Cross-Enc     0.81  █████
A   Arch Fit      0.68  ████░
T   Type Fit      0.75  █████
D   Drift Pen    −0.12  ██░░░  (coral fill, negative)
──────────────────────────────────
S_final           0.74         Roobert PRO Medium 18px bold
```

### 6.3 Agent Activity Feed
```
● Cartographer   Roobert PRO Medium 14px, near-black
  12 nodes · 02:14:31    Noto Sans 12px, #555a6a

Colors: success #00b473 · yellow-dark · coral-dark · #a5a8b5 idle
```

---

## 7. Main Canvas

**Background:** `#ffffff` · **Dot grid:** `rgba(0,0,0,0.05)` every 24px  
**Feel:** Miro infinite board — open, spacious, white

### 7.1 Leaf Node Cards

Grade uses official **pastel pairs** — not arbitrary custom colors:

```
GREEN  node → --color-teal-light (#c3faf5) bg, #187574 text/border
YELLOW node → --color-orange-light (#ffe6cd) bg, #746019 text/border  
RED    node → --color-coral-light (#ffc6c6) bg, #600000 text/border
```

```css
.node-card {
  background:    var(--grade-X-bg);      /* pastel fill */
  border:        1px solid var(--grade-X-border);
  border-radius: 12px;                   /* Miro card radius */
  box-shadow:    var(--shadow-card);     /* ring shadow */
  padding:       12px 14px;
  width:         160px–240px;            /* by lineCount */
}

.node-title {
  font: Roobert PRO Medium 18px/1.35, feature-settings: "blwf","cv03"...;
  color: var(--grade-X-text);
  letter-spacing: normal;
}

.node-meta {
  font: IBM Plex Mono 12px;
  color: #555a6a;
}

.node-score-badge {
  font: Roobert PRO Medium 12px;
  background: white;
  border: 1px solid var(--grade-X-border);
  border-radius: 8px;
  padding: 2px 8px;
}

/* Hover */
.node-card:hover {
  box-shadow: rgb(224,226,232) 0 0 0 2px, 0 4px 16px rgba(0,0,0,0.08);
  transform: translateY(-1px);
}

/* Selected */
.node-card.selected {
  box-shadow: #5b76fe 0 0 0 2px;   /* Blue 450 ring */
}

/* RED node pulse */
.node-card.grade-red {
  animation: pulse-coral 2s ease-in-out infinite;
}
@keyframes pulse-coral {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.75; }
}
```

### 7.2 Directory Group Containers
```css
.directory-group {
  background:    #fde0f0;            /* --color-pink, subtle group bg */
  border:        1.5px dashed #c7cad5;
  border-radius: 20px;               /* large radius per Miro layout rules */
  padding:       16px;
}

.directory-chip {
  background:    #ffffff;
  border:        1px solid #c7cad5;
  border-radius: 8px;
  font:          IBM Plex Mono 10.5px uppercase;
  color:         #555a6a;
}

.directory-score {
  font:          Roobert PRO Medium 12px;
  background:    var(--grade-X-bg);
  border-radius: 50px;               /* pill */
  padding:       2px 10px;
}
```

### 7.3 Edges
```
Default:       1.5px solid #c7cad5
Green→Green:   1.5px solid rgba(24,117,116,0.30)   /* teal-dark tinted */
Green→Red:     2px dashed rgba(96,0,0,0.50)         /* coral-dark dashed */
               Label: "cross-contamination" · Roobert PRO 10.5px uppercase · #600000
```

### 7.4 Hover Tooltip
```
background:    #1c1c1e
color:         #ffffff
border-radius: 8px
font:          Noto Sans 14px / Roobert PRO 12px label
shadow:        --shadow-panel
arrow:         bottom-center pointer
```

### 7.5 Loading Skeleton
Shimmer cards using `--color-ring` as base + sweep animation.  
Center: `"Connecting to agents..."` · Noto Sans 16px · `#a5a8b5`

### 7.6 Empty State
```
Icon:    outlined hexagon, stroke #c7cad5
Title:   "No nodes yet" · Roobert PRO Medium 24px · #1c1c1e
Sub:     Noto Sans 16px · #555a6a
Command: IBM Plex Mono · white bg · ring shadow · 12px radius
```

---

## 8. Bottom Toolbar

**Height:** 48px · **Background:** `#ffffff`  
**Border-top:** `1px solid #c7cad5` · **Shadow:** `0 -2px 12px rgba(0,0,0,0.07)`

```
All buttons: Roobert PRO Medium 14px · #1c1c1e
Idle bg:     transparent · hover: #f4f4f5
Active:      #5b76fe bg · white text
Radius:      8px per Miro button spec
Padding:     7px 12px (official)
Dividers:    1px solid #c7cad5 between groups
```

---

## 9. Right Panel — Node Detail

**Width:** 320px · **Background:** `#ffffff`  
**Left border:** `1px solid #c7cad5`  
**Shadow:** `--shadow-panel` · **Open:** `translateX(100%)→0`, 250ms ease

### 9.1 Leaf Node Panel Layout

```
Header
──────
[grade pastel chip]  validateToken          ✕
IBM Plex Mono 12px: auth/validateToken.js
Noto Sans 14px #555a6a: function · 47 lines · SHA:a3f2

Divider: 1px solid #c7cad5

Score Breakdown (Roobert PRO Medium 14px section label)
──────────────────────────────────────────────────────
S_final   0.88   ████████░   (large, 18px semibold)
S1        0.85   Cosine
S2        0.91   Cross-Encoder
A         0.88   Arch Fit
T         0.84   Type Fit
D        −0.02   Drift Penalty

Divider

Code Preview                               [copy]
┌─────────────────────────────────────────┐
│ IBM Plex Mono 12px                      │
│ bg: teal-light (#c3faf5) for green node │
│ bg: coral-light (#ffc6c6) for red node  │
│ border: 1px solid grade-border          │
│ border-radius: 8px                      │
│ 30 lines max, scrollable                │
└─────────────────────────────────────────┘

AI Summary     Roobert PRO Medium 14px header
               Noto Sans 16px body text #1c1c1e

PageIndex      Roobert PRO Medium 14px header  [micro badge]
               Noto Sans 14px #555a6a italic
```

### 9.2 Red Node → Re-anchor CTA
```css
.btn-reanchor {
  background:    #600000;       /* coral-dark */
  color:         #ffffff;
  font:          Roobert PRO Medium 17.5px, letter-spacing: 0.175px;
  border-radius: 8px;
  padding:       12px 24px;
  width:         100%;
  /* loading: spinner + "Healing..." */
}
.btn-reanchor:hover { background: #800000; }
```

### 9.3 Parent Directory Panel
```
/routes/auth/                              ✕
Roobert PRO Medium 24px / −0.72px spacing

[⚠ REVIEW NEEDED]   Score: 0.52
orange-light bg, yellow-dark text, 50px radius pill

Child Distribution  (Roobert PRO Medium 14px)
2 green  ██████░░░░   teal-light fill
1 yellow ████░░░░░░   orange-light fill
1 red    ██░░░░░░░░   coral-light fill

Flags  (outlined pills, 50px radius)
[HIGH DRIFT]   orange-light bg, yellow-dark border/text
[REVIEW NEEDED] coral-light bg, coral-dark border/text

Riskiest Nodes  (Noto Sans 16px)
payment.js       0.28   [coral chip]
analytics.js     0.41   [coral chip]
webhooks.js      0.61   [orange chip]

[↺ Heal All Red Children]   coral-dark CTA button
```

---

## 10. Interactions

| Action | Behavior |
|---|---|
| Click compound node | Toggle expand/collapse |
| Click leaf node | Open right panel · `#5b76fe` 2px ring on node |
| ESC | Close panel |
| Hover node | Dark tooltip (`#1c1c1e` bg) |
| Zoom/Pan | Scroll + drag, Cytoscape gestures |
| Re-anchor | Coral CTA → spinner → success `#00b473` toast |
| Heal All | Progress counter in button text |
| Disconnect | Toast: `#1c1c1e` bg · "⚡ Reconnecting..." · slide up |

---

## 11. Animations

| Element | Spec |
|---|---|
| Red node | `opacity 1→0.75→1`, 2s ease, infinite |
| Panel open | `translateX(100%)→0`, 250ms ease-out |
| Node appear | `scale(0.95) opacity 0 → 1`, 180ms |
| Score counter | Tick to new value, 600ms |
| Collapse banner | `height 0→40px`, 250ms ease |
| Toast | Slide up + fade, 200ms |
| Skeleton | Shimmer sweep using ring color, 1.5s |
| Selected ring | `#5b76fe` 0→2px ring, 150ms |

---

## 12. Official Token Summary (Quick Reference)

```
Text primary:      #1c1c1e  (--color-near-black)
Text secondary:    #555a6a  (--color-slate)
Text muted:        #a5a8b5  (--color-placeholder)
Background:        #ffffff  (--color-white)
Interactive:       #5b76fe  (--color-blue-450)
Interactive press: #2a41b6  (--color-actionable-pressed)
Success/Green:     #00b473  (--color-success)
Border:            #c7cad5  (--color-border)
Ring:              rgb(224,226,232)
Coral light/dark:  #ffc6c6 / #600000
Teal light/dark:   #c3faf5 / #187574
Orange light:      #ffe6cd
Yellow dark:       #746019
Pink:              #fde0f0

Font display:  Roobert PRO Medium (OpenType: blwf cv03 cv04 cv09 cv11)
Font body:     Noto Sans (OpenType: liga 0, ss01 ss04 ss05)
Font mono:     IBM Plex Mono
Radius scale:  8px · 10–12px · 20–24px · 40–50px
```