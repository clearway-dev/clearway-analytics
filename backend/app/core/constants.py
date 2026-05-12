PASSABILITY_THRESHOLD_M = 3.0
PASSABILITY_THRESHOLD_CM = 300.0

# Maximum distance for assigning a measurement to a road segment.
SNAP_DISTANCE_M = 10
# Degree approximation of SNAP_DISTANCE_M for PostGIS ST_DWithin.
# 1 degree ≈ 111 320 m at the equator; accurate enough for Plzeň (lat ~49.7°).
SNAP_DISTANCE_DEG = SNAP_DISTANCE_M / 111_320.0
