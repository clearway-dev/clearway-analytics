import { useEffect, useRef, useState } from "react";
import { Calendar } from "../components/ui/calendar";
import { format } from "date-fns";
import { CalendarIcon, Download, FileJson, FileSpreadsheet, Loader2, Map } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import {
  fetchAvailableDates,
  fetchExportPreview,
  downloadSegmentExport,
  type ExportMode,
  type ExportFormat,
  type ExportPreview,
} from "../services/api";

// ─── helpers ────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function defaultFilename(): string {
  // e.g. "clearway_export_2026_03_25"
  return `clearway_export_${today().replaceAll("-", "_")}`;
}

const MODES: { id: ExportMode; label: string; description: string }[] = [
  {
    id: "single",
    label: "Jeden den",
    description: "Statistiky pro jeden konkrétní den měření",
  },
  {
    id: "range",
    label: "Rozsah dat",
    description: "Agregováno za zvolené časové období",
  },
  {
    id: "all",
    label: "Vše",
    description: "Všechna zaznamenaná měření v databázi",
  },
];

const FORMATS: {
  id: ExportFormat;
  label: string;
  ext: string;
  description: string;
  Icon: React.ElementType;
}[] = [
  {
    id: "geojson",
    label: "GeoJSON",
    ext: ".geojson",
    description: "Plná geometrie · otevře v QGIS / ArcGIS",
    Icon: FileJson,
  },
  {
    id: "shapefile",
    label: "Shapefile",
    ext: ".zip",
    description: "Standardní GIS formát · ZIP archiv",
    Icon: Map,
  },
  {
    id: "csv",
    label: "CSV",
    ext: ".csv",
    description: "Tabulka bez geometrie · pro tabulkové procesory",
    Icon: FileSpreadsheet,
  },
];

// ─── small reusable calendar trigger ────────────────────────────────────────

interface DatePickerProps {
  value: string;
  onChange: (d: string) => void;
  availableDates: string[];
  popoverAlign?: "left" | "right";
}

