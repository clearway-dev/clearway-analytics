import { useEffect, useState } from "react";
import { Pencil, Trash2, Plus, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import {
  Table, TableHeader, TableBody, TableRow,
  TableHead, TableCell,
} from "../components/ui/table";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const CATEGORIES: { value: string; label: string }[] = [
  { value: "fire_truck", label: "Hasičský vůz" },
  { value: "ambulance", label: "Sanitka" },
  { value: "police", label: "Policie" },
  { value: "rescue", label: "Záchranáři" },
  { value: "other", label: "Jiné" },
];

function categoryLabel(value: string | null): string {
  if (!value) return "—";
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

interface TargetVehicle {
  id: string;
  name: string;
  category: string | null;
  width: number | null;
  height: number | null;
  weight: number | null;
  turning_radius_inner: number | null;
  turning_radius_outer: number | null;
}

interface FormState {
  name: string;
  category: string;
  width: string;
  height: string;
  weight: string;
  turning_radius_inner: string;
  turning_radius_outer: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  category: "",
  width: "",
  height: "",
  weight: "",
  turning_radius_inner: "",
  turning_radius_outer: "",
};

function toFormState(v: TargetVehicle): FormState {
  return {
    name: v.name,
    category: v.category ?? "",
    width: v.width != null ? String(v.width) : "",
    height: v.height != null ? String(v.height) : "",
    weight: v.weight != null ? String(v.weight) : "",
    turning_radius_inner: v.turning_radius_inner != null ? String(v.turning_radius_inner) : "",
    turning_radius_outer: v.turning_radius_outer != null ? String(v.turning_radius_outer) : "",
  };
}

function parseOptionalFloat(s: string): number | null {
  const v = parseFloat(s);
  return s.trim() === "" || isNaN(v) ? null : v;
}

function fmt(value: number | null, unit: string): string {
  return value != null ? `${value} ${unit}` : "—";
}

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<TargetVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ------------------------------------------------------------------
  // Load
  // ------------------------------------------------------------------
  useEffect(() => {
    fetch(`${API_URL}/api/vehicles/`)
      .then((r) => r.json())
      .then((data) => {
        setVehicles(data);
        setLoading(false);
      })
      .catch(() => {
        setPageError("Nepodařilo se načíst data.");
        setLoading(false);
      });
  }, []);

  // ------------------------------------------------------------------
  // Modal helpers
  // ------------------------------------------------------------------
  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
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

  // ------------------------------------------------------------------
  // Save (create / update)
  // ------------------------------------------------------------------
  async function handleSave() {
    if (!form.name.trim()) {
      setFormError("Název je povinný.");
      return;
    }

    const body = {
      name: form.name.trim(),
      category: form.category || null,
      width: parseOptionalFloat(form.width),
      height: parseOptionalFloat(form.height),
      weight: parseOptionalFloat(form.weight),
      turning_radius_inner: parseOptionalFloat(form.turning_radius_inner),
      turning_radius_outer: parseOptionalFloat(form.turning_radius_outer),
    };

    setSaving(true);
    setFormError(null);

    try {
      const url = editingId
        ? `${API_URL}/api/vehicles/${editingId}`
        : `${API_URL}/api/vehicles/`;
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFormError(err?.detail ?? "Uložení selhalo.");
        return;
      }

      const saved: TargetVehicle = await res.json();

      setVehicles((prev) =>
        editingId
          ? prev.map((v) => (v.id === editingId ? saved : v))
          : [...prev, saved].sort((a, b) => a.name.localeCompare(b.name))
      );
      setModalOpen(false);
    } catch {
      setFormError("Síťová chyba.");
    } finally {
      setSaving(false);
    }
  }

  // ------------------------------------------------------------------
  // Delete
  // ------------------------------------------------------------------
  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fetch(`${API_URL}/api/vehicles/${deleteId}`, { method: "DELETE" });
      setVehicles((prev) => prev.filter((v) => v.id !== deleteId));
    } finally {
      setDeleteId(null);
      setDeleting(false);
    }
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex justify-center items-center h-full text-gray-500">
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
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Přidat vozidlo
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 p-6 pt-2 overflow-y-auto">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm text-gray-500 font-normal">
              {vehicles.length} záznamů
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Název</TableHead>
                  <TableHead>Kategorie</TableHead>
                  <TableHead>Šířka</TableHead>
                  <TableHead>Výška</TableHead>
                  <TableHead>Hmotnost</TableHead>
                  <TableHead>Vnitřní poloměr</TableHead>
                  <TableHead>Vnější poloměr</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-gray-400 py-10">
                      Žádná vozidla. Přidejte první záznam.
                    </TableCell>
                  </TableRow>
                )}
                {vehicles.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell>{categoryLabel(v.category)}</TableCell>
                    <TableCell>{fmt(v.width, "m")}</TableCell>
                    <TableCell>{fmt(v.height, "m")}</TableCell>
                    <TableCell>{fmt(v.weight, "t")}</TableCell>
                    <TableCell>{fmt(v.turning_radius_inner, "m")}</TableCell>
                    <TableCell>{fmt(v.turning_radius_outer, "m")}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(v)}
                          className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-800"
                          title="Upravit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteId(v.id)}
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

      {/* ------------------------------------------------------------------ */}
      {/* Add / Edit modal                                                     */}
      {/* ------------------------------------------------------------------ */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeModal}
          />
          {/* panel */}
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingId ? "Upravit vozidlo" : "Nové vozidlo"}
              </h3>
              <button
                onClick={closeModal}
                className="p-1 hover:bg-gray-100 rounded text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Název <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleField("name", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="např. Tatra 815"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kategorie
                </label>
                <select
                  value={form.category}
                  onChange={(e) => handleField("category", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">— Nevybráno —</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Numeric grid */}
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["width", "Šířka (m)"],
                    ["height", "Výška (m)"],
                    ["weight", "Hmotnost (t)"],
                    ["turning_radius_inner", "Vnitřní poloměr otáčení (m)"],
                    ["turning_radius_outer", "Vnější poloměr otáčení (m)"],
                  ] as [keyof FormState, string][]
                ).map(([field, label]) => (
                  <div key={field} className={field === "turning_radius_outer" && form.turning_radius_inner === "" ? "" : ""}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {label}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form[field]}
                      onChange={(e) => handleField(field, e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="volitelné"
                    />
                  </div>
                ))}
              </div>

              {formError && (
                <p className="text-sm text-red-500">{formError}</p>
              )}
            </div>

            {/* Actions */}
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

      {/* ------------------------------------------------------------------ */}
      {/* Delete confirmation                                                  */}
      {/* ------------------------------------------------------------------ */}
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
            <p className="text-sm text-gray-500 mb-5">
              Tato akce je nevratná.
            </p>
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
