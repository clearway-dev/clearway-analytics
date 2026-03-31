# ClearWay MCP Server

The MCP server exposes the ClearWay analytics platform as a set of tools callable by Claude and other LLM clients. It runs on [FastMCP](https://github.com/jlowin/fastmcp) via SSE transport.

## Connection

| Environment | URL |
|---|---|
| Production | `https://api.clearway.zephyron.tech/mcp/sse` |
| Local dev | `http://localhost:8001/sse` |

**Claude Code config** (`~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "clearway-prod": {
      "type": "sse",
      "url": "https://api.clearway.zephyron.tech/mcp/sse"
    }
  }
}
```

**Start locally:**
```bash
fastmcp run app/mcp/server.py:mcp --transport sse --port 8001
```

---

## Tools

Tools are grouped by intended audience. All tools are read-only except `create_vehicle` and `recalculate_daily_stats`.

### Developer

#### `describe_schema()`
Returns the full database schema — every table with columns, data types, nullable flag, primary key, and foreign key references. Use this before writing SQL queries.

**Returns:** `[{ table, columns: [{ name, type, nullable, primary_key, foreign_key }] }]`

---

#### `run_read_only_sql(query)`
Executes an arbitrary `SELECT` query against the database. Blocks `DROP`, `DELETE`, `INSERT`, `UPDATE`, `TRUNCATE`.

| Param | Type | Description |
|---|---|---|
| `query` | `str` | A valid SELECT statement |

**Returns:** `[{ column: value, ... }]` — datetimes serialised as ISO strings.

---

### Analyst

#### `get_available_dates()`
Returns all dates that have computed segment statistics, newest first. Call this before any date-scoped query.

**Returns:** `["2026-03-31", "2026-03-30", ...]`

---

#### `get_passability_stats(target_date?, vehicle_width_cm?)`
Network-wide KPI summary for a given date and vehicle width threshold.

| Param | Type | Default | Description |
|---|---|---|---|
| `target_date` | `str \| null` | latest available | Date in `YYYY-MM-DD` format |
| `vehicle_width_cm` | `float` | `300.0` | Width threshold for flagging critical segments |

**Returns:**
```json
{
  "total_segments": 4823,
  "total_length_km": 312.4,
  "total_measurements": 192840,
  "measured_segments_count": 1203,
  "coverage_percentage": 24.9,
  "measurements_on_date": 8450,
  "measured_segments_on_date": 310,
  "coverage_on_date": 6.4,
  "critical_segments_count": 47,
  "anomalies": [{ "id", "name", "min_width", "avg_width", "lat", "lon", "date" }]
}
```

---

#### `get_segment_detail(segment_id)`
Full detail for a single road segment — measurement history by date and a width distribution histogram.

| Param | Type | Description |
|---|---|---|
| `segment_id` | `str` | UUID of the road segment |

**Returns:**
```json
{
  "id": "...",
  "name": "Přemyslova",
  "osm_id": "123456",
  "road_type": "residential",
  "history": [
    { "date": "2026-03-31", "avg_width": 412, "min_width": 310, "max_width": 520,
      "measurements_count": 14, "passable_300cm": true }
  ],
  "histogram": [{ "range": "300-325", "count": 3, "min": 300 }]
}
```

---

#### `get_temporal_trends(from_date, to_date, vehicle_width_cm?)`
Day-by-day network statistics between two dates. Useful for identifying coverage and passability trends.

| Param | Type | Default | Description |
|---|---|---|---|
| `from_date` | `str` | — | Start date `YYYY-MM-DD` (inclusive) |
| `to_date` | `str` | — | End date `YYYY-MM-DD` (inclusive) |
| `vehicle_width_cm` | `float` | `300.0` | Width threshold for critical segment count |

**Returns:** `[{ date, measured_segments, network_avg_width_cm, critical_count, total_measurements }]`

---

#### `get_data_quality_report(target_date?)`
Quality score statistics for cleaned measurements. Helps assess sensor data reliability.

| Param | Type | Default | Description |
|---|---|---|---|
| `target_date` | `str \| null` | all-time | Date in `YYYY-MM-DD` format |

**Returns:**
```json
{
  "date": "2026-03-31",
  "total_measurements": 9468,
  "avg_quality_score": 0.9,
  "min_quality_score": 0.9,
  "percentiles": { "p25": 0.9, "p50": 0.9, "p75": 0.9 },
  "high_quality_count": 9468,
  "low_quality_count": 0,
  "high_quality_pct": 100.0,
  "low_quality_pct": 0.0
}
```

---

### Dispatch / Operator

#### `get_vehicles()`
Lists all registered target vehicles (emergency service vehicles) with their physical dimensions.

**Returns:** `[{ id, name, category, width, height, weight, length, turning_diameter_track, turning_diameter_clearance, stabilization_width, created_at }]`

All widths/lengths in **centimetres**, weight in **tonnes**.

---

#### `get_stations()`
Lists all emergency dispatch stations (fire, police, ambulance) with coordinates.

**Returns:** `[{ id, name, type, address, lat, lon, notes, created_at }]`

---

#### `check_vehicle_passability(vehicle_id, target_date?)`
Checks whether a registered vehicle can pass through the measured road network. Uses the vehicle's effective width (max of `width` and `stabilization_width`).

| Param | Type | Default | Description |
|---|---|---|---|
| `vehicle_id` | `str` | — | UUID from `get_vehicles()` |
| `target_date` | `str \| null` | latest available | Date in `YYYY-MM-DD` |

**Returns:**
```json
{
  "vehicle": { "id", "name", "category", "width_cm": 255, "effective_width_cm": 255 },
  "date": "2026-03-31",
  "verdict": "blocked",
  "critical_segments_count": 3,
  "blocked_segments": [{ "id", "name", "min_width", "avg_width", "lat", "lon" }]
}
```

`verdict` is one of: `"passable"` · `"blocked"` · `"data_unavailable"`

---

#### `get_obstacles(target_date?, min_lat?, min_lon?, max_lat?, max_lon?)`
Returns pre-computed DBSCAN obstacle clusters (narrow-point detections).

| Param | Type | Default | Description |
|---|---|---|---|
| `target_date` | `str \| null` | latest with data | Date in `YYYY-MM-DD` |
| `min_lat/lon`, `max_lat/lon` | `float \| null` | unbounded | Optional bounding box |

**Returns:** `[{ lat, lon, severity, cluster_size, avg_width, min_width }]`

`severity` is one of: `"critical"` (< 2 m) · `"high"` (2–2.5 m) · `"medium"` (> 2.5 m)

---

#### `get_road_features_in_bbox(min_lat, min_lon, max_lat, max_lon, target_date?, include_stats?)`
Road segments within a bounding box, optionally with passability statistics.

| Param | Type | Default | Description |
|---|---|---|---|
| `min_lat/lon`, `max_lat/lon` | `float` | — | Bounding box in WGS-84 |
| `target_date` | `str \| null` | latest per segment | Date in `YYYY-MM-DD` |
| `include_stats` | `bool` | `true` | Attach passability stats to each feature |

**Returns:** GeoJSON Feature list (max 100), each with `avg_width`, `min_width`, `measurements_count`, `status` (`ok` / `narrow` / `no_data`).

---

#### `find_passable_route(start_lat, start_lon, end_lat, end_lon, vehicle_width_cm?, target_date?)`
Finds the shortest passable route between two coordinates using pgRouting. Roads narrower than `vehicle_width_cm` are penalised and avoided.

| Param | Type | Default | Description |
|---|---|---|---|
| `start_lat/lon` | `float` | — | Route start (WGS-84) |
| `end_lat/lon` | `float` | — | Route end (WGS-84) |
| `vehicle_width_cm` | `float` | `300.0` | Width threshold in centimetres |
| `target_date` | `str \| null` | latest available | Date in `YYYY-MM-DD` |

**Returns:**
```json
{
  "status": "ok",
  "total_distance_m": 1842,
  "segment_count": 12,
  "vehicle_width_cm": 255.0,
  "date": "2026-03-31",
  "route_segments": [
    { "seq": 1, "name": "Přemyslova", "avg_width_cm": 412, "passable": true, "cost_m": 145.2 }
  ],
  "warnings": ["2 segment(s) have no width measurements — passability unknown."]
}
```

`status` is one of: `"ok"` · `"no_route"` · `"topology_unavailable"` · `"error"`

---

### Admin

#### `create_vehicle(name, category?, width?, height?, weight?, length?, turning_diameter_track?, turning_diameter_clearance?, stabilization_width?)`
Inserts a new target vehicle into the database.

| Param | Type | Unit |
|---|---|---|
| `name` | `str` (required) | — |
| `category` | `str` | — |
| `width`, `height`, `length` | `int` | centimetres |
| `weight` | `float` | tonnes |
| `turning_diameter_track`, `turning_diameter_clearance`, `stabilization_width` | `int` | centimetres |

**Returns:** Full vehicle record including generated `id`.

#### `recalculate_daily_stats(target_date, force?)`
Deletes and recomputes segment statistics for the given date.

| Param | Type | Default | Description |
|---|---|---|---|
| `target_date` | `str` | — | Date in `YYYY-MM-DD` |
| `force` | `bool` | `false` | Must be `true` to overwrite existing statistics |

**Returns:** `{ status, date, processed_segments, average_network_width_cm, total_measurements_processed }`

---

## Passability Threshold

The default critical threshold is **300 cm (3.0 m)**. Segments with `avg_width < 300 cm` are flagged as critical. This threshold can be overridden per-call via `vehicle_width_cm`.

## Notes

- All tools are publicly accessible — no authentication layer on the MCP server.
- Width values in the database are stored in **centimetres**.
- Coordinates follow **WGS-84 (EPSG:4326)**: `[longitude, latitude]` in GeoJSON, `lat`/`lon` as separate fields elsewhere.
- `find_passable_route` requires the pgRouting topology to be initialised (`make setup-routing` in `clearway-infra`).
