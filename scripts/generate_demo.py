import os
import shutil
from PIL import Image, ImageDraw, ImageFont

# Canvas dimensions
WIDTH = 1280
HEIGHT = 720
FPS = 4
FRAMES_DIR = "/tmp/codexmap_frames"

if os.path.exists(FRAMES_DIR):
    shutil.rmtree(FRAMES_DIR)
os.makedirs(FRAMES_DIR, exist_ok=True)

# Color theme (clean developer dark theme)
BG_COLOR = (15, 23, 42)          # Deep slate #0f172a
PANEL_BG = (30, 41, 59)          # Card slate #1e293b
HEADER_BG = (51, 65, 85)         # Header slate #334155
BORDER_COLOR = (71, 85, 105)     # Hairline border #475569
TEXT_WHITE = (248, 250, 252)     # Ink white #f8fafc
TEXT_MUTED = (148, 163, 184)     # Muted slate #94a3b8
CYAN_ACCENT = (56, 189, 248)     # Info cyan #38bdf8
GREEN_ACCENT = (34, 197, 94)     # Green on-scope #22c55e
YELLOW_ACCENT = (234, 179, 8)    # Yellow review #eab308
RED_ACCENT = (239, 68, 68)       # Red critical #ef4444
BLUE_ACCENT = (99, 102, 241)     # Indigo #6366f1

# Try to load system fonts, fallback to default font
try:
    font_title = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", 22)
    font_header = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", 17)
    font_body = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", 14)
    font_bold = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", 15)
    font_small = ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", 12)
except Exception:
    try:
        font_title = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 22)
        font_header = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 17)
        font_body = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 14)
        font_bold = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 15)
        font_small = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 12)
    except Exception:
        font_title = ImageFont.load_default()
        font_header = ImageFont.load_default()
        font_body = ImageFont.load_default()
        font_bold = ImageFont.load_default()
        font_small = ImageFont.load_default()

def draw_window_frame(draw, title_text):
    # Main background
    draw.rectangle([(0, 0), (WIDTH, HEIGHT)], fill=BG_COLOR)
    
    # Terminal Window Container
    win_x1, win_y1, win_x2, win_y2 = 40, 30, WIDTH - 40, HEIGHT - 30
    draw.rounded_rectangle([(win_x1, win_y1), (win_x2, win_y2)], radius=12, fill=PANEL_BG, outline=BORDER_COLOR, width=1)
    
    # Header bar
    header_h = 44
    draw.rounded_rectangle([(win_x1, win_y1), (win_x2, win_y1 + header_h)], radius=12, fill=HEADER_BG)
    draw.rectangle([(win_x1, win_y1 + header_h - 10), (win_x2, win_y1 + header_h)], fill=HEADER_BG)
    draw.line([(win_x1, win_y1 + header_h), (win_x2, win_y1 + header_h)], fill=BORDER_COLOR, width=1)
    
    # Window controls (red, yellow, green circles)
    draw.ellipse([(win_x1 + 16, win_y1 + 16), (win_x1 + 28, win_y1 + 28)], fill=(239, 68, 68))
    draw.ellipse([(win_x1 + 36, win_y1 + 16), (win_x1 + 48, win_y1 + 28)], fill=(234, 179, 8))
    draw.ellipse([(win_x1 + 56, win_y1 + 16), (win_x1 + 68, win_y1 + 28)], fill=(34, 197, 94))
    
    # Header title
    draw.text((win_x1 + 80, win_y1 + 13), title_text, fill=TEXT_MUTED, font=font_header)
    
    # Status badges on the right of header
    status_text = "STATUS: ACTIVE  |  PORT: 3333  |  ENGINE: GEMINI"
    draw.text((win_x2 - 420, win_y1 + 14), status_text, fill=CYAN_ACCENT, font=font_small)

