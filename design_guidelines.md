# Design Guidelines: Bulk WHOIS Domain Lookup Tool

## Design Approach
**System**: Material Design-inspired utility interface
**Rationale**: Data-heavy productivity tool requiring clarity, efficiency, and real-time updates. Focus on functional hierarchy over aesthetic decoration.

## Layout System
- **Spacing Units**: Tailwind spacing of 2, 4, 6, and 8 (p-4, gap-6, m-8)
- **Container**: Single-column layout, max-w-6xl centered with px-4
- **Sections**: Compact vertical stacking with minimal padding (py-4 to py-8)

## Typography
- **Headings**: font-semibold for tool title (text-2xl), section headers (text-lg)
- **Body**: font-normal for instructions, labels (text-sm), results (text-base)
- **Data Display**: font-mono for domain names and technical data
- **Hierarchy**: Emphasize data over decoration

## Core Components

**Input Section** (Top of page):
- Large textarea for bulk domain entry (h-40, rounded-lg border)
- Clear placeholder: "Enter domain names (one per line)"
- Action buttons row: "Start Search" (primary), "Clear" (secondary), aligned right
- Domain counter: "X domains ready" below textarea

**Results Section** (Real-time updating):
- Progress indicator: "Searching... X of Y domains processed"
- Live-updating table with columns: Domain, Status (checking/found/error), Expires On, Registrar, Email
- Alternating row backgrounds for readability
- Status indicators: Animated pulse for "checking", success/error badges
- Empty state: "Results will appear here as domains are processed"

**Action Bar** (Sticky above results):
- "Download CSV" button (only enabled when results exist)
- Results summary: "Found X domains | Y complete"
- "Clear Results" option

**Table Design**:
- Fixed header row (sticky on scroll)
- Responsive: Stack columns on mobile (card-style)
- Monospace font for domain names
- Compact padding (p-2 to p-3)
- Border between rows, rounded outer corners

## Component Library
- **Buttons**: Rounded (rounded-lg), padding (px-6 py-3), distinct primary/secondary
- **Forms**: Outlined inputs, focus states with ring, clear labels above fields
- **Table**: Striped rows, hover states on rows, fixed header
- **Status Badges**: Small (px-2 py-1), rounded-full, distinct colors per state
- **Loading States**: Spinner icons, pulse animations for processing rows

## Animations
- Minimal: Row fade-in as results arrive, subtle pulse on "searching" status
- NO hero animations, focus on functional feedback only

## Page Structure
1. Tool header with title and brief instruction
2. Domain input section (textarea + controls)
3. Live results table (appears when search starts)
4. Download action (appears when results exist)

## Images
**No images required** - This is a pure utility tool focused on data display and processing efficiency.