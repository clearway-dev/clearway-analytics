import { X } from "lucide-react";
import { CATEGORIES, type FormState } from "./vehicleFormTypes";

interface VehicleFormModalProps {
  editingId: string | null;
  form: FormState;
  formError: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onFieldChange: (field: keyof FormState, value: string) => void;
}

export default function VehicleFormModal({
  editingId,
  form,
  formError,
  saving,
  onClose,
  onSave,
  onFieldChange,
}: VehicleFormModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* panel */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-gray-900">
            {editingId ? "Upravit vozidlo" : "Nové vozidlo"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Název <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => onFieldChange("name", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="např. CAS 24 SCANIA"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kategorie
            </label>
            <select
              value={form.category}
              onChange={(e) => onFieldChange("category", e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
                ["length", "Délka (m)"],
                ["height", "Výška (m)"],
                ["weight", "Hmotnost (t)"],
                ["turning_diameter_track", "Průměr otáčení stopový (m)"],
                ["turning_diameter_clearance", "Průměr otáčení obrysový (m)"],
                ["stabilization_width", "Šířka s patkami (m)"],
              ] as [keyof FormState, string][]
            ).map(([field, label]) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {label}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form[field]}
                  onChange={(e) => onFieldChange(field, e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="volitelné"
                />
              </div>
            ))}
          </div>

          {formError && <p className="text-sm text-red-500">{formError}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            Zrušit
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? "Ukládám…" : "Uložit"}
          </button>
        </div>
      </div>
    </div>
  );
}
