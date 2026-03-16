import { useState, useRef } from "react";
import { X, Sparkles, Loader2, Check, Paperclip } from "lucide-react";
import apiClient from "../../lib/api";

export interface AIVehicleData {
  name: string | null;
  category: string | null;
  width: number | null;
  height: number | null;
  length: number | null;
  turning_diameter_track: number | null;
  turning_diameter_clearance: number | null;
  stabilization_width: number | null;
  weight: number | null;
}

interface AIImportModalProps {
  onVehiclesAdded: (vehicles: AIVehicleData[]) => void;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  fire_truck: "Hasičský vůz",
  ambulance: "Sanitka",
  police: "Policie",
  rescue: "Záchranáři",
  other: "Jiné",
};

function fmtCm(val: number | null): string {
  if (val == null) return "—";
  return `${(val / 100).toFixed(2)} m`;
}

export default function AIImportModal({ onVehiclesAdded, onClose }: AIImportModalProps) {
  const [text, setText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<AIVehicleData[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (file.name.toLowerCase().endsWith(".txt")) {
      // TXT → read into textarea, no need to upload separately
      const reader = new FileReader();
      reader.onload = (ev) => {
        setText((ev.target?.result as string) ?? "");
        setSelectedFile(null); // will be sent as text
      };
      reader.readAsText(file, "utf-8");
    } else {
      // PDF or other → keep file for multipart upload
      setSelectedFile(file);
      setText(""); // clear textarea; file takes priority
    }
    // Reset so same file can be reselected
    e.target.value = "";
  }

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    try {
      let data: AIVehicleData[];

      if (selectedFile) {
        // Send as multipart (PDF etc.)
        const form = new FormData();
        form.append("file", selectedFile);
        const res = await apiClient.post<AIVehicleData[]>("/api/ai/parse-vehicle-file", form);
        data = res.data;
      } else {
        if (!text.trim()) { setError("Vložte text nebo nahrajte soubor."); return; }
        const res = await apiClient.post<AIVehicleData[]>("/api/ai/parse-vehicle", { text });
        data = res.data;
      }

      if (data.length === 0) { setError("AI nenašlo žádná vozidla."); return; }
      setVehicles(data);
      setSelected(new Set(data.map((_, i) => i)));
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? "Analýza selhala. Zkuste to znovu.");
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) { next.delete(i); } else { next.add(i); }
      return next;
    });
  }

  async function handleAddSelected() {
    if (!vehicles || selected.size === 0) return;
    setSaving(true);
    setError(null);
    const toAdd = [...selected].map((i) => vehicles[i]);
    try {
      const saved: AIVehicleData[] = [];
      for (const v of toAdd) {
        const res = await apiClient.post("/api/vehicles/", {
          name: v.name ?? "Neznámé vozidlo",
          category: v.category ?? null,
          width: v.width,
          height: v.height,
          weight: v.weight,
          length: v.length,
          turning_diameter_track: v.turning_diameter_track,
          turning_diameter_clearance: v.turning_diameter_clearance,
          stabilization_width: v.stabilization_width,
        });
        saved.push(res.data);
      }
      onVehiclesAdded(saved);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? "Uložení selhalo.");
    } finally {
      setSaving(false);
    }
  }

  const canAnalyze = selectedFile !== null || text.trim().length > 0;

  // ── Phase 2: vehicle selection ───────────────────────────────────────────
  if (vehicles) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-xl mx-4 flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-500" />
              <h3 className="text-lg font-semibold text-gray-900">
                Nalezena vozidla ({vehicles.length})
              </h3>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-500">
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="px-6 pt-3 pb-1 text-sm text-gray-500">
            Vyberte vozidla k importu a klikněte na "Přidat vybrané".
          </p>

          <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
            {vehicles.map((v, i) => {
              const isSelected = selected.has(i);
              return (
                <div
                  key={i}
                  onClick={() => toggleSelect(i)}
                  className={`cursor-pointer border rounded-xl p-4 transition-colors ${
                    isSelected
                      ? "border-blue-400 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      isSelected ? "bg-blue-600 border-blue-600" : "border-gray-300"
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">
                        {v.name ?? <span className="italic text-gray-400">Bez názvu</span>}
                      </p>
                      {v.category && (
                        <span className="inline-block mt-0.5 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                          {CATEGORY_LABELS[v.category] ?? v.category}
                        </span>
                      )}
                      <div className="mt-2 grid grid-cols-4 gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span>Šířka: <span className="font-medium text-gray-700">{fmtCm(v.width)}</span></span>
                        <span>Výška: <span className="font-medium text-gray-700">{fmtCm(v.height)}</span></span>
                        <span>Délka: <span className="font-medium text-gray-700">{fmtCm(v.length)}</span></span>
                        <span>Hm.: <span className="font-medium text-gray-700">{v.weight != null ? `${v.weight} t` : "—"}</span></span>
                        {v.turning_diameter_track != null && (
                          <span className="col-span-2">Otáčení stop.: <span className="font-medium text-gray-700">{fmtCm(v.turning_diameter_track)}</span></span>
                        )}
                        {v.turning_diameter_clearance != null && (
                          <span className="col-span-2">Otáčení obr.: <span className="font-medium text-gray-700">{fmtCm(v.turning_diameter_clearance)}</span></span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {error && <p className="px-6 text-sm text-red-500">{error}</p>}

          <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center gap-3">
            <button
              onClick={() => setSelected(new Set(vehicles.map((_, i) => i)))}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Vybrat vše
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                Zrušit
              </button>
              <button
                onClick={handleAddSelected}
                disabled={saving || selected.size === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Ukládám…</>
                  : <>Přidat vybrané ({selected.size})</>
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Phase 1: text / file input ───────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-gray-900">AI Import vozidla</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-3">
          Vložte text nebo nahrajte soubor z technického průkazu či katalogu. AI automaticky rozpozná všechna vozidla.
        </p>

        {/* File upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.text"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className={`w-full flex items-center gap-2 px-3 py-2 mb-3 border rounded-lg text-sm transition-colors ${
            selectedFile
              ? "border-blue-400 bg-blue-50 text-blue-700"
              : "border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700"
          }`}
        >
          <Paperclip className="w-4 h-4 shrink-0" />
          <span className="truncate">
            {selectedFile ? selectedFile.name : "Nahrát soubor (PDF, TXT)…"}
          </span>
          {selectedFile && (
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
              className="ml-auto text-blue-400 hover:text-blue-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </button>

        {/* Text area — disabled when PDF is attached */}
        {!selectedFile && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={"Příklad:\nCAS 24 SCANIA P410\nŠířka: 2 550 mm, Výška: 3 300 mm\nDélka: 7 800 mm, Hmotnost: 18 500 kg\nPrůměr otáčení stopový: 16 m\n\nCAS 15 MB ATEGO\nŠířka 2,52 m, výška 3,27 m..."}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        )}

        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            Zrušit
          </button>
          <button
            onClick={handleAnalyze}
            disabled={loading || !canAnalyze}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" />Analyzuji…</>
              : <><Sparkles className="w-4 h-4" />Analyzovat</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
