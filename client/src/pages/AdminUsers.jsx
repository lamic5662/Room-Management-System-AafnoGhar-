import { useEffect, useMemo, useState } from "react";
import http from "../api/http";
import Spinner from "../components/Spinner";
import { useToast } from "../context/ToastContext";

export default function AdminUsers() {
  const { showToast } = useToast();
  const me = useMemo(() => JSON.parse(localStorage.getItem("user") || "null"), []);

  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [items, setItems] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);

  const filteredCount = useMemo(() => items.length, [items]);

  const load = async () => {
    try {
      if (!initialLoaded) setLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (role) params.set("role", role);

      const qs = params.toString();
      const res = await http.get(`/api/admin/users${qs ? `?${qs}` : ""}`);
      const list = res.data.users || [];
      setItems(list);
      if (!search.trim() && !role) {
        setAllItems(list);
      }
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to load users");
    } finally {
      setLoading(false);
      if (!initialLoaded) setInitialLoaded(true);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      load();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, role]);
  useEffect(() => {
    // remove selections that no longer exist
    setSelectedIds((prev) => {
      const next = new Set();
      const ids = new Set(items.map((i) => i._id));
      prev.forEach((id) => {
        if (ids.has(id)) next.add(id);
      });
      return next;
    });
  }, [items]);

  const updateRole = async (id, newRole) => {
    try {
      setBusyId(id);
      await http.patch(`/api/admin/users/${id}/role`, { role: newRole });
      showToast("success", "Role updated ✅");
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Role update failed");
    } finally {
      setBusyId("");
    }
  };

  const suggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const source = allItems.length ? allItems : items;
    return source
      .filter((u) => {
        const name = (u.fullName || "").toLowerCase();
        const email = (u.email || "").toLowerCase();
        const phone = (u.phone || "").toLowerCase();
        return name.includes(q) || email.includes(q) || phone.includes(q);
      })
      .slice(0, 6);
  }, [search, allItems, items]);

  const deleteUser = async (id) => {
    if (!confirm("Delete this user and all related data?")) return;
    try {
      setBusyId(id);
      const res = await http.delete(`/api/admin/users/${id}`);
      showToast("success", res.data.message || "User deleted ✅");
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Delete failed");
    } finally {
      setBusyId("");
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const selectable = items.filter((i) => i._id !== me?.id).map((i) => i._id);
      if (selectable.length && prev.size === selectable.length) return new Set();
      return new Set(selectable);
    });
  };

  const bulkDelete = async () => {
    if (!selectedIds.size) return;
    if (!confirm(`Delete ${selectedIds.size} user(s) and all related data?`)) return;
    let failed = 0;
    try {
      setBusyId("bulk");
      for (const id of selectedIds) {
        try {
          await http.delete(`/api/admin/users/${id}`);
        } catch (e) {
          failed += 1;
        }
      }
      if (failed) {
        showToast("error", `${failed} user(s) could not be deleted`);
      } else {
        showToast("success", "Users deleted ✅");
      }
      setSelectedIds(new Set());
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Bulk delete failed");
    } finally {
      setBusyId("");
    }
  };

  if (loading && !initialLoaded) return <Spinner text="Loading users..." />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">Users</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Search users and manage roles.
          </p>
        </div>
        <button className="btn btnOutline" onClick={load}>Refresh</button>
      </div>

      <div className="spacer" />

      <div className="card cardPad">
        <div className="row" style={{ flexWrap: "wrap" }}>
          <div className="suggestWrap" style={{ flex: 1, minWidth: 240 }}>
            <input
              className="input"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 120)}
              placeholder="Search name / email / phone..."
              style={{ width: "100%" }}
            />
            {suggestOpen && suggestions.length ? (
              <div className="searchSuggest">
                {suggestions.map((u) => (
                  <button
                    key={u._id}
                    type="button"
                    className="searchSuggestItem"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const v = u.fullName || u.email || u.phone || "";
                      setSearch(v);
                      setSuggestOpen(false);
                      load();
                    }}
                  >
                    <div className="searchSuggestTitle">{u.fullName || "User"}</div>
                    <div className="searchSuggestMeta">{u.email || u.phone}</div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <select className="input" value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 180 }}>
            <option value="">All roles</option>
            <option value="tenant">Tenant</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
          </select>

          <button
            className="btn btnOutline"
            type="button"
            onClick={() => {
              setSearch("");
              setRole("");
              setSuggestOpen(false);
            }}
          >
            Reset
          </button>

          <div className="muted" style={{ fontSize: 13 }}>
            Showing <b style={{ color: "#111827" }}>{filteredCount}</b> users
          </div>
          <button className="btn btnOutline" onClick={bulkDelete} disabled={!selectedIds.size || busyId === "bulk"}>
            {busyId === "bulk" ? "Deleting..." : `Delete Selected (${selectedIds.size})`}
          </button>
        </div>
      </div>

      <div className="spacer" />

      {items.length === 0 ? (
        <div className="card cardPad">No users found.</div>
      ) : (
        <div className="tableCard card">
          <table className="table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selectedIds.size === items.filter((i) => i._id !== me?.id).length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => {
                const isBusy = busyId === u._id;
                const isMe = u._id === me?.id;
                return (
                  <tr key={u._id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(u._id)}
                        onChange={() => toggleSelect(u._id)}
                        disabled={isMe}
                      />
                    </td>
                    <td style={{ fontWeight: 900 }}>{u.fullName}</td>
                    <td className="muted">{u.email}</td>
                    <td className="muted">{u.phone}</td>
                    <td>
                      <span className="badge">{(u.role || "").toUpperCase()}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                        <button
                          className="btn btnOutline"
                          disabled={isBusy || u.role === "tenant"}
                          onClick={() => updateRole(u._id, "tenant")}
                        >
                          Tenant
                        </button>
                        <button
                          className="btn btnOutline"
                          disabled={isBusy || u.role === "owner"}
                          onClick={() => updateRole(u._id, "owner")}
                        >
                          Owner
                        </button>
                        <button
                          className="btn"
                          disabled={isBusy || u.role === "admin"}
                          onClick={() => updateRole(u._id, "admin")}
                        >
                          {isBusy ? "Updating..." : "Admin"}
                        </button>
                        <button
                          className="iconBtn"
                          title="Delete user"
                          onClick={() => deleteUser(u._id)}
                          disabled={isBusy || isMe}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
