import { NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import http from "../api/http";
import { getPhotoUrl } from "../utils/photo";
import { useI18n } from "../context/I18nContext";
import { useNotifications } from "../context/NotificationContext";

export default function Navbar() {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem("user") || "null"));
  const [langOpen, setLangOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [kycSummary, setKycSummary] = useState({ pending: 0, approved: 0 });
  const { lang, setLang, t } = useI18n();
  const { items: notifications, unread, markRead, markAllRead, deleteNotification } = useNotifications();
  const location = useLocation();
  const menuRef = useRef(null);
  const notifRef = useRef(null);

  const loadKycSummary = async () => {
    try {
      const res = await http.get("/api/kyc/summary");
      setKycSummary(res.data || { pending: 0, approved: 0 });
    } catch {
      // ignore
    }
  };

  const navClass = ({ isActive }) =>
    "navItem " + (isActive ? "navActive" : "");

  const Icon = ({ children }) => <span className="navIcon">{children}</span>;
  const dashPath =
    user?.role === "admin"
      ? "/admin/dashboard"
      : user?.role === "owner"
        ? "/owner/dashboard"
        : user?.role === "tenant"
          ? "/tenant/dashboard"
          : "/";

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    navigate("/login");
  };

  useEffect(() => {
    const sync = () => {
      setUser(JSON.parse(localStorage.getItem("user") || "null"));
    };
    window.addEventListener("storage", sync);
    window.addEventListener("auth:updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("auth:updated", sync);
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (user?.role !== "admin") {
      setKycSummary({ pending: 0, approved: 0 });
      return;
    }
    loadKycSummary();
  }, [user?.role]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("click", onDocClick);
    }
    return () => document.removeEventListener("click", onDocClick);
  }, [menuOpen]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!notifRef.current) return;
      if (!notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    if (notifOpen) {
      document.addEventListener("click", onDocClick);
    }
    return () => document.removeEventListener("click", onDocClick);
  }, [notifOpen]);

  const formatTime = (iso) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return "";
    }
  };

  const resolveNotifUrl = (n) => {
    if (!n) return null;
    const direct = n.data?.url;
    if (direct) return direct;
    if (n.data?.roomId && !n.data?.url && n.type === "room") {
      return `/rooms/${n.data.roomId}`;
    }
    switch (n.type) {
      case "request":
        return user?.role === "owner" ? "/owner/requests" : "/tenant/requests";
      case "offer":
        return user?.role === "owner" ? "/owner/offers" : "/tenant/offers";
      case "agreement":
        return user?.role === "owner" ? "/owner/agreements" : "/tenant/agreements";
      case "payment":
        return user?.role === "owner" ? "/owner/payments" : "/tenant/payments";
      case "electricity":
        return "/tenant/payments";
      case "complaint":
        return user?.role === "owner" ? "/owner/complaints" : "/tenant/complaints";
      case "exit":
        return user?.role === "owner" ? "/owner/exits" : "/tenant/exits";
      case "kyc":
        return user?.role === "admin" ? "/admin/kyc" : user?.role === "owner" ? "/owner/kyc" : "/tenant/kyc";
      case "fraud":
        return "/admin/flagged-rooms";
      default:
        return null;
    }
  };

  const onNotifClick = (n) => {
    markRead(n._id);
    setNotifOpen(false);
    const url = resolveNotifUrl(n);
    if (url) navigate(url);
  };


  return (
    <div className="navWrap">
      <div className="navBar">
        <Link to="/" className="logo">
          <span className="logoMark">A</span>
          <span className="logoText">
            AafnoGhar
            <span className="logoSlogan">Build trust. Rent smarter.</span>
          </span>
        </Link>

        <div className="navLinks">

          {user?.role === "tenant" && (
            <>
              <NavLink className={navClass} to="/tenant/dashboard">
                <Icon>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 13h7V4H4v9zm9 7h7V4h-7v16zM4 20h7v-5H4v5z" />
                  </svg>
                </Icon>
                {t("Dashboard")}
              </NavLink>
              <div ref={menuRef} className={`navMenu ${menuOpen ? "open" : ""}`}>
                <button className="navMenuBtn" type="button" onClick={() => setMenuOpen((v) => !v)}>
                  <span aria-hidden="true">☰</span> {t("Menu")}
                </button>
                <div className="navMenuList">
                  <NavLink className="navMenuItem" to="/tenant/requests" onClick={() => setMenuOpen(false)}>{t("Requests")}</NavLink>
                  <NavLink className="navMenuItem" to="/tenant/offers" onClick={() => setMenuOpen(false)}>{t("My Offers")}</NavLink>
                  <NavLink className="navMenuItem" to="/tenant/agreements" onClick={() => setMenuOpen(false)}>{t("Agreements")}</NavLink>
                  <NavLink className="navMenuItem" to="/tenant/payments" onClick={() => setMenuOpen(false)}>{t("Payments")}</NavLink>
                  <NavLink className="navMenuItem" to="/tenant/complaints" onClick={() => setMenuOpen(false)}>{t("Complaints")}</NavLink>
                  <NavLink className="navMenuItem" to="/tenant/exits" onClick={() => setMenuOpen(false)}>{t("Exits")}</NavLink>
                  <NavLink className="navMenuItem" to="/tenant/kyc" onClick={() => setMenuOpen(false)}>{t("KYC")}</NavLink>
                </div>
              </div>
            </>
          )}

          {user?.role === "owner" && (
            <>
              <NavLink className={navClass} to="/owner/dashboard">
                <Icon>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 13h7V4H4v9zm9 7h7V4h-7v16zM4 20h7v-5H4v5z" />
                  </svg>
                </Icon>
                {t("Dashboard")}
              </NavLink>
              <div ref={menuRef} className={`navMenu ${menuOpen ? "open" : ""}`}>
                <button className="navMenuBtn" type="button" onClick={() => setMenuOpen((v) => !v)}>
                  <span aria-hidden="true">☰</span> {t("Menu")}
                </button>
                <div className="navMenuList">
                  <NavLink className="navMenuItem" to="/owner/my-rooms" onClick={() => setMenuOpen(false)}>{t("My Rooms")}</NavLink>
                  <NavLink className="navMenuItem" to="/owner/add-room" onClick={() => setMenuOpen(false)}>{t("Add Room")}</NavLink>
                  <NavLink className="navMenuItem" to="/owner/requests" onClick={() => setMenuOpen(false)}>{t("Requests")}</NavLink>
                  <NavLink className="navMenuItem" to="/owner/agreements" onClick={() => setMenuOpen(false)}>{t("Agreements")}</NavLink>
                  <NavLink className="navMenuItem" to="/owner/payments" onClick={() => setMenuOpen(false)}>{t("Payments")}</NavLink>
                  <NavLink className="navMenuItem" to="/owner/complaints" onClick={() => setMenuOpen(false)}>{t("Complaints")}</NavLink>
                  <NavLink className="navMenuItem" to="/owner/exits" onClick={() => setMenuOpen(false)}>{t("Exits")}</NavLink>
                  <NavLink className="navMenuItem" to="/owner/offers" onClick={() => setMenuOpen(false)}>{t("Offers")}</NavLink>
                  <NavLink className="navMenuItem" to="/owner/kyc" onClick={() => setMenuOpen(false)}>{t("KYC")}</NavLink>
                </div>
              </div>
            </>
          )}

          {user?.role === "admin" && (
            <>
              <NavLink className={navClass} to="/admin/dashboard">
                <Icon>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 13h7V4H4v9zm9 7h7V4h-7v16zM4 20h7v-5H4v5z" />
                  </svg>
                </Icon>
                {t("Dashboard")}
              </NavLink>
              <div ref={menuRef} className={`navMenu ${menuOpen ? "open" : ""}`}>
                <button className="navMenuBtn" type="button" onClick={() => setMenuOpen((v) => !v)}>
                  <span aria-hidden="true">☰</span> {t("Menu")}
                </button>
                <div className="navMenuList">
                  <NavLink className="navMenuItem" to="/admin/users" onClick={() => setMenuOpen(false)}>{t("Users")}</NavLink>
                  <NavLink className="navMenuItem" to="/admin/flagged-rooms" onClick={() => setMenuOpen(false)}>{t("Flagged Rooms")}</NavLink>
                  <NavLink className="navMenuItem" to="/admin/kyc" onClick={() => setMenuOpen(false)}>
                    {t("KYC")}
                    <span
                      className="badge"
                      style={{ marginLeft: 6, padding: "4px 8px", fontSize: 11 }}
                    >
                      {kycSummary.pending}/{kycSummary.approved}
                    </span>
                  </NavLink>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="navRight">
          {user?.role ? (
            <NavLink className="navIconBtn navDashBtn" to={dashPath} aria-label={t("Dashboard")}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 13h7V4H4v9zm9 7h7V4h-7v16zM4 20h7v-5H4v5z" />
              </svg>
            </NavLink>
          ) : null}
          <NavLink className="navIconBtn" to="/rooms" aria-label={t("Rooms")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9z" />
            </svg>
          </NavLink>
          {user?.role ? (
            <div className="navNotif" ref={notifRef}>
              <button
                type="button"
                className="navIconBtn"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label={t("Notifications")}
                title={t("Notifications")}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 1 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z" />
                </svg>
                {unread > 0 ? <span className="navNotifBadge">{unread}</span> : null}
              </button>

              {notifOpen && (
                <div className="navNotifPanel">
                  <div className="navNotifHeader">
                    <div className="navNotifTitle">{t("Notifications")}</div>
                    <button className="navNotifMark" type="button" onClick={markAllRead}>
                      {t("Mark all")}
                    </button>
                  </div>

                  {notifications.length === 0 ? (
                    <div className="navNotifEmpty">{t("No notifications yet.")}</div>
                  ) : (
                    <div className="navNotifList">
                      {notifications.slice(0, 10).map((n) => (
                        <div key={n._id} className="navNotifItemWrap">
                          <button
                            type="button"
                            className={"navNotifItem " + (n.read ? "read" : "unread")}
                            onClick={() => onNotifClick(n)}
                          >
                            <div className="navNotifItemTitle">{n.title}</div>
                            {n.message ? <div className="navNotifItemMsg">{n.message}</div> : null}
                            <div className="navNotifTime">{formatTime(n.createdAt)}</div>
                          </button>
                          {n.read && (
                            <button
                              type="button"
                              className="navNotifDelete"
                              aria-label={t("Delete notification")}
                              onClick={(event) => {
                                event.stopPropagation();
                                deleteNotification(n._id);
                              }}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
          <div className="navLangMenu">
            <button
              type="button"
              className="navLangBtn"
              onClick={() => setLangOpen((v) => !v)}
              title={t("Language")}
              aria-label="Language"
            >
              🌐
            </button>
            {langOpen && (
              <div className="navLangList">
                <button
                  type="button"
                  className={"navLangItem " + (lang === "en" ? "active" : "")}
                  onClick={() => { setLang("en"); setLangOpen(false); }}
                >
                  EN
                </button>
                <button
                  type="button"
                  className={"navLangItem " + (lang === "ne" ? "active" : "")}
                  onClick={() => { setLang("ne"); setLangOpen(false); }}
                >
                  NP
                </button>
              </div>
            )}
          </div>

          {!user ? (
            <div className="row">
              <Link className="btn btnOutline" to="/login">{t("Login")}</Link>
              <Link className="btn" to="/register">{t("Register")}</Link>
            </div>
          ) : (
            <div className="navUser">
              <div className="navAvatar">
                {user.avatarUrl ? (
                  <img src={getPhotoUrl(user.avatarUrl)} alt="avatar" />
                ) : (
                  (user.fullName || "U")[0]
                )}
              </div>
              <Link className="navUserLink" to="/profile">
                <div className="navUserInfo">
                  <div className="navUserName">{user.fullName}</div>
                  <div className="navUserRole">{user.role}</div>
                </div>
              </Link>
              <button className="navIconBtn" onClick={logout} title={t("Logout")} aria-label={t("Logout")}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M10 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-8v-2h7V5h-7V3zm-6 9 4-4v3h7v2H8v3l-4-4z" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
