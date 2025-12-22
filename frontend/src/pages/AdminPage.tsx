import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Activity, Map, Ruler, BarChart3 } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface ChartData {
  date: string;
  count: number;
  [key: string]: string | number;
}

interface PieData {
  name: string;
  value: number;
  [key: string]: string | number;
}

interface DashboardStats {
  total_segments: number;
  total_measurements: number;
  total_length_km: number;
  measured_segments_count: number;
  activity_chart: ChartData[];
  quality_chart: PieData[];
}

const COLORS = ["#22c55e", "#ef4444"];

export default function AdminPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";

    fetch(`${apiUrl}/api/dashboard/stats`)
      .then((res) => res.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load dashboard stats:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex justify-center items-center h-full">
        <span className="text-gray-500">Loading dashboard data...</span>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold tracking-tight mb-6">Admin Dashboard</h1>
        <div className="text-red-500">Failed to load data.</div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-gray-50/50 min-h-screen">
      <div className="flex items-center justify-between space-y-2 mb-8">
        <h2 className="text-3xl font-bold tracking-tight text-gray-900">Dashboard</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        {/* Card 1: Total Length */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total Network Length
            </CardTitle>
            <Ruler className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{stats.total_length_km.toLocaleString()} km</div>
            <p className="text-xs text-gray-500 mt-1">
              Mapped road infrastructure
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Total Measurements */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total Measurements
            </CardTitle>
            <Activity className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{stats.total_measurements.toLocaleString()}</div>
            <p className="text-xs text-gray-500 mt-1">
              Individual data points
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Measured Segments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Analyzed Segments
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{stats.measured_segments_count.toLocaleString()}</div>
            <p className="text-xs text-gray-500 mt-1">
              Segments with statistics
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Total Segments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">
              Total Road Segments
            </CardTitle>
            <Map className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{stats.total_segments.toLocaleString()}</div>
            <p className="text-xs text-gray-500 mt-1">
              Database records
            </p>
          </CardContent>
        </Card>
      </div>

      {/* CHARTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
        {/* LEFT CHART: Activity */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Measurement Activity (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent className="pl-0">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={stats.activity_chart}
                  margin={{
                    top: 10,
                    right: 30,
                    left: 0,
                    bottom: 0,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { weekday: 'short' })}
                    style={{ fontSize: '12px', fill: '#888' }}
                  />
                  <YAxis
                     tickLine={false}
                     axisLine={false}
                     style={{ fontSize: '12px', fill: '#888' }}
                  />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#3b82f6"
                    fill="#3b82f6"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT CHART: Quality Pie */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Infrastructure Health</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.quality_chart}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    fill="#8884d8"
                    stroke="none"
                    paddingAngle={
                      stats.quality_chart.filter((d) => d.value > 0).length > 1
                        ? 5
                        : 0
                    }
                    dataKey="value"
                  >
                    {stats.quality_chart.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.name === "Passable" ? COLORS[0] : COLORS[1]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}