# Script lines to reveal progressively
timeline = [
    # Frame index, list of (text, color)
    (0, [
        ("$ npx codexmap run \"Build user authentication API\" --engine gemini --auto-heal", TEXT_WHITE),
    ]),
    (4, [
        ("$ npx codexmap run \"Build user authentication API\" --engine gemini --auto-heal", TEXT_WHITE),
        ("[ORCHESTRATOR] Initializing multi-agent daemon session: 20260817-auth-service", TEXT_MUTED),
        ("[CARTOGRAPHER] AST File Watcher active on ./output", CYAN_ACCENT),
        ("[SENTINEL] Scoring engine initialized with 5-component matrix: S1, S2, A, T, D", CYAN_ACCENT),
        ("[HEALER] Closed-loop re-anchor worker active (Re-Anchor Registry: 0% loop risk)", CYAN_ACCENT),
        ("[BROADCASTER] WebSocket telemetry stream listening at ws://127.0.0.1:4242", CYAN_ACCENT),
        ("[SERVER] Dashboard Cockpit listening at http://127.0.0.1:3333", GREEN_ACCENT),
    ]),
    (10, [
        ("$ npx codexmap run \"Build user authentication API\" --engine gemini --auto-heal", TEXT_WHITE),
        ("[ORCHESTRATOR] Initializing multi-agent daemon session: 20260817-auth-service", TEXT_MUTED),
        ("[CARTOGRAPHER] AST File Watcher active on ./output", CYAN_ACCENT),
        ("[SENTINEL] Scoring engine initialized with 5-component matrix: S1, S2, A, T, D", CYAN_ACCENT),
        ("[HEALER] Closed-loop re-anchor worker active (Re-Anchor Registry: 0% loop risk)", CYAN_ACCENT),
        ("[BROADCASTER] WebSocket telemetry stream listening at ws://127.0.0.1:4242", CYAN_ACCENT),
        ("[SERVER] Dashboard Cockpit listening at http://127.0.0.1:3333", GREEN_ACCENT),
        ("", TEXT_MUTED),
        ("[CARTOGRAPHER] Mapped node: src/app.js (file, 45 lines)", TEXT_WHITE),
        ("[CARTOGRAPHER] Mapped node: src/routes/auth.js (file, 62 lines)", TEXT_WHITE),
        ("[CARTOGRAPHER] Mapped node: src/services/authService.js (file, 88 lines)", TEXT_WHITE),
        ("[CARTOGRAPHER] Mapped node: src/utils/crypto.js (file, 34 lines)", TEXT_WHITE),
    ]),
    (16, [
        ("$ npx codexmap run \"Build user authentication API\" --engine gemini --auto-heal", TEXT_WHITE),
        ("[ORCHESTRATOR] Initializing multi-agent daemon session: 20260817-auth-service", TEXT_MUTED),
        ("[CARTOGRAPHER] AST File Watcher active on ./output", CYAN_ACCENT),
        ("[SENTINEL] Scoring engine initialized with 5-component matrix: S1, S2, A, T, D", CYAN_ACCENT),
        ("[BROADCASTER] WebSocket telemetry stream listening at ws://127.0.0.1:4242", CYAN_ACCENT),
        ("", TEXT_MUTED),
        ("[SENTINEL] Evaluated src/app.js          -> ON SCOPE (Score: 0.88)", GREEN_ACCENT),
        ("[SENTINEL] Evaluated src/utils/crypto.js    -> ON SCOPE (Score: 0.84)", GREEN_ACCENT),
        ("[SENTINEL] Evaluated src/routes/auth.js     -> REVIEW   (Score: 0.62)", YELLOW_ACCENT),
        ("[SENTINEL] Evaluated src/services/authService.js -> CRITICAL (Score: 0.38)", RED_ACCENT),
        ("            [Score Breakdown] S1=+0.78  S2=+0.10  A=+0.85  T=+0.45  D=-0.22", TEXT_MUTED),
        ("            [Drift Signals]  - Loose comparison operators (== / !=)", RED_ACCENT),
        ("                            - Missing try-catch on db.query execution", RED_ACCENT),
        ("                            - Vectorless BM25 keyword mismatch", RED_ACCENT),
    ]),
    (24, [
        ("$ npx codexmap run \"Build user authentication API\" --engine gemini --auto-heal", TEXT_WHITE),
        ("[SENTINEL] Evaluated src/services/authService.js -> CRITICAL (Score: 0.38)", RED_ACCENT),
        ("            [Drift Signals] - Loose comparison operators, unhandled DB errors", RED_ACCENT),
        ("", TEXT_MUTED),
        ("[SENTINEL] Auto-heal triggered: node score 0.38 < 0.40 threshold", YELLOW_ACCENT),
        ("[HEALER] Ticket #1 received for src/services/authService.js", CYAN_ACCENT),
        ("[HEALER] Checking Re-Anchor Registry... [PASS: Unique SHA-256 state hash]", GREEN_ACCENT),
        ("[HEALER] Calling Gemini API (gemini-1.5-flash) with scoped AST dependencies...", BLUE_ACCENT),
        ("[HEALER] Gemini returned structured JSON repair payload (1,240 tokens)", BLUE_ACCENT),
        ("[HEALER] Overwrote src/services/authService.js with strict typing and try-catch blocks", TEXT_WHITE),
    ]),
    (32, [
        ("$ npx codexmap run \"Build user authentication API\" --engine gemini --auto-heal", TEXT_WHITE),
        ("[HEALER] Overwrote src/services/authService.js with strict typing and try-catch blocks", TEXT_WHITE),
        ("[CARTOGRAPHER] Detected file write on src/services/authService.js", CYAN_ACCENT),
        ("[SENTINEL] Re-evaluating healed node: src/services/authService.js...", CYAN_ACCENT),
        ("[SENTINEL] Re-scored src/services/authService.js -> ON SCOPE (Score: 0.86)", GREEN_ACCENT),
        ("            [Score Breakdown] S1=+0.88  S2=+0.85  A=+1.00  T=+0.95  D=-0.08", GREEN_ACCENT),
        ("[HEALER] Repair ticket #1 resolved successfully in 1.4s (Attempts: 1/3, Cost: $0.0004)", GREEN_ACCENT),
        ("", TEXT_MUTED),
        ("[BROADCASTER] Broadcasted live state diff to Cytoscape Cockpit (0 red nodes remaining)", CYAN_ACCENT),
        ("[SUMMARY] Session Health: 100% Alignment | 18 nodes active | Zero Context Drift", GREEN_ACCENT),
        ("[DASHBOARD] Cockpit graph fully synchronized at http://127.0.0.1:3333", GREEN_ACCENT),
    ]),
]

