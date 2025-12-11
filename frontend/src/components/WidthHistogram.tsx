import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface HistrogramBin {
  range: string;
  count: number;
  min: number;
}

interface WidthHistogramProps {
  segmentId: string;
}

export default function WidthHistogram({ segmentId }: WidthHistogramProps) {
  const [data, setData] = useState<HistrogramBin[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";

    fetch(`${apiUrl}/api/stats/segment/${segmentId}/histogram`)
      .then((res) => res.json())
      .then((fetchedData) => {
        const activeBins = fetchedData.filter(
          (d: HistrogramBin) => d.count > 0
        );
        setData(activeBins);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching histogram data:", err);
        setLoading(false);
      });
  }, [segmentId]);

  if (loading)
    return (
      <div className="h-32 flex items-center justify-center text-gray-400 text-xs">
        Loading chart...
      </div>
    );
  if (data.length === 0)
    return (
      <div className="h-32 flex items-center justify-center text-gray-400 text-xs">
        No detail data available
      </div>
    );

  return (
    <div className="w-full h-48 mt-2">
      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
        Width Distribution (cm)
      </h4>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 5, right: 0, left: -20, bottom: 0 }}
        >
          <XAxis
            dataKey="range"
            tick={{ fontSize: 10 }}
            interval={0} 
            angle={0} 
            textAnchor="middle"
            height={40}
          />
          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              borderRadius: "8px",
              border: "none",
              boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
            }}
            cursor={{ fill: "#f3f4f6" }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.min < 300 ? "#f87171" : "#4ade80"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
