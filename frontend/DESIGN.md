# ClearWay Frontend — Design Guide

This document describes the design intentions of the ClearWay Analytics application. When refactoring or adding new UI elements, always follow these rules.

Reference implementations:
- `src/components/FloatingPanel.tsx` — panel on the homepage (map)
- `src/pages/AdminPage.tsx` — controls card on the dashboard

---

## Foundations

### Colours
- **Primary:** `blue-500` (#3b82f6), `blue-600` (#2563eb) for active/hover states
- **Page background:** `bg-gray-50/50`
- **Cards:** `bg-white`
- **Text:** `text-gray-900` (headings), `text-gray-700` (body), `text-gray-500` (labels), `text-gray-400` (placeholders/icons)
- **Borders:** `border-gray-200`, `border-gray-100` (subtle dividers)
- **Errors / critical:** `text-red-500`, `bg-red-50`
- **Success / passable:** `text-green-500` (#22c55e), `bg-green-100`

### Typography
- **Page heading:** `text-2xl font-bold tracking-tight text-gray-900`
- **Section heading inside card:** `text-sm font-semibold` (via `CardTitle`)
- **Label above control:** `text-xs font-semibold text-gray-500 uppercase tracking-wider`
- **Body / values:** `text-sm text-gray-700`
- **KPI primary number:** `text-lg font-bold text-gray-900 leading-tight`
- **KPI supplementary info:** `text-xs text-gray-400` — on the same line as the primary number (`flex items-baseline gap-1.5`)
- **Slider min/max labels:** `text-[10px] text-gray-400`

### Spacing
- **Page padding:** `p-6`
- **Card padding (CardContent):** `p-4`
- **Gap between sections:** `gap-4`
- **Gap within a section:** `gap-2` or `gap-1.5`

---

## Components

### Card
```
rounded-xl border border-gray-200 bg-white shadow-sm
```
- Always `rounded-xl`, never `rounded-md` or `rounded-lg` for cards
- `CardHeader` with `p-4 pb-2`, `CardContent` with `p-4 pt-0`
- Icon in header: `h-4 w-4 text-gray-400 shrink-0`

### Floating panel (absolutely positioned)
```
absolute top-4 left-4 z-[1000]
bg-white p-4 rounded-xl shadow-lg border border-gray-100
w-80 max-w-[90vw]
```

### Label above a control
```tsx
<label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
  Section name
</label>
```

### Input / Select
```
border border-gray-200 rounded-lg text-sm bg-white text-gray-700
focus:outline-none focus:ring-2 focus:ring-blue-500
```
- Select with icon on the right: `appearance-none pl-3 pr-8 py-2` + absolutely positioned icon `pointer-events-none`
- Icon inside select: `ChevronDown` or `CalendarIcon`, `w-4 h-4 text-gray-400`

### Slider
```tsx
<input
  type="range"
  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
/>
```
- Always accompanied by `flex justify-between text-[10px] text-gray-400 mt-1` with min/max labels
- Next to the slider: bordered box with value and unit:
```tsx
<div className="flex items-center border border-gray-200 rounded-lg overflow-hidden shrink-0">
  <span className="w-10 px-2 py-1.5 text-sm text-right text-gray-700">{value}</span>
  <span className="px-2 text-xs text-gray-400 bg-gray-50 border-l border-gray-200 py-1.5 select-none">cm</span>
</div>
```

### Pill toggle (2 options)
```tsx
<div className="flex bg-gray-100 p-1 rounded-lg">
  <button className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
    active ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
  }`}>
    Option A
  </button>
  <button className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
    !active ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
  }`}>
    Option B
  </button>
</div>
```
- Active state: `bg-white text-blue-600 shadow-sm` (white on grey background)
- Inactive: `text-gray-500 hover:text-gray-700`

### Button — primary
```
bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium py-2 px-4
```

### Button — secondary / ghost
```
bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-medium py-2 px-4
```

### Loading overlay (over map or component)
```tsx
<div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/70 backdrop-blur-sm pointer-events-none">
  <div className="flex items-center gap-2 text-gray-600 text-xs font-medium">
    <Loader2 className="animate-spin h-4 w-4 text-blue-500" />
    Loading…
  </div>
</div>
```
- On the main map: centred modal with `bg-white/80 backdrop-blur-md px-8 py-6 rounded-2xl shadow-xl` and a larger spinner `h-10 w-10`

### Loading inline (table, list)
```tsx
<div className="flex items-center justify-center gap-2 p-6 text-sm text-gray-500">
  <Loader2 className="animate-spin h-4 w-4 text-blue-500" />
  Loading…
</div>
```

---

## Maps

### Passability map (main map)
- Passable segments: `#2ecc71` (green)
- Critical segments: `#e74c3c` (red)
- No data: `#aaaaaa` (grey), `weight: 2, opacity: 0.5`
- Passable / critical: `weight: 4, opacity: 0.9`
- Tile layer: CartoDB Voyager

### Coverage heatmap (dashboard)
- Low coverage (≤ 20): `#fde047` (yellow)
- Medium coverage (21–100): `#f97316` (orange)
- High coverage (> 100): `#ef4444` (red)
- Tile layer: CartoDB Light

### Floating map legend
```
absolute top-2 left-2 z-[1000]
bg-white/90 backdrop-blur-sm rounded-lg shadow-md text-xs
```
- Collapsible via `max-height` transition: `transition-all duration-200 ease-in-out`
- Toggle icon: `ChevronUp` / `ChevronDown`, `h-3 w-3 text-gray-400`

---

## Layout

### Map page (fullscreen)
- Map occupies `h-full w-full`, page uses `overflow-hidden`
- Floating panel absolutely positioned over the map `z-[1000]`

### Dashboard page
- Left column `w-1/3`: controls + KPI cards + table (scrollable)
- Right column `flex-1`: map or main visualisation (h-full)
- Bottom section spanning full width below the main content

### Sidebar navigation
- Width `w-64`, `bg-white border-r border-gray-200`
- Active NavLink: `bg-blue-50 text-blue-600`
- Inactive NavLink: `text-gray-600 hover:bg-gray-50 hover:text-gray-900`

---

## Icons

Use exclusively `lucide-react`. Standard sizes:
- In navigation: `w-5 h-5`
- In cards / labels: `h-4 w-4`
- In legend / small UI elements: `h-3 w-3` or `h-3.5 w-3.5`
- Spinner: `animate-spin` + sizes above

---

## What Not to Do

- Do not use `rounded-md` for cards (use `rounded-xl` only)
- Do not use inline `style={}` for colours — always use Tailwind classes or arbitrary values `bg-[#hex]`
- Do not use custom SVG spinners — always use `<Loader2 className="animate-spin" />`
- Do not use red for "high data density" on the heatmap — red means problem/critical state
- Do not wrap supplementary KPI info onto a new line — keep it on the same line as the primary value (`flex items-baseline`)