total_frames = 48  # 12 seconds at 4 fps
current_text_index = 0

for f in range(total_frames):
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)
    
    draw_window_frame(draw, "CodexMap Telemetry Cockpit — Auto-Heal Daemon")
    
    # Find appropriate text block
    active_lines = timeline[0][1]
    for start_f, lines in timeline:
        if f >= start_f:
            active_lines = lines
            
    # Draw terminal text lines
    start_y = 95
    line_height = 24
    for line, color in active_lines:
        draw.text((65, start_y), line, fill=color, font=font_body)
        start_y += line_height
        
    # Draw bottom telemetry summary bar inside terminal
    bar_y1 = HEIGHT - 75
    draw.rectangle([(55, bar_y1), (WIDTH - 55, bar_y1 + 35)], fill=(20, 28, 45), outline=BORDER_COLOR)
    
    # Bottom telemetry stats
    stat_align = "ALIGNMENT: 100%" if f >= 32 else ("ALIGNMENT: 64%" if f >= 16 else "ALIGNMENT: SYNCING")
    stat_color = GREEN_ACCENT if f >= 32 else (YELLOW_ACCENT if f >= 16 else CYAN_ACCENT)
    
    draw.text((70, bar_y1 + 9), stat_align, fill=stat_color, font=font_bold)
    draw.text((290, bar_y1 + 9), "NODES: 18", fill=TEXT_MUTED, font=font_body)
    draw.text((430, bar_y1 + 9), "HEALED: 1/1" if f >= 32 else "HEALED: 0/1", fill=TEXT_MUTED, font=font_body)
    draw.text((580, bar_y1 + 9), "LOOP RISK: 0%", fill=GREEN_ACCENT, font=font_body)
    draw.text((750, bar_y1 + 9), "COST: $0.0004" if f >= 24 else "COST: $0.0000", fill=TEXT_MUTED, font=font_body)
    draw.text((950, bar_y1 + 9), "WEBCLIENT: CONNECTED", fill=CYAN_ACCENT, font=font_body)
    
    frame_path = os.path.join(FRAMES_DIR, f"frame_{f:04d}.png")
    img.save(frame_path)

print(f"Generated {total_frames} frames in {FRAMES_DIR}")
