import { useEffect, useState } from "react";
import { Pencil, Trash2, Plus, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import {
  Table, TableHeader, TableBody, TableRow,
  TableHead, TableCell,
} from "../components/ui/table";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const STATION_TYPES: { value: string; label: string }[] = [
  { value: "fire_station", label: "Hasičská stanice" },
  { value: "police", label: "Policie" },
  { value: "hospital", label: "Nemocnice" },
  { value: "rescue", label: "Záchranná služba" },
  { value: "other", label: "Jiné" },
];

function typeLabel(value: string | null): string {
  if (!value) return "—";
  return STATION_TYPES.find((t) => t.value === value)?.label ?? value;
}

interface StationRecord {
  id: string;
  name: string;
  type: string | null;
  address: string | null;
  lat: number;
  lon: number;
  notes: string | null;
}

interface FormState {
  name: string;
  type: string;
  address: string;
  lat: string;
  lon: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  type: "",
  address: "",
  lat: "",
  lon: "",
  notes: "",
};

function toFormState(s: StationRecord): FormState {
  return {
    name: s.name,
    type: s.type ?? "",
    address: s.address ?? "",
    lat: String(s.lat),
    lon: String(s.lon),
    notes: s.notes ?? "",
  };
}

export default function StationsPage() {
  const [stations, setStations] = useState<StationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/stations/`)
      .then((r) => r.json())
      .then((data) => { setStations(data); setLoading(false); })
      .catch(() => { setPageError("Nepodařilo se načíst data."); setLoading(false); });
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(s: StationRecord) {
    setEditingId(s.id);
    setForm(toFormState(s));
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
  }

  function handleField(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError("Název je povinný."); return; }
    const lat = parseFloat(form.lat);
    const lon = parseFloat(form.lon);
    if (isNaN(lat) || isNaN(lon)) { setFormError("Zeměpisná šířka a délka jsou povinné."); return; }

    const body = {
      name: form.name.trim(),
      type: form.type || null,
      address: form.address.trim() || null,
      lat,
      lon,
      notes: form.notes.trim() || null,
    };

    setSaving(true);
    setFormError(null);
    try {
      const url = editingId
        ? `${API_URL}/api/stations/${editingId}`
        : `${API_URL}/api/stations/`;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFormError(err?.detail ?? "Uložení selhalo.");
        return;
      }
      const saved: StationRecord = await res.json();
      setStations((prev) =>
        editingId
          ? prev.map((s) => (s.id === editingId ? saved : s))
          : [...prev, saved].sort((a, b) => a.name.localeCompare(b.name))
      );
      setModalOpen(false);
    } catch {
      setFormError("Síťová chyba.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`${API_URL}/api/stations/${deleteId}`, { method: "DELETE" });
      setStations((prev) => prev.filter((s) => s.id !== deleteId));
    } finally {
      setDeleteId(null);
      setDeleting(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center items-center h-full text-gray-500">Načítám…</div>;
  }
  if (pageError) {
    return <div className="p-8 text-red-500">{pageError}</div>;
  }

  return (
    <div className="h-full flex flex-col bg-gray-50/50">
      <div className="flex-none px-6 pt-6 pb-2 flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">
          Výjezdové stanice
        </h2>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Přidat stanici
        </button>
      </div>

      <div className="flex-1 p-6 pt-2 overflow-auto">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm text-gray-500 font-normal">
              {stations.length} záznamů
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Název</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Adresa</TableHead>
                  <TableHead>Lat</TableHead>
                  <TableHead>Lon</TableHead>
                  <TableHead>Poznámky</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-400 py-10">
                      Žádné stanice. Přidejte první záznam.
                    </TableCell>
                  </TableRow>
                )}
                {stations.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{typeLabel(s.type)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{s.address ?? "—"}</TableCell>
                    <TableCell className="font-mono text-sm">{s.lat.toFixed(5)}</TableCell>
                    <TableCell className="font-mono text-sm">{s.lon.toFixed(5)}</TableCell>
                    <TableCell className="max-w-[150px] truncate text-gray-500">{s.notes ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(s)}
                          className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-800"
                          title="Upravit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteId(s.id)}
                          className="p-1.5 hover:bg-red-50 rounded text-gray-500 hover:text-red-600"
                          title="Smazat"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Add / Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingId ? "Upravit stanici" : "Nová stanice"}
              </h3>
              <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Název <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleField("name", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="např. Stanice HZS Plzeň-město"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Typ</label>
                <select
                  value={form.type}
                  onChange={(e) => handleField("type", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">— Nevybráno —</option>
                  {STATION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Adresa</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => handleField("address", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Korespondenční adresa"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Zeměpisná šířka <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.00001"
                    value={form.lat}
                    onChange={(e) => handleField("lat", e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="49.74832"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Zeměpisná délka <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.00001"
                    value={form.lon}
                    onChange={(e) => handleField("lon", e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="13.37736"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Poznámky</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => handleField("notes", e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Volitelné poznámky"
                />
              </div>

              {formError && <p className="text-sm text-red-500">{formError}</p>}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={closeModal}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Zrušit
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? "Ukládám…" : "Uložit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !deleting && setDeleteId(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Smazat stanici?</h3>
            <p className="text-sm text-gray-500 mb-5">Tato akce je nevratná.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                Zrušit
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Mažu…" : "Smazat"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
