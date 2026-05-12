import { useEffect, useState } from "react";
import { Pencil, Trash2, Plus, Sparkles, Loader2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import AIImportModal, { type AIVehicleData } from "../components/vehicles/AIImportModal";
import VehicleFormModal from "../components/vehicles/VehicleFormModal";
import {
  CATEGORIES,
  EMPTY_FORM,
  toFormState,
  parseMetresToCm,
  parseOptionalFloat,
  type FormState,
} from "../components/vehicles/vehicleFormTypes";
import {
  Card,
  CardHeader,
  CardContent,
} from "../components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../components/ui/table";
import apiClient from "../lib/api";

interface TargetVehicle {
  id: string;
  name: string;
  category: string | null;
  width: number | null;
  height: number | null;
  weight: number | null;
  length: number | null;
  turning_diameter_track: number | null;
  turning_diameter_clearance: number | null;
  stabilization_width: number | null;
}

function categoryLabel(value: string | null): string {
  if (!value) return "—";
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

/** Display integer centimetres as metres with 2 decimal places. */
function fmtCmAsM(value: number | null): string {
  return value != null ? `${(value / 100).toFixed(2)} m` : "—";
}

function fmt(value: number | null, unit: string): string {
  return value != null ? `${value} ${unit}` : "—";
}

export default function VehiclesPage() {
  const { isAdmin } = useAuth();
  const [vehicles, setVehicles] = useState<TargetVehicle[]>([]);
  const [aiModalOpen, setAiModalOpen] = useState(false);
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
    apiClient.get("/api/v1/vehicles/")
      .then((r) => { setVehicles(r.data); setLoading(false); })
      .catch(() => { setPageError("Nepodařilo se načíst data."); setLoading(false); });
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function handleVehiclesAdded(newVehicles: AIVehicleData[]) {
    setAiModalOpen(false);
    setVehicles((prev) =>
      [...prev, ...(newVehicles as unknown as TargetVehicle[])]
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  function openEdit(v: TargetVehicle) {
    setEditingId(v.id);
    setForm(toFormState(v));
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
    if (!form.name.trim()) {
      setFormError("Název je povinný.");
      return;
    }

    const body = {
      name: form.name.trim(),
      category: form.category || null,
      width: parseMetresToCm(form.width),
      height: parseMetresToCm(form.height),
      weight: parseOptionalFloat(form.weight),
      length: parseMetresToCm(form.length),
      turning_diameter_track: parseMetresToCm(form.turning_diameter_track),
      turning_diameter_clearance: parseMetresToCm(form.turning_diameter_clearance),
      stabilization_width: parseMetresToCm(form.stabilization_width),
    };

    setSaving(true);
    setFormError(null);

    try {
      const url = editingId ? `/api/v1/vehicles/${editingId}` : "/api/v1/vehicles/";
      const method = editingId ? "put" : "post";
      const res = await apiClient[method]<TargetVehicle>(url, body);
      const saved = res.data;
      setVehicles((prev) =>
        editingId
          ? prev.map((v) => (v.id === editingId ? saved : v))
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
      await apiClient.delete(`/api/v1/vehicles/${deleteId}`);
      setVehicles((prev) => prev.filter((v) => v.id !== deleteId));
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
      {/* Header */}
      <div className="flex-none px-6 pt-6 pb-2 flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">
          Vozidla IZS
        </h2>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAiModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-300 text-blue-600 text-sm font-medium rounded-lg hover:bg-blue-50 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              AI Import
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Přidat vozidlo
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 p-6 pt-2 overflow-auto">
        <Card>
          <CardHeader className="p-4 pb-2">
            <p className="text-xs text-gray-400">{vehicles.length} záznamů</p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Název</TableHead>
                  <TableHead>Kategorie</TableHead>
                  <TableHead>Šířka</TableHead>
                  <TableHead>Délka</TableHead>
                  <TableHead>Výška</TableHead>
                  <TableHead>Hmotnost</TableHead>
                  <TableHead>Průměr otáčení (stopový)</TableHead>
                  <TableHead>Průměr otáčení (obrysový)</TableHead>
                  <TableHead>Šířka s patkami</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-gray-400 py-10">
                      Žádná vozidla. Přidejte první záznam.
                    </TableCell>
                  </TableRow>
                )}
                {vehicles.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell>{categoryLabel(v.category)}</TableCell>
                    <TableCell>{fmtCmAsM(v.width)}</TableCell>
                    <TableCell>{fmtCmAsM(v.length)}</TableCell>
                    <TableCell>{fmtCmAsM(v.height)}</TableCell>
                    <TableCell>{fmt(v.weight, "t")}</TableCell>
                    <TableCell>{fmtCmAsM(v.turning_diameter_track)}</TableCell>
                    <TableCell>{fmtCmAsM(v.turning_diameter_clearance)}</TableCell>
                    <TableCell>{fmtCmAsM(v.stabilization_width)}</TableCell>
                    <TableCell>
                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(v)}
                            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-800"
                            title="Upravit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteId(v.id)}
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
        <VehicleFormModal
          editingId={editingId}
          form={form}
          formError={formError}
          saving={saving}
          onClose={closeModal}
          onSave={handleSave}
          onFieldChange={handleField}
        />
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !deleting && setDeleteId(null)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              Smazat vozidlo?
            </h3>
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

      {aiModalOpen && (
        <AIImportModal
          onVehiclesAdded={handleVehiclesAdded}
          onClose={() => setAiModalOpen(false)}
        />
      )}
    </div>
  );
}
