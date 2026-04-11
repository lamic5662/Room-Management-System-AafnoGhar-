import { Link } from "react-router-dom";
import { useI18n } from "../context/I18nContext";

export default function Footer() {
  const { t } = useI18n();
  return (
    <div className="footerWrap">
      <div className="footer">
        <div className="footerBrand">
          <div className="footerLogo">AafnoGhar</div>
          <div className="muted footerDesc">
            {t("A simple platform for room renting in Nepal: requests, agreements, rent tracking and complaints.")}
          </div>
          <div className="footerNote">{t("Build trust. Rent smarter.")}</div>
        </div>

        <div className="footerCols">
          <div className="footerCol">
            <div className="footerTitle">{t("Explore")}</div>
            <Link to="/rooms" className="footerLink">{t("Rooms")}</Link>
            <Link to="/register" className="footerLink">{t("Register")}</Link>
            <Link to="/login" className="footerLink">{t("Login")}</Link>
          </div>

          <div className="footerCol">
            <div className="footerTitle">{t("Owner")}</div>
            <Link to="/owner/dashboard" className="footerLink">{t("Dashboard")}</Link>
            <Link to="/owner/my-rooms" className="footerLink">{t("My Rooms")}</Link>
            <Link to="/owner/requests" className="footerLink">{t("Requests")}</Link>
          </div>

          <div className="footerCol">
            <div className="footerTitle">{t("Tenant")}</div>
            <Link to="/tenant/dashboard" className="footerLink">{t("Dashboard")}</Link>
            <Link to="/tenant/agreements" className="footerLink">{t("Agreements")}</Link>
            <Link to="/tenant/payments" className="footerLink">{t("Payments")}</Link>
            <Link to="/tenant/saved-searches" className="footerLink">{t("Saved searches")}</Link>
          </div>
        </div>
      </div>

      <div className="footerBottom">
        <span className="muted">© {new Date().getFullYear()} AafnoGhar</span>
        <span className="muted">{t("Built with MERN")}</span>
      </div>
    </div>
  );
}
