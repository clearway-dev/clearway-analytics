# ClearWay Analytics — Frontend

React web application for road passability visualisation, vehicle and emergency station management, and route planning.

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | React 19.2 |
| Build | Vite 7.2 + TypeScript 5.9 |
| Maps | Leaflet 1.9 + react-leaflet 5.0 |
| Charts | Recharts 3.5 |
| HTTP | Axios 1.13 |
| Routing | React Router 7.11 |
| Dates | date-fns 3.6 |
| Styles | Tailwind CSS 3.4 |
| Icons | Lucide React 0.562 |

---

## Project Structure

```
frontend/src/
├── App.tsx                      # Router, layout, protected routes
├── main.tsx                     # Application entry point
├── contexts/
│   └── AuthContext.tsx          # JWT auth state and methods
├── lib/
│   └── api.ts                   # Axios instance with auth interceptors
├── services/
│   └── api.ts                   # API wrapper functions (single source of truth)
├── pages/
│   ├── LoginPage.tsx            # Login form
│   ├── MapPage.tsx              # Main interactive map
│   ├── DashboardPage.tsx        # Admin KPI dashboard
│   ├── VehiclesPage.tsx         # Target vehicle management
│   ├── StationsPage.tsx         # Emergency station management
│   ├── ExportPage.tsx           # Data export (GeoJSON / Shapefile / CSV)
│   └── UsersPage.tsx            # User management [Admin]
└── components/
    ├── MapComponent.tsx          # Leaflet map, bbox loader, segment colouring
    ├── FloatingPanel.tsx         # Search, date filter, vehicle width
    ├── SegmentPanel.tsx          # Clicked segment detail
    ├── WidthHistogram.tsx        # Width distribution bar chart
    ├── ObstacleLayer.tsx         # DBSCAN obstacle cluster layer
    ├── CoverageMap.tsx           # GeoJSON coverage heatmap
    ├── RoadNetworkMap.tsx        # Standalone road network map
    ├── StationMapPicker.tsx      # Interactive station location picker
    └── vehicles/
        └── AIImportModal.tsx     # AI vehicle import from PDF/TXT (Gemini)
```

---

## Running

### Docker (recommended)

```bash
# From the project root
docker-compose up --build
# Application: http://localhost:5173
```

### Locally

```bash
npm install
npm run dev        # dev server: http://localhost:5173
npm run build      # TypeScript check + production build to dist/
npm run lint       # ESLint
npm run preview    # Preview production build
```

---

## Pages and Features

### Login (`/login`)

Entry form for JWT authentication. After login the token is stored in `localStorage` and restored on the next application load.

---

### Passability Map (`/`)

The main interactive view. Displays road segments coloured by passability status.

**Controls:**
- Zoom to at least level 14 — segments load automatically for the visible area
- Click a segment → opens a detail panel with width histogram
- Filters (floating panel):
  - **Search** — address or street name (Nominatim)
  - **Date** — select from days with available statistics; defaults to the latest
  - **Vehicle width** — slider 50–500 cm, step 10 cm
- Obstacles — DBSCAN clusters of narrow measurements displayed as points
- **Route planning** — click the route icon → click start point → click end point → route is displayed

**Segment colour coding:**
| Colour | Status | Condition |
|--------|--------|-----------|
| Green | Passable | `avg_width >= 3.0 m` |
| Red | Narrow | `avg_width < 3.0 m` |
| Grey | No data | no measurements |

---

### Dashboard (`/dashboard`)

Road network status overview for administrators.

**Elements:**
- KPI cards: total segments, network length (km), coverage (%), critical segments, measurement count
- Anomaly table — 10 narrowest segments
- Coverage heatmap — measurement density on the network
- Date and vehicle width filters

---

### Vehicles (`/vehicles`)

CRUD management of target emergency vehicles.

**Vehicle fields:**

| Field | Description | Unit |
|-------|-------------|------|
| Name | Vehicle identifier | — |
| Category | fire / ambulance / police / rescue / other | — |
| Width | Vehicle width | m (stored as cm) |
| Height | Vehicle height | m (stored as cm) |
| Weight | Total weight | t |
| Length | Vehicle length | m (stored as cm) |
| Track turning diameter | Turning diameter (track) | m (stored as cm) |
| Turning diameter with clearance | Turning diameter with safety clearance | m (stored as cm) |
| Width with stabilisers | Maximum width with stabilisers deployed | m (stored as cm) |

