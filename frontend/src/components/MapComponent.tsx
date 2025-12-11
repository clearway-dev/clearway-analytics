import type { LatLngTuple } from "leaflet";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import type { GeoJsonObject, Feature, Geometry } from "geojson";
import type { Layer } from "leaflet";

interface SegmentProperties {
    segment_id: string;
    name: string;
    avg_width: number;
    measurements_count: number;
    status: 'ok' | 'narrow';
}

type SegmentFeature = Feature<Geometry, SegmentProperties>;

export default function MapComponent() {
    const position: LatLngTuple = [49.7384, 13.3736];

    const [geoJsonData, setGeoJsonData] = useState<GeoJsonObject | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';

        fetch(`${apiUrl}/api/map/segments`)
            .then(res => res.json())
            .then(data => {
                console.log("Data loaded:", data);
                setGeoJsonData(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Error fetching map data:", err);
                setLoading(false);
            });
    }, []);

    const styleFeature = (feature?: SegmentFeature) => {
        const status = feature?.properties?.status;
        return {
            color: status === 'ok' ? '#2ecc71' : '#e74c3c',
            weight: 4,
            opacity: 0.9,
        };
    };

    const onEachFeature = (feature: SegmentFeature, layer: Layer) => {
        if (feature.properties) {
            const { name, avg_width, measurements_count } = feature.properties;
            layer.bindPopup(`
                <div class="text-sm">
                    <strong class="text-base font-semibold">${name}</strong><br/>
                    <span class="text-gray-700">Average Width: ${avg_width.toFixed(2)} m</span><br/>
                    <span class="text-gray-700">Measurements: ${measurements_count}</span>
                </div>
            `);
        }
    };

    return (
        <MapContainer
            center={position}
            zoom={13}
            className="h-full w-full"
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {!loading && geoJsonData && (
                <GeoJSON
                    data={geoJsonData}
                    style={styleFeature}
                    onEachFeature={onEachFeature}
                />
            )}
        </MapContainer>
    );
}