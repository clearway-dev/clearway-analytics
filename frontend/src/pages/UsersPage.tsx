import { useEffect, useState } from "react";
import { Pencil, Trash2, Plus, X, ShieldCheck, User as UserIcon, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import {
  Table, TableHeader, TableBody, TableRow,
  TableHead, TableCell,
} from "../components/ui/table";
import apiClient from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

interface UserRecord {
  id: number;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
}

interface FormState {
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  password: string;
}

const EMPTY_FORM: FormState = {
  email: "",
  full_name: "",
  role: "dispatcher",
  is_active: true,
  password: "",
};

function toFormState(u: UserRecord): FormState {
  return {
    email: u.email,
    full_name: u.full_name ?? "",
    role: u.role,
    is_active: u.is_active,
    password: "",
  };
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    apiClient.get<UserRecord[]>("/api/auth/users")
      .then((r) => { setUsers(r.data); setLoading(false); })
      .catch(() => { setPageError("Nepodařilo se načíst uživatele."); setLoading(false); });
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(u: UserRecord) {
    setEditingId(u.id);
    setForm(toFormState(u));
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
  }

  function handleField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!form.email.trim()) { setFormError("E-mail je povinný."); return; }
    if (!editingId && !form.password.trim()) { setFormError("Heslo je povinné při vytváření účtu."); return; }

    const body = {
      email: form.email.trim(),
      full_name: form.full_name.trim() || null,
      role: form.role,
      is_active: form.is_active,
      ...(form.password.trim() ? { password: form.password } : {}),
    };

    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        const res = await apiClient.put<UserRecord>(`/api/auth/users/${editingId}`, body);
        setUsers((prev) => prev.map((u) => (u.id === editingId ? res.data : u)));
      } else {
        const res = await apiClient.post<UserRecord>("/api/auth/users", body);
        setUsers((prev) => [...prev, res.data].sort((a, b) => a.id - b.id));
      }
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
      await apiClient.delete(`/api/auth/users/${deleteId}`);
      setUsers((prev) => prev.filter((u) => u.id !== deleteId));
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(detail ?? "Smazání selhalo.");
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
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Správa uživatelů</h2>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Přidat uživatele
        </button>
      </div>

      <div className="flex-1 p-6 pt-2 overflow-auto">
        <Card>
          <CardHeader className="p-4 pb-2">
            <p className="text-xs text-gray-400">{users.length} uživatelů</p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jméno</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Stav</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-gray-400 py-10">
                      Žádní uživatelé.
                    </TableCell>
                  </TableRow>
                )}
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {u.role === "admin"
                          ? <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0" />
                          : <UserIcon className="w-4 h-4 text-gray-400 shrink-0" />
                        }
                        {u.full_name ?? <span className="text-gray-400 italic">—</span>}
                        {u.id === currentUser?.id && (
                          <span className="text-xs text-gray-400">(já)</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">{u.email}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                        u.role === "admin"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {u.role === "admin" ? "Admin" : "Dispečer"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                        u.is_active
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-600"
                      }`}>
                        {u.is_active ? "Aktivní" : "Deaktivován"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(u)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-800"
                          title="Upravit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteId(u.id)}
                          disabled={u.id === currentUser?.id}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                          title={u.id === currentUser?.id ? "Nelze smazat vlastní účet" : "Smazat"}
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
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingId ? "Upravit uživatele" : "Nový uživatel"}
              </h3>
              <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded-lg text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  E-mail <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => handleField("email", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="uzivatel@hzs.cz"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Celé jméno</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => handleField("full_name", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Jan Novák"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Heslo {editingId ? "(ponechte prázdné pro beze změny)" : <span className="text-red-500">*</span>}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => handleField("password", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={editingId ? "Nové heslo (volitelné)" : "Heslo"}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => handleField("role", e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="dispatcher">Dispečer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stav</label>
                  <select
                    value={form.is_active ? "1" : "0"}
                    onChange={(e) => handleField("is_active", e.target.value === "1")}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="1">Aktivní</option>
                    <option value="0">Deaktivován</option>
                  </select>
                </div>
              </div>

              {formError && <p className="text-sm text-red-500">{formError}</p>}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={closeModal}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                Zrušit
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Ukládám…" : "Uložit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !deleting && setDeleteId(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Smazat uživatele?</h3>
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