**AI import:**
Click "Import from document" → upload a PDF or TXT file with vehicle technical specifications → Gemini API extracts the vehicles → review the preview table → confirm import.

> Requires admin role.

---

### Stations (`/stations`)

CRUD management of emergency stations.

**Station types:** fire / police / hospital / rescue

Location can be entered manually (lat/lon) or by clicking on the map in the "Pick on map" dialog.

> Editing and deletion require admin role.

---

### Data Export (`/export`)

Download road network data in GIS formats.

**Export modes:**

| Mode | Description |
|------|-------------|
| Single day | Statistics for a selected date |
| Date range | Aggregate between two dates |
| All data | All available data |

**Formats:**

| Format | Extension | Includes geometry |
|--------|-----------|-------------------|
| GeoJSON | `.geojson` | Yes |
| Shapefile | `.zip` (.shp/.shx/.dbf/.prj/.cpg) | Yes |
| CSV | `.csv` | No |

A preview of the segment count and date range is shown before downloading.

---

### Users (`/users`) — admin only

User account management. Cannot delete own account.

**Roles:**
- `admin` — full access
- `dispatcher` — read access, routing, no editing

---

### Road Network (`/network`)

Standalone view of all road segments without statistics. Used to verify the coverage of imported OSM data.

---

## Frontend Architecture

### Authentication (`contexts/AuthContext.tsx`)

Global auth state available via `useAuth()`:

```typescript
const { user, isAuthenticated, isAdmin, login, logout } = useAuth();
```

- `login(email, password)` — OAuth2 token flow → stores JWT → fetches user profile
- `logout()` — clears localStorage and state
- On application start, the token is restored from `localStorage` and validated with a request to `/api/auth/users/me`
- `401` response → automatic logout and redirect to `/login`

### HTTP Client (`lib/api.ts`)

Axios instance with:
- `baseURL` from `VITE_API_URL`
- Request interceptor: attaches `Authorization: Bearer <token>`
- Response interceptor: `401` → clears token + redirects to `/login`

```typescript
import apiClient from "@/lib/api";
const { data } = await apiClient.get("/api/vehicles");
```

### API Services (`services/api.ts`)

Centralised wrapper functions — all API communication goes through this file:

```typescript
import { fetchAvailableDates, fetchObstacles, downloadSegmentExport } from "@/services/api";
```

Available functions:
- `fetchSessions(targetDate)` — data-collection sessions for a date
- `fetchObstacles(targetDate)` — DBSCAN obstacle clusters
- `fetchAvailableDates()` — available dates
- `fetchExportPreview(mode, ...)` — segment count for export
- `downloadSegmentExport(format, mode, ...)` — download export file

### Protected Routes

```tsx
// Requires authentication
<ProtectedRoute>
  <MapPage />
</ProtectedRoute>

// Requires admin role
<ProtectedRoute requiredRole="admin">
  <UsersPage />
</ProtectedRoute>
```

---

## Key Implementation Details

### Map Segment Loading (Bbox Loader)

`MapComponent` loads segments lazily — only the visible area, minimum zoom level 14:
- `onMoveEnd` / `onZoomEnd` → `GET /api/maps/bbox` with the current bounding box
- Returns a GeoJSON FeatureCollection rendered via `react-leaflet GeoJSON`

### Coordinates

- API returns GeoJSON in `[lon, lat]` order (WGS-84 standard)
- Leaflet expects `[lat, lon]` — conversion is handled in frontend components

### Width Histogram

`WidthHistogram` displays the distribution of measured widths as a bar chart:
- 40 bins × 25 cm (range 0–1000 cm)
- Data from `GET /api/stats/segment/{id}/histogram`
- Implemented with Recharts `BarChart`

### AI Vehicle Import

`AIImportModal` flow:
1. User uploads a PDF or TXT file
2. `POST /api/ai/parse-vehicle-file` → Gemini API extracts a JSON array of vehicles
3. A preview table is shown with editable fields
4. On confirmation, each vehicle is inserted via `POST /api/vehicles`

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend URL | `http://localhost:8000` |

Set in `.env` at the project root (or in `frontend/.env.local` for a local override).

---

## Production Build

```bash
npm run build
# Output in dist/ — static files served by nginx
```

In production the frontend is served by an nginx container with an SPA routing rule:
```nginx
try_files $uri $uri/ /index.html;
```
