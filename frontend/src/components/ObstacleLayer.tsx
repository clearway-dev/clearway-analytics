import { CircleMarker, Popup } from "react-leaflet";
import type { Feature, Point } from "geojson";

type Severity = "critical" | "high" | "medium";

interface ObstacleProperties {
  severity: Severity;
  cluster_size: number;
  avg_width: number;
}

export type ObstacleFeature = Feature<Point, ObstacleProperties>;

interface ObstacleLayerProps {
  obstacles: ObstacleFeature[];
}

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#d97706",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical obstacle",
  high: "High severity obstacle",
  medium: "Medium severity obstacle",
};

// Base radius + logarithmic growth capped at 24px to avoid covering the map
function markerRadius(clusterSize: number): number {
  return Math.min(8 + Math.log(clusterSize) * 2, 24);
}

export default function ObstacleLayer({ obstacles }: ObstacleLayerProps) {
  return (
    <>
      {obstacles.map((obstacle, index) => {
        // GeoJSON uses [lon, lat], Leaflet uses [lat, lon]
        const [lon, lat] = obstacle.geometry.coordinates;
        const { severity, cluster_size, avg_width } = obstacle.properties;
        const color = SEVERITY_COLOR[severity] ?? "#dc2626";

        return (
          <CircleMarker
            key={`obstacle-${index}`}
            center={[lat, lon]}
            radius={markerRadius(cluster_size)}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.6,
              weight: 2,
            }}
          >
            <Popup>
              <div className="p-1">
                <h3 className="font-bold mb-1" style={{ color }}>
                  ⚠️ {SEVERITY_LABEL[severity]}
                </h3>
                <p className="text-sm text-gray-700 m-0">
                  <span className="font-semibold">Avg. width:</span>{" "}
                  {avg_width.toFixed(1)} m
                </p>
                <p className="text-sm text-gray-700 m-0">
                  <span className="font-semibold">Based on:</span>{" "}
                  {cluster_size} measurements
                </p>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}
