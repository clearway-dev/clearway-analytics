# Routing Algorithm Comparison: Dijkstra vs. A*

In the context of **ClearWay Analytics**, we are evaluating the switch from the current Dijkstra implementation to the A* (A-Star) algorithm for navigation.

## 1. Overview

| Feature | Dijkstra's Algorithm | A* (A-Star) Algorithm |
| :--- | :--- | :--- |
| **Approach** | Breadth-first search; explores all directions equally. | Best-first search; uses a heuristic to guide the search. |
| **Optimality** | Guaranteed to find the absolute shortest path. | Guaranteed to find the shortest path (with an admissible heuristic). |
| **Efficiency** | Can be slow on large networks as it explores many "useless" nodes. | Significantly faster in most cases as it focuses on the destination. |
| **Complexity** | Simple, requires only edge costs (distance/time). | Requires edge costs plus vertex coordinates (x, y) for heuristics. |

## 2. Use Case Analysis: ClearWay Analytics

### Current State (Dijkstra)
- **Implementation:** `pgr_dijkstra` via pgRouting.
- **Constraints:** We use a high cost penalty (`9999999`) for roads narrower than the vehicle width.
- **Performance:** For small to medium urban areas, Dijkstra is instantaneous. However, as we scale to national road networks, the search space grows quadratically.

### Proposed State (A*)
- **Implementation:** `pgr_astar` via pgRouting.
- **Heuristic:** Usually Euclidean distance ("as the crow flies") from the current node to the destination.
- **Benefit:** For long-distance routing (e.g., across multiple cities), A* will explore significantly fewer segments that lead away from the target, reducing database load and response time.

## 3. Impact on Requirements

To implement A*, we must enrich our data model. Specifically, pgRouting's `pgr_astar` requires the `(x, y)` coordinates for the start and end of every road segment to be available in the query.

| Requirement | Dijkstra | A* |
| :--- | :--- | :--- |
| **Source/Target IDs** | Required | Required |
| **Cost (Distance)** | Required | Required |
| **Vertex Coordinates** | Not Required | **Required (x1, y1, x2, y2)** |

## 4. Conclusion & Recommendation

**Recommendation: Stick with Dijkstra for now, plan for A* during scale-up.**

- **Why stay?** Our current urban datasets are likely small enough that Dijkstra's overhead is negligible (< 50ms). Dijkstra is also slightly more robust when dealing with complex cost functions (like our width penalties) because it doesn't rely on spatial assumptions.
- **When to switch?** If routing requests start exceeding 200-300ms or if the road network expands to cover entire regions/countries.

---

### Implementation Steps for A*
1.  **Data Schema:** Add `x1, y1, x2, y2` columns to the `road_segments` table.
2.  **Data Sync:** Update `scripts/setup_routing.py` to extract these coordinates from the `geom` column using PostGIS functions (`ST_X(ST_StartPoint(...))`, etc.).
3.  **API Change:** Update the SQL in `backend/app/api/endpoints/routing.py` to select these new columns and call `pgr_astar`.
