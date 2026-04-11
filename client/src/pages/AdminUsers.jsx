import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import http from "../api/http";
import Spinner from "../components/Spinner";
import Modal from "../components/Modal";
import { useToast } from "../context/ToastContext";

export default function AdminUsers() {
  const { showToast } = useToast();
  const me = useMemo(() => JSON.parse(localStorage.getItem("user") || "null"), []);
  const meId = me?.id || me?._id;
  const phoneRules = useMemo(
    () => ({
      "+977": { label: "Nepal", len: 10, starts: ["97", "98"] },
      "+91": { label: "India", len: 10 },
      "+1": { label: "USA/CA", len: 10 },
      "+44": { label: "UK", len: 10 },
    }),
    []
  );

  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [items, setItems] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const initialLoadRef = useRef(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [staffBusy, setStaffBusy] = useState(false);
  const [staffForm, setStaffForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    role: "admin",
  });
  const [staffCountryCode, setStaffCountryCode] = useState("+977");
  const [resetOpen, setResetOpen] = useState(false);
  const [pwdResetBusy, setPwdResetBusy] = useState(false);
  const [resetUser, setResetUser] = useState(null);
  const [resetPassword, setResetPassword] = useState("");

  const [refreshing, setRefreshing] = useState(false);
  const [recomputeBusy, setRecomputeBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const filteredCount = useMemo(() => items.length, [items]);
  const searchRef = useRef(search);
  const roleRef = useRef(role);
  useEffect(() => {
    searchRef.current = search;
  }, [search]);
  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  const load = useCallback(
    async ({ searchTerm, roleFilter } = {}) => {
      const term = searchTerm ?? searchRef.current;
      const filter = roleFilter ?? roleRef.current;
      const isInitial = !initialLoadRef.current;
      try {
        if (isInitial) setLoading(true);
        const params = new URLSearchParams();
        if (term.trim()) params.set("search", term.trim());
        if (filter) params.set("role", filter);

        const qs = params.toString();
        const res = await http.get(`/api/admin/users${qs ? `?${qs}` : ""}`);
        const list = res.data.users || [];
        setItems(list);
        if (!term.trim() && !filter) {
          setAllItems(list);
        }
      } catch (e) {
        showToast("error", e?.response?.data?.message || "Failed to load users");
      } finally {
        setLoading(false);
        if (isInitial) {
          initialLoadRef.current = true;
          setInitialLoaded(true);
        }
      }
    },
    [showToast]
  );

  const handleRefresh = () => {
    setSuggestOpen(false);
    if (refreshing) return;
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  };

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const t = setTimeout(() => {
      load();
    }, 350);
    return () => clearTimeout(t);
  }, [load, search, role]);
  useEffect(() => {
    const onDocClick = (e) => {
      if (e.target.closest?.("details[data-action-menu]")) return;
      document.querySelectorAll("details[data-action-menu][open]").forEach((el) => {
        el.removeAttribute("open");
      });
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);
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

  const resetStaffForm = () => {
    setStaffForm({
      fullName: "",
      email: "",
      phone: "",
      password: "",
      role: "admin",
    });
    setStaffCountryCode("+977");
  };

  const updateStaffField = (field, value) => {
    setStaffForm((prev) => ({ ...prev, [field]: value }));
  };

  const createStaff = async () => {
    const phoneDigits = staffForm.phone.trim();
    const requiredPhoneLen = phoneRules[staffCountryCode]?.len || 10;
    const phoneStarts = phoneRules[staffCountryCode]?.starts || [];

    if (!phoneDigits) {
      showToast("error", "Phone is required");
      return;
    }
    if (phoneDigits.length !== requiredPhoneLen) {
      showToast("error", `Phone must be ${requiredPhoneLen} digits`);
      return;
    }
    if (staffCountryCode === "+977" && phoneStarts.length) {
      const ok = phoneStarts.some((p) => phoneDigits.startsWith(p));
      if (!ok) {
        showToast("error", "Nepal phone must start with 97 or 98");
        return;
      }
    }

    const payload = {
      fullName: staffForm.fullName.trim(),
      email: staffForm.email.trim().toLowerCase(),
      phone: `${staffCountryCode}${phoneDigits}`,
      password: staffForm.password.trim(),
      role: staffForm.role,
    };

    if (!payload.fullName || !payload.email || !payload.phone || !payload.password || !payload.role) {
      showToast("error", "All fields are required");
      return;
    }

    if (!["admin", "moderator"].includes(payload.role)) {
      showToast("error", "Role must be admin or moderator");
      return;
    }

    try {
      setStaffBusy(true);
      const res = await http.post("/api/admin/staff", payload);
      showToast("success", res.data.message || "Staff account created ✅");
      resetStaffForm();
      setStaffOpen(false);
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to create staff account");
    } finally {
      setStaffBusy(false);
    }
  };

  const openReset = (user) => {
    setResetUser(user);
    setResetPassword("");
    setResetOpen(true);
  };

  const closeReset = (force = false) => {
    if (pwdResetBusy && !force) return;
    setResetOpen(false);
    setResetUser(null);
    setResetPassword("");
  };

  const submitReset = async () => {
    if (!resetUser?._id) return;
    if (!resetPassword.trim()) {
      showToast("error", "Password is required");
      return;
    }
    try {
      setPwdResetBusy(true);
      const res = await http.patch(`/api/admin/users/${resetUser._id}/password`, {
        password: resetPassword.trim(),
      });
      showToast("success", res.data.message || "Password reset ✅");
      closeReset(true);
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to reset password");
    } finally {
      setPwdResetBusy(false);
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

  const formatResponseMinutes = (mins) => {
    if (!Number.isFinite(mins) || mins <= 0) return "—";
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const remaining = mins % 60;
    if (remaining === 0) return `${hours} hr`;
    return `${hours} hr ${remaining} min`;
  };

  const recomputeResponseStats = async () => {
    if (!confirm("Recompute response stats for all owners?")) return;
    try {
      setRecomputeBusy(true);
      const res = await http.post("/api/admin/response-stats/recompute", { mode: "recompute" });
      showToast("success", res.data.message || "Response stats recomputed ✅");
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to recompute response stats");
    } finally {
      setRecomputeBusy(false);
    }
  };

  const resetResponseStats = async () => {
    if (!confirm("Reset response stats for all owners?")) return;
    try {
      setResetBusy(true);
      const res = await http.post("/api/admin/response-stats/recompute", { mode: "reset" });
      showToast("success", res.data.message || "Response stats reset ✅");
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to reset response stats");
    } finally {
      setResetBusy(false);
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
      const selectable = items.filter((i) => i._id !== meId).map((i) => i._id);
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
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="h1">Users</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Search users and manage roles.
          </p>
        </div>
        <div className="card cardPad" style={{ padding: 8, minWidth: 260 }}>
          <div className="row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span className="muted" style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em" }}>
                STAFF
              </span>
              <button
                className="iconBtn"
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                data-tip="Refresh"
                title="Refresh"
                aria-label="Refresh"
              >
                ⟳
              </button>
              <button
                className="iconBtn"
                type="button"
                onClick={() => setStaffOpen(true)}
                data-tip="Create staff"
                title="Create staff"
                aria-label="Create staff"
              >
                +
              </button>
            </div>
            <div style={{ width: 1, height: 22, background: "#e5e7eb" }} />
            <div className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span className="muted" style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".08em" }}>
                RESPONSES
              </span>
              <details data-action-menu style={{ position: "relative" }}>
                  <summary
                    className="iconBtn detailsSummary"
                    style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    onClick={(e) => {
                      e.stopPropagation();
                    const current = e.currentTarget.closest("details");
                    document.querySelectorAll("details[data-action-menu][open]").forEach((el) => {
                      if (el !== current) el.removeAttribute("open");
                    });
                    }}
                    data-tip="Response actions"
                    aria-label="Response actions"
                    title="Response actions"
                  >
                    ⚙
                  </summary>
                <div
                  className="card cardPad"
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "110%",
                    zIndex: 10,
                    minWidth: 200,
                  }}
                >
                  <button
                    className="btn btnOutline"
                    style={{ width: "100%", justifyContent: "center" }}
                    type="button"
                    onClick={(e) => {
                      recomputeResponseStats();
                      const details = e.currentTarget.closest("details");
                      if (details) details.removeAttribute("open");
                    }}
                    disabled={recomputeBusy}
                  >
                    {recomputeBusy ? "Recomputing..." : "Recompute responses"}
                  </button>
                  <div className="spacer" />
                  <button
                    className="btn btnOutline"
                    style={{ width: "100%", justifyContent: "center" }}
                    type="button"
                    onClick={(e) => {
                      resetResponseStats();
                      const details = e.currentTarget.closest("details");
                      if (details) details.removeAttribute("open");
                    }}
                    disabled={resetBusy}
                  >
                    {resetBusy ? "Resetting..." : "Reset responses"}
                  </button>
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>

      <div className="spacer" />

      <div className="card cardPad">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div className="row" style={{ flex: "1 1 360px", minWidth: 260, gap: 8, flexWrap: "wrap" }}>
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
                        load({ searchTerm: v, roleFilter: role });
                      }}
                    >
                      <div className="searchSuggestTitle">{u.fullName || "User"}</div>
                      <div className="searchSuggestMeta">{u.email || u.phone}</div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

          <select className="input" value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 200 }}>
            <option value="">All roles</option>
            <option value="tenant">Tenant</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="moderator">Moderator</option>
          </select>
          </div>

          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
            <div className="muted" style={{ fontSize: 13 }}>
              Showing <b style={{ color: "#111827" }}>{filteredCount}</b> users
            </div>
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
            <button className="btn btnOutline" onClick={bulkDelete} disabled={!selectedIds.size || busyId === "bulk"}>
              {busyId === "bulk" ? "Deleting..." : `Delete Selected (${selectedIds.size})`}
            </button>
          </div>
        </div>
      </div>

      <div className="spacer" />

      {items.length === 0 ? (
        <div className="card cardPad">No users found.</div>
      ) : (
        <div className={`tableCard card${refreshing ? " isRefreshing" : ""}`}>
          {refreshing && (
            <div className="tableCardOverlay">
              <div className="spinner" />
              <span>Refreshing...</span>
            </div>
          )}
          <table className="table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selectedIds.size === items.filter((i) => i._id !== meId).length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Responses</th>
                <th>Avg Response</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u, index) => {
                const isBusy = busyId === u._id;
                const isMe = u._id === meId;
                const isOwner = u.role === "owner";
                const responseCount = u.responseStats?.count ?? 0;
                const responseAvg = u.responseStats?.avgMinutes ?? 0;
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
                    <td className="muted">{isOwner ? responseCount : "—"}</td>
                    <td className="muted">{isOwner ? formatResponseMinutes(responseAvg) : "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <div className="col" style={{ alignItems: "flex-end", gap: 6 }}>
                        <div className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap", gap: 6, alignItems: "center" }}>
                          {u.role === "super_admin" ? (
                            <span className="pill">Super Admin</span>
                          ) : (
                            <select
                              className="input"
                              value={u.role}
                              onChange={(e) => updateRole(u._id, e.target.value)}
                              disabled={isBusy || isMe}
                              style={{ minWidth: 110, width: 130 }}
                            >
                              <option value="tenant">Tenant</option>
                              <option value="owner">Owner</option>
                              <option value="admin">Admin</option>
                              <option value="moderator">Moderator</option>
                            </select>
                          )}
                          <details data-action-menu style={{ position: "relative" }}>
                            <summary
                              className="iconBtn detailsSummary"
                              style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                const current = e.currentTarget.closest("details");
                                document.querySelectorAll("details[data-action-menu][open]").forEach((el) => {
                                  if (el !== current) el.removeAttribute("open");
                                });
                              }}
                              data-tip="Actions"
                              aria-label="Actions"
                              title="Actions"
                            >
                              ⋮
                            </summary>
                            <div
                              className="card cardPad"
                              style={{
                                position: "absolute",
                                right: 0,
                                top: index >= items.length - 2 ? "auto" : "110%",
                                bottom: index >= items.length - 2 ? "110%" : "auto",
                                zIndex: 10,
                                minWidth: 180,
                              }}
                            >
                              {(u.role === "admin" || u.role === "moderator") && (
                                <button
                                  className="btn btnOutline"
                                  style={{ width: "100%", justifyContent: "center" }}
                                  disabled={isBusy || isMe}
                                  onClick={(e) => {
                                    openReset(u);
                                    const details = e.currentTarget.closest("details");
                                    if (details) details.removeAttribute("open");
                                  }}
                                >
                                  Reset Password
                                </button>
                              )}
                              {!isMe && (
                                <>
                                  <div className="spacer" />
                                  <button
                                    className="btn"
                                    style={{ width: "100%", justifyContent: "center" }}
                                    onClick={(e) => {
                                      deleteUser(u._id);
                                      const details = e.currentTarget.closest("details");
                                      if (details) details.removeAttribute("open");
                                    }}
                                    disabled={isBusy}
                                  >
                                    Delete user
                                  </button>
                                </>
                              )}
                            </div>
                          </details>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={staffOpen}
        title="Create staff account"
        subtitle="Admins handle KYC and platform settings. Moderators focus on flagged rooms."
        onClose={() => {
          if (!staffBusy) {
            setStaffOpen(false);
            resetStaffForm();
          }
        }}
      >
        <div className="col">
          <label className="label">Full name</label>
          <input
            className="input"
            value={staffForm.fullName}
            onChange={(e) => updateStaffField("fullName", e.target.value)}
            placeholder="Full name"
          />

          <div className="spacer" />
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            value={staffForm.email}
            onChange={(e) => updateStaffField("email", e.target.value)}
            placeholder="staff@example.com"
          />

          <div className="spacer" />
          <label className="label">Phone</label>
          <div className="row" style={{ gap: 8 }}>
            <select
              className="input"
              value={staffCountryCode}
              onChange={(e) => setStaffCountryCode(e.target.value)}
              style={{ width: 120 }}
            >
              {Object.entries(phoneRules).map(([code, meta]) => (
                <option key={code} value={code}>
                  {code} {meta.label}
                </option>
              ))}
            </select>
            <input
              className="input"
              type="tel"
              inputMode="numeric"
              value={staffForm.phone}
              onChange={(e) => updateStaffField("phone", e.target.value.replace(/\D/g, ""))}
              placeholder="Phone number"
            />
          </div>

          <div className="spacer" />
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            value={staffForm.password}
            onChange={(e) => updateStaffField("password", e.target.value)}
            placeholder="Set a login password"
          />

          <div className="spacer" />
          <label className="label">Role</label>
          <select
            className="input"
            value={staffForm.role}
            onChange={(e) => updateStaffField("role", e.target.value)}
          >
            <option value="admin">Admin</option>
            <option value="moderator">Moderator</option>
          </select>

          <div className="spacer" />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btnOutline"
              onClick={() => {
                setStaffOpen(false);
                resetStaffForm();
              }}
              disabled={staffBusy}
            >
              Cancel
            </button>
            <button type="button" className="btn" onClick={createStaff} disabled={staffBusy}>
              {staffBusy ? "Creating..." : "Create"}
            </button>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Staff can sign in with email or phone plus the password you set.
          </div>
        </div>
      </Modal>

      <Modal
        open={resetOpen}
        title="Reset staff password"
        subtitle={resetUser ? `${resetUser.fullName || "Staff"} • ${resetUser.email || resetUser.phone || ""}` : ""}
        onClose={closeReset}
      >
        <div className="col">
          <label className="label">New password</label>
          <input
            className="input"
            type="password"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            placeholder="Enter a new password"
          />
          <div className="spacer" />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn btnOutline" type="button" onClick={closeReset} disabled={pwdResetBusy}>
              Cancel
            </button>
            <button className="btn" type="button" onClick={submitReset} disabled={pwdResetBusy}>
              {pwdResetBusy ? "Resetting..." : "Reset password"}
            </button>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Share the new password with the staff member so they can sign in.
          </div>
        </div>
      </Modal>
    </div>
  );
}
