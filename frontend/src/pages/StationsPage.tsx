import { useEffect, useState } from "react";
import { Pencil, Trash2, Plus, Loader2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Card, CardHeader, CardContent } from "../components/ui/card";
import {
  Table, TableHeader, TableBody, TableRow,
  TableHead, TableCell,
} from "../components/ui/table";
import apiClient from "../lib/api";
import StationFormModal, {
  STATION_TYPES,
  EMPTY_FORM,
  toFormState,
  type FormState,
} from "../components/StationFormModal";

interface StationRecord {
  id: string;
  name: string;
  type: string | null;
  address: string | null;
  lat: number;
  lon: number;
  notes: string | null;
}

function typeLabel(value: string | null): string {
  if (!value) return "—";
  return STATION_TYPES.find((t) => t.value === value)?.label ?? value;
}

export default function StationsPage() {
  const { isAdmin } = useAuth();
  const [stations, setStations] = useState<StationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [initialMapPosition, setInitialMapPosition] = useState<{ lat: number; lng: number } | null>(null);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    apiClient.get("/api/v1/stations/")
      .then((r) => { setStations(r.data); setLoading(false); })
      .catch(() => { setPageError("Nepodařilo se načíst data."); setLoading(false); });
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setInitialMapPosition(null);
    setModalOpen(true);
  }

  function openEdit(s: StationRecord) {
    setEditingId(s.id);
    setForm(toFormState(s));
    setFormError(null);
    setInitialMapPosition({ lat: s.lat, lng: s.lon });
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
      const url = editingId ? `/api/v1/stations/${editingId}` : "/api/v1/stations/";
      const method = editingId ? "put" : "post";
      const res = await apiClient[method]<StationRecord>(url, body);
      const saved = res.data;
      setStations((prev) =>
        editingId
          ? prev.map((s) => (s.id === editingId ? saved : s))
          : [...prev, saved].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setModalOpen(false);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setFormError(detail ?? "Uložení selhalo.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/api/v1/stations/${deleteId}`);
      setStations((prev) => prev.filter((s) => s.id !== deleteId));
    } finally {
      setDeleteId(null);
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 h-full text-sm text-gray-500">
        <Loader2 className="animate-spin h-4 w-4 text-blue-500" />
        Načítám…
      </div>
    );
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
        {isAdmin && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Přidat stanici
          </button>
        )}
      </div>

      <div className="flex-1 p-6 pt-2 overflow-auto">
        <Card>
          <CardHeader className="p-4 pb-2">
            <p className="text-xs text-gray-400">{stations.length} záznamů</p>
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
                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(s)}
                            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-800"
                            title="Upravit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteId(s.id)}
                            className="p-1.5 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600"
                            title="Smazat"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {modalOpen && (
        <StationFormModal
          editingId={editingId}
          form={form}
          formError={formError}
          saving={saving}
          initialMapPosition={initialMapPosition}
          onClose={closeModal}
          onSave={handleSave}
          onFieldChange={handleField}
        />
      )}

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
