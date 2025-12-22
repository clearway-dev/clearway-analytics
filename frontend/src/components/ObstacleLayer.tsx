import { CircleMarker, Popup } from "react-leaflet";
import type { Feature, Point } from "geojson";

interface ObstacleProperties {
  severity: string;
  cluster_size: number;
}

// GeoJSON Feature for a Point
export type ObstacleFeature = Feature<Point, ObstacleProperties>;

interface ObstacleLayerProps {
  obstacles: ObstacleFeature[];
}

export default function ObstacleLayer({ obstacles }: ObstacleLayerProps) {
  return (
    <>
      {obstacles.map((obstacle, index) => {
        // GeoJSON uses [lon, lat], Leaflet uses [lat, lon]
        const [lon, lat] = obstacle.geometry.coordinates;

        return (
          <CircleMarker
            key={`obstacle-${index}`}
            center={[lat, lon]}
            radius={10}
            pathOptions={{
              color: "#ef4444",
              fillColor: "#ef4444",
              fillOpacity: 0.6,
              weight: 2,
            }}
          >
            <Popup>
              <div className="p-1">
                <h3 className="font-bold text-red-600 mb-1">
                  ⚠️ Critical Obstacle detected
                </h3>
                <p className="text-sm text-gray-700 m-0">
                  <span className="font-semibold">Severity:</span>{" "}
                  {obstacle.properties.severity}
                </p>
                <p className="text-sm text-gray-700 m-0">
                  <span className="font-semibold">Cluster size:</span>{" "}
                  {obstacle.properties.cluster_size} points
                </p>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}
