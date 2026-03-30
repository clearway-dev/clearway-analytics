import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { Feature, Point } from "geojson";

type Severity = "critical" | "high" | "medium";

interface ObstacleProperties {
  severity: Severity;
  cluster_size: number;
  avg_width: number;
  min_width: number;
}

export type ObstacleFeature = Feature<Point, ObstacleProperties>;

interface ObstacleLayerProps {
  obstacles: ObstacleFeature[];
}

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: "#dc2626",
  high:     "#ea580c",
  medium:   "#d97706",
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Kritická překážka",
  high:     "Závažná překážka",
  medium:   "Střední překážka",
};

const SEVERITY_DESC: Record<Severity, string> = {
  critical: "průměrná šířka pod 2 m",
  high:     "průměrná šířka 2–2,5 m",
  medium:   "průměrná šířka 2,5–3 m",
};

// AlertTriangle SVG path (lucide)
const TRIANGLE_SVG = (size: number, color: string) => `
  <svg xmlns="http://www.w3.org/2000/svg"
    width="${size}" height="${size}" viewBox="0 0 24 24"
    style="filter:drop-shadow(0 2px 6px rgba(0,0,0,0.28));"
  >
    <circle cx="12" cy="12" r="11.5" fill="${color}" stroke="white" stroke-width="1.5"/>
    <g transform="translate(12,11.5) scale(0.6) translate(-12,-12)" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </g>
  </svg>
`;

function createIcon(severity: Severity, clusterSize: number): L.DivIcon {
  const size = Math.round(Math.min(24 + Math.log(clusterSize) * 3, 44));
  const color = SEVERITY_COLOR[severity];
  return L.divIcon({
    html: TRIANGLE_SVG(size, color),
    className: "",
    iconSize:   [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

export default function ObstacleLayer({ obstacles }: ObstacleLayerProps) {
  return (
    <>
      {obstacles.map((obstacle, index) => {
        const [lon, lat] = obstacle.geometry.coordinates;
        const { severity, cluster_size, avg_width, min_width } = obstacle.properties;
        const color = SEVERITY_COLOR[severity];
        const icon = createIcon(severity, cluster_size);

        return (
          <Marker
            key={`obstacle-${index}`}
            position={[lat, lon]}
            icon={icon}
          >
            <Popup minWidth={200}>
              <div style={{ padding: "2px 4px" }}>
                <p style={{
                  margin: "0 0 4px 0",
                  fontSize: "13px",
                  fontWeight: 700,
                  color,
                }}>
                  {SEVERITY_LABEL[severity]}
                </p>
                <p style={{
                  margin: "0 0 8px 0",
                  fontSize: "11px",
                  color: "#9ca3af",
                }}>
                  {SEVERITY_DESC[severity]}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                    <span style={{ color: "#6b7280" }}>Min. šířka</span>
                    <span style={{ fontWeight: 700, color }}>
                      {min_width.toFixed(2)} m
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                    <span style={{ color: "#6b7280" }}>Prům. šířka</span>
                    <span style={{ fontWeight: 600, color: "#111827" }}>
                      {avg_width.toFixed(2)} m
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                    <span style={{ color: "#6b7280" }}>Počet měření</span>
                    <span style={{ fontWeight: 600, color: "#111827" }}>
                      {cluster_size}
                    </span>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