function DatePicker({ value, onChange, availableDates, popoverAlign = "left" }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
      >
        <CalendarIcon className="h-4 w-4 text-gray-400 shrink-0" />
        {value}
      </button>
      {open && (
        <div
          className={`absolute top-full mt-1 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden ${
            popoverAlign === "right" ? "right-0" : "left-0"
          }`}
        >
          <Calendar
            mode="single"
            selected={new Date(value)}
            onSelect={(date) => {
              if (date) {
                onChange(format(date, "yyyy-MM-dd"));
                setOpen(false);
              }
            }}
            modifiers={{
              hasData: (date) =>
                availableDates.some((d) => d === format(date, "yyyy-MM-dd")),
            }}
            modifiersClassNames={{
              hasData:
                "font-bold rounded-md !bg-green-100 text-green-800 aria-selected:!bg-green-900 aria-selected:!text-white",
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function ExportPage() {
  const t = today();

  const [mode, setMode] = useState<ExportMode>("single");
  const [singleDate, setSingleDate] = useState(t);
  const [fromDate, setFromDate] = useState(t);
  const [toDate, setToDate] = useState(t);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("geojson");
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [fileName, setFileName] = useState(defaultFilename);

  // Seed dates from API
  useEffect(() => {
    fetchAvailableDates().then((dates) => {
      setAvailableDates(dates);
      if (dates.length > 0) {
        setSingleDate(dates[0]);
        setToDate(dates[0]);
        setFromDate(dates[dates.length - 1]); // oldest available as range start
      }
    });
  }, []);

  // Live preview whenever mode/dates change
  useEffect(() => {
    setPreviewLoading(true);
    setPreview(null);
    const td = mode === "single" ? singleDate : undefined;
    const fd = mode === "range" ? fromDate : undefined;
    const tod = mode === "range" ? toDate : undefined;

    fetchExportPreview(mode, td, fd, tod)
      .then((data) => setPreview(data))
      .catch(() => setPreview(null))
      .finally(() => setPreviewLoading(false));
  }, [mode, singleDate, fromDate, toDate]);

  async function handleDownload() {
    const td = mode === "single" ? singleDate : undefined;
    const fd = mode === "range" ? fromDate : undefined;
    const tod = mode === "range" ? toDate : undefined;
    // Trim whitespace; fall back to default if user cleared the field
    const name = fileName.trim() || defaultFilename();
    setIsExporting(true);
    try {
      await downloadSegmentExport(exportFormat, mode, td, fd, tod, name);
    } finally {
      setIsExporting(false);
    }
  }

  const selectedFormat = FORMATS.find((f) => f.id === exportFormat);
  const canDownload = !previewLoading && !isExporting && preview !== null && preview.segment_count > 0;

  return (
    <div className="h-full flex flex-col bg-gray-50/50">
      <div className="flex-none px-6 pt-6 pb-2">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Export dat</h2>
        <p className="text-sm text-gray-500 mt-1">
          Stáhněte data průjezdnosti ve standardních GIS formátech.
        </p>
      </div>

      <div className="flex-1 p-6 pt-2 overflow-auto">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">

          {/* ── Left column: controls ── */}
          <div className="space-y-6">

            {/* 1. Time range mode */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Časový rozsah
                </h3>

                <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setMode(m.id)}
                      className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-all text-center ${
                        mode === m.id
                          ? "bg-white text-blue-600 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <p className="text-xs text-gray-400">
                  {MODES.find((m) => m.id === mode)?.description}
                </p>

                {mode === "single" && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 w-12">Datum</span>
                    <DatePicker
                      value={singleDate}
                      onChange={setSingleDate}
                      availableDates={availableDates}
                    />
                  </div>
                )}

                {mode === "range" && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 w-8">Od</span>
                      <DatePicker
                        value={fromDate}
                        onChange={setFromDate}
                        availableDates={availableDates}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 w-8">Do</span>
                      <DatePicker
                        value={toDate}
                        onChange={setToDate}
                        availableDates={availableDates}
                        popoverAlign="right"
                      />
                    </div>
                  </div>
                )}

                {mode === "all" && (
                  <p className="text-sm text-gray-500">
                    Zahrnuje veškerá měření v databázi, agregovaná podle úseku.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* 2. Format */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Formát
                </h3>

                <div className="grid grid-cols-3 gap-3">
                  {FORMATS.map(({ id, label, ext, description, Icon }) => (
                    <button
                      key={id}
                      onClick={() => setExportFormat(id)}
                      className={`flex flex-col items-start p-4 rounded-xl border-2 text-left transition-all ${
                        exportFormat === id
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <Icon
                        className={`h-5 w-5 mb-2 ${
                          exportFormat === id ? "text-blue-600" : "text-gray-400"
                        }`}
                      />
                      <span
                        className={`text-sm font-semibold ${
                          exportFormat === id ? "text-blue-700" : "text-gray-800"
                        }`}
                      >
                        {label}
                      </span>
                      <span className="text-xs text-gray-400 mt-0.5">{ext}</span>
                      <span className="text-xs text-gray-500 mt-1 leading-tight">{description}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Right column: preview + download ── */}
          <div className="space-y-4 xl:sticky xl:top-0">
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Náhled
                </h3>

                {previewLoading && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="animate-spin h-4 w-4 text-blue-500" />
                    Načítám…
                  </div>
                )}
                {!previewLoading && preview === null && (
                  <p className="text-sm text-red-400">Náhled nelze načíst.</p>
                )}
                {!previewLoading && preview !== null && preview.segment_count === 0 && (
                  <p className="text-sm text-amber-600">
                    Pro vybraný časový rozsah nebyla nalezena žádná data.
                  </p>
                )}
                {!previewLoading && preview !== null && preview.segment_count > 0 && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-3xl font-bold text-gray-900">
                        {preview.segment_count.toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-500">úseků k exportu</p>
                    </div>
                    <div className="text-sm text-gray-500 space-y-1">
                      {mode === "single" && (
                        <p>Data z {preview.date_from}</p>
                      )}
                      {mode !== "single" && preview.date_from && (
                        <p>{preview.date_from} → {preview.date_to}<br />{preview.days_with_data} dní s daty</p>
                      )}
                      <p className="font-medium text-gray-700">
                        {selectedFormat?.label}{" "}
                        <span className="font-normal text-gray-400">{selectedFormat?.ext}</span>
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Filename input */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Název souboru
                </h3>
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                  <input
                    type="text"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none"
                    placeholder={defaultFilename()}
                  />
                  <span className="px-3 py-2 text-sm text-gray-400 bg-gray-50 border-l border-gray-200 select-none">
                    {selectedFormat?.ext}
                  </span>
                </div>
              </CardContent>
            </Card>

            <button
              onClick={handleDownload}
              disabled={!canDownload}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generuji…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Stáhnout {selectedFormat?.ext}
                </>
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
