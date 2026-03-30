# ClearWay Frontend — Design Guide

Tento dokument popisuje design intention aplikace ClearWay Analytics. Při refaktorování nebo přidávání nových UI prvků vždy vycházej z těchto pravidel.

Referenční implementace:
- `src/components/FloatingPanel.tsx` — panel na homepage (mapa)
- `src/pages/AdminPage.tsx` — controls karta na dashboardu

---

## Foundations

### Barvy
- **Primární:** `blue-500` (#3b82f6), `blue-600` (#2563eb) pro aktivní/hover stavy
- **Pozadí stránky:** `bg-gray-50/50`
- **Karty:** `bg-white`
- **Texty:** `text-gray-900` (nadpisy), `text-gray-700` (tělo), `text-gray-500` (popisky), `text-gray-400` (placeholder/ikony)
- **Hranice:** `border-gray-200`, `border-gray-100` (subtilnější dělítka)
- **Chyby / kritické:** `text-red-500`, `bg-red-50`
- **Úspěch / průjezdné:** `text-green-500` (#22c55e), `bg-green-100`

### Typografie
- **Nadpis stránky:** `text-2xl font-bold tracking-tight text-gray-900`
- **Nadpis sekce v kartě:** `text-sm font-semibold` (přes `CardTitle`)
- **Label nad ovládacím prvkem:** `text-xs font-semibold text-gray-500 uppercase tracking-wider`
- **Tělo / hodnoty:** `text-sm text-gray-700`
- **KPI hlavní číslo:** `text-lg font-bold text-gray-900 leading-tight`
- **KPI doplňující info:** `text-xs text-gray-400` — na stejném řádku jako hlavní číslo (`flex items-baseline gap-1.5`)
- **Min/max popisky slideru:** `text-[10px] text-gray-400`

### Mezery
- **Padding stránky:** `p-6`
- **Padding karty (CardContent):** `p-4`
- **Gap mezi sekcemi:** `gap-4`
- **Gap uvnitř sekce:** `gap-2` nebo `gap-1.5`

---

## Komponenty

### Karta (Card)
```
rounded-xl border border-gray-200 bg-white shadow-sm
```
- Vždy `rounded-xl`, nikdy `rounded-md` nebo `rounded-lg` pro karty
- `CardHeader` s `p-4 pb-2`, `CardContent` s `p-4 pt-0`
- Ikona v headeru: `h-4 w-4 text-gray-400 shrink-0`

### Floating panel (absolutně pozicovaný)
```
absolute top-4 left-4 z-[1000]
bg-white p-4 rounded-xl shadow-lg border border-gray-100
w-80 max-w-[90vw]
```

### Label nad ovládacím prvkem
```tsx
<label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
  Název sekce
</label>
```

### Input / Select
```
border border-gray-200 rounded-lg text-sm bg-white text-gray-700
focus:outline-none focus:ring-2 focus:ring-blue-500
```
- Select s ikonou vpravo: `appearance-none pl-3 pr-8 py-2` + absolutně pozicovaná ikona `pointer-events-none`
- Ikona v selectu: `ChevronDown` nebo `CalendarIcon`, `w-4 h-4 text-gray-400`

### Slider
```tsx
<input
  type="range"
  className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
/>
```
- Vždy doprovázet `flex justify-between text-[10px] text-gray-400 mt-1` s min/max popisky
- Vedle slideru: bordered box s hodnotou a jednotkou:
```tsx
<div className="flex items-center border border-gray-200 rounded-lg overflow-hidden shrink-0">
  <span className="w-10 px-2 py-1.5 text-sm text-right text-gray-700">{value}</span>
  <span className="px-2 text-xs text-gray-400 bg-gray-50 border-l border-gray-200 py-1.5 select-none">cm</span>
</div>
```

### Pill toggle (2 možnosti)
```tsx
<div className="flex bg-gray-100 p-1 rounded-lg">
  <button className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
    active ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
  }`}>
    Možnost A
  </button>
  <button className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
    !active ? "bg-white text-blue-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
  }`}>
    Možnost B
  </button>
</div>
```
- Aktivní stav: `bg-white text-blue-600 shadow-sm` (bílá na šedém pozadí)
- Neaktivní: `text-gray-500 hover:text-gray-700`

