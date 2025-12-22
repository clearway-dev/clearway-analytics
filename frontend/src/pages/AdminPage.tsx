import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/ui/table";
import { Activity, Map, Ruler, BarChart3, ArrowRight } from "lucide-react";
import CoverageMap from "../components/CoverageMap";
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

interface Anomaly {
  id: string;
  name: string;
  min_width: number;
  avg_width: number;
  measurements_count: number;
  lat: number;
  lon: number;
  date: string;
}

interface DashboardStats {
  total_segments: number;
  total_measurements: number;
  total_length_km: number;
  measured_segments_count: number;
  activity_chart: ChartData[];
  quality_chart: PieData[];
  anomalies: Anomaly[];
}

const COLORS = ["#22c55e", "#ef4444"];

export default function AdminPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const navigate = useNavigate();

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
      <div className="flex justify-center items-center h-screen bg-gray-50">
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
    <div className="h-full w-full overflow-hidden bg-gray-50/50 flex flex-col">
      {/* HEADER */}
      <div className="flex-none p-6 pb-2">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Dashboard</h2>
      </div>

      {/* MAIN CONTENT - SCROLLABLE IF NEEDED BUT COMPACT */}
      <div className="flex-1 p-6 pt-2 overflow-y-auto">
        <div className="flex flex-col gap-4 h-full">
          
          {/* TOP SECTION: GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
            
            {/* LEFT COLUMN: KPIs + CHARTS (Span 8) */}
            <div className="lg:col-span-8 flex flex-col gap-4 h-full">
              
              {/* 1. KPIs ROW */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-none">
                {/* Card 1 */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                    <CardTitle className="text-xs font-medium text-gray-500">
                      Network Length
                    </CardTitle>
                    <Ruler className="h-4 w-4 text-gray-400" />
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="text-xl font-bold text-gray-900">{stats.total_length_km.toLocaleString()} km</div>
                  </CardContent>
                </Card>

                {/* Card 2 */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                    <CardTitle className="text-xs font-medium text-gray-500">
                      Measurements
                    </CardTitle>
                    <Activity className="h-4 w-4 text-gray-400" />
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="text-xl font-bold text-gray-900">{stats.total_measurements.toLocaleString()}</div>
                  </CardContent>
                </Card>

                {/* Card 3 */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                    <CardTitle className="text-xs font-medium text-gray-500">
                      Segments
                    </CardTitle>
                    <BarChart3 className="h-4 w-4 text-gray-400" />
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="text-xl font-bold text-gray-900">{stats.measured_segments_count.toLocaleString()}</div>
                  </CardContent>
                </Card>

                {/* Card 4 */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                    <CardTitle className="text-xs font-medium text-gray-500">
                      Total Roads
                    </CardTitle>
                    <Map className="h-4 w-4 text-gray-400" />
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="text-xl font-bold text-gray-900">{stats.total_segments.toLocaleString()}</div>
                  </CardContent>
                </Card>
              </div>

              {/* 2. CHARTS ROW */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                {/* Activity Chart */}
                <Card className="flex flex-col h-full">
                  <CardHeader className="p-4 pb-2 flex-none">
                    <CardTitle className="text-sm">Measurement Activity (7d)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex-1 min-h-[150px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={stats.activity_chart}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { weekday: 'short' })}
                          style={{ fontSize: '10px', fill: '#888' }}
                        />
                        <YAxis
                           tickLine={false}
                           axisLine={false}
                           style={{ fontSize: '10px', fill: '#888' }}
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
                  </CardContent>
                </Card>

                {/* Pie Chart */}
                <Card className="flex flex-col h-full">
                  <CardHeader className="p-4 pb-2 flex-none">
                    <CardTitle className="text-sm">Infrastructure Health</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex-1 min-h-[150px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={stats.quality_chart}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={70}
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
                        <Legend verticalAlign="bottom" height={36} iconSize={8} wrapperStyle={{ fontSize: '12px' }}/>
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

            </div>

            {/* RIGHT COLUMN: MAP (Span 4) */}
            <div className="lg:col-span-4 h-full">
              <Card className="h-full flex flex-col overflow-hidden">
                <CardHeader className="p-4 pb-2 flex-none">
                  <CardTitle className="text-sm">Coverage Heatmap</CardTitle>
                </CardHeader>
                <CardContent className="p-0 flex-1 relative">
                   <div className="absolute inset-0">
                      <CoverageMap />
                   </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* BOTTOM SECTION: ANOMALIES TABLE (Full Width) */}
          <div className="flex-none pb-4">
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm">Data Anomalies (Narrowest Segments)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Street Name</TableHead>
                      <TableHead>Min Width</TableHead>
                      <TableHead>Avg Width</TableHead>
                      <TableHead className="text-right">Measurements</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.anomalies && stats.anomalies.map((anomaly) => (
                      <TableRow key={anomaly.id}>
                        <TableCell className="font-medium">{anomaly.name}</TableCell>
                        <TableCell className={anomaly.min_width < 300 ? "text-red-500 font-bold" : ""}>
                          {(anomaly.min_width / 100).toFixed(2)} m
                        </TableCell>
                        <TableCell>{(anomaly.avg_width / 100).toFixed(2)} m</TableCell>
                        <TableCell className="text-right">{anomaly.measurements_count}</TableCell>
                        <TableCell>
                          <button
                            onClick={() =>
                              navigate(
                                `/?segmentId=${anomaly.id}&lat=${anomaly.lat}&lon=${anomaly.lon}&date=${anomaly.date}`
                              )
                            }
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            <ArrowRight className="h-4 w-4 text-gray-400" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}