### Tlačítko — primární
```
bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium py-2 px-4
```

### Tlačítko — sekundární / ghost
```
bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-medium py-2 px-4
```

### Loading overlay (přes mapu nebo komponentu)
```tsx
<div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/70 backdrop-blur-sm pointer-events-none">
  <div className="flex items-center gap-2 text-gray-600 text-xs font-medium">
    <Loader2 className="animate-spin h-4 w-4 text-blue-500" />
    Načítám…
  </div>
</div>
```
- Na hlavní mapě: centrovaný modal s `bg-white/80 backdrop-blur-md px-8 py-6 rounded-2xl shadow-xl` a větším spinnerem `h-10 w-10`

### Loading inline (tabulka, seznam)
```tsx
<div className="flex items-center justify-center gap-2 p-6 text-sm text-gray-500">
  <Loader2 className="animate-spin h-4 w-4 text-blue-500" />
  Načítám…
</div>
```

---

## Mapy

### Passability mapa (hlavní mapa)
- Průjezdné segmenty: `#2ecc71` (zelená)
- Kritické segmenty: `#e74c3c` (červená)
- Bez dat: `#aaaaaa` (šedá), `weight: 2, opacity: 0.5`
- Průjezdné / kritické: `weight: 4, opacity: 0.9`
- Tile layer: CartoDB Voyager

### Coverage heatmapa (dashboard)
- Nízké pokrytí (≤ 20): `#fde047` (žlutá)
- Střední pokrytí (21–100): `#f97316` (oranžová)
- Vysoké pokrytí (> 100): `#ef4444` (červená)
- Tile layer: CartoDB Light

### Floating legenda na mapě
```
absolute top-2 left-2 z-[1000]
bg-white/90 backdrop-blur-sm rounded-lg shadow-md text-xs
```
- Collapsible přes `max-height` transition: `transition-all duration-200 ease-in-out`
- Toggle ikona: `ChevronUp` / `ChevronDown`, `h-3 w-3 text-gray-400`

---

## Layout

### Stránka s mapou (fullscreen)
- Mapa zabírá `h-full w-full`, stránka `overflow-hidden`
- Floating panel absolutně pozicovaný nad mapou `z-[1000]`

### Dashboard stránka
- Levý sloupec `w-1/3`: controls + KPI karty + tabulka (scrollable)
- Pravý sloupec `flex-1`: mapa nebo hlavní vizualizace (h-full)
- Spodní sekce přes celou šířku pod hlavním obsahem

### Sidebar navigace
- Šířka `w-64`, `bg-white border-r border-gray-200`
- NavLink aktivní: `bg-blue-50 text-blue-600`
- NavLink neaktivní: `text-gray-600 hover:bg-gray-50 hover:text-gray-900`

---

## Ikony

Používáme výhradně `lucide-react`. Standardní velikosti:
- V navigaci: `w-5 h-5`
- V kartách / labelech: `h-4 w-4`
- V legendě / malé UI prvky: `h-3 w-3` nebo `h-3.5 w-3.5`
- Spinner: `animate-spin` + výše uvedené velikosti

---

## Co nedělat

- Nepoužívat `rounded-md` pro karty (pouze `rounded-xl`)
- Nepoužívat inline `style={}` pro barvy — vždy Tailwind třídy nebo Tailwind arbitrary values `bg-[#hex]`
- Nepoužívat vlastní SVG spinnery — vždy `<Loader2 className="animate-spin" />`
- Nepoužívat červenou pro "hodně dat" na heatmapě — červená = problém/kritický stav
- Neskládat doplňující KPI info na nový řádek — dát na stejný řádek jako hlavní hodnotu (`flex items-baseline`)
