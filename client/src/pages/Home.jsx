import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import http from "../api/http";
import Spinner from "../components/Spinner";
import { useToast } from "../context/ToastContext";
import { getPhotoUrl } from "../utils/photo";
import { useI18n } from "../context/I18nContext";

export default function Home() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { t } = useI18n();

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [featured, setFeatured] = useState([]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/rooms/featured");
      setFeatured(res.data.rooms || []);
    } catch (e) {
      try {
        const res2 = await http.get("/api/rooms?sort=newest");
        setFeatured((res2.data.rooms || []).slice(0, 6));
      } catch (e2) {
        showToast("error", "Failed to load rooms");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const goSearch = () => {
    const q = search.trim();
    if (!q) return navigate("/rooms");
    navigate(`/rooms?search=${encodeURIComponent(q)}`);
  };

  return (
    <div className="homeWrap">
      <section className="homeHero">
        <div className="heroGrid">
          <div className="heroCopy">
            <div className="heroBadge">AafnoGhar • Nepal</div>
            <h1 className="heroTitle">{t("Find your next room in Nepal — fast, safe, and simple.")}</h1>
            <p className="heroSub">{t("Browse listings, send requests, sign agreements, and pay rent with tracking.")}</p>

            <div className="heroSearch">
              <div className="searchPill">
                <span className="searchIcon" aria-hidden="true">⌕</span>
                <input
                  className="heroInput"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("Search by location (Kathmandu, Lalitpur...)")}
                  onKeyDown={(e) => e.key === "Enter" && goSearch()}
                />
              </div>
              <button className="btn heroBtn" onClick={goSearch}>{t("Search")}</button>
            </div>

            <div className="heroActions">
              <Link className="btn btnOutline" to="/rooms">{t("Browse Rooms")}</Link>
              <Link className="btn" to="/register">{t("Get Started")}</Link>
            </div>

            <div className="heroChips">
              <span className="chip">{t("Verified Owners")}</span>
              <span className="chip">{t("Smart Requests")}</span>
              <span className="chip">{t("Rent Tracking")}</span>
            </div>
          </div>

          <div className="heroVisual">
            <div className="heroOrb" />
            <div className="heroGridlines" />
            <div className="heroCardStack">
              <div className="heroCardMain">
                <div className="heroCardHeader">
                  <span className="heroCardBrand">AAFNO</span>
                  <span className="heroCardTag">{t("Verified")}</span>
                </div>
                <div className="heroCardTitle">1BHK near Boudha</div>
                <div className="heroCardMeta">Kathmandu • Balcony • Water</div>
                <div className="heroCardPrice">NPR 14,500 /mo</div>
                <div className="heroCardBadges">
                  <span className="badge">{t("WiFi")}</span>
                  <span className="badge">{t("Parking")}</span>
                  <span className="badge">{t("Kitchen")}</span>
                </div>
              </div>

              <div className="heroCardMini">
                <div className="heroMiniTitle">{t("Smart workflow")}</div>
                <ul className="heroList">
                  <li>{t("Shortlist verified rooms")}</li>
                  <li>{t("Negotiate price fast")}</li>
                  <li>{t("Agreements & rules")}</li>
                  <li>{t("Track rent & issues")}</li>
                </ul>
                <div className="workflowRow">
                  <div className="flowStep"><span className="flowNum">1</span>{t("Shortlist")}</div>
                  <div className="flowStep"><span className="flowNum">2</span>{t("Negotiate")}</div>
                  <div className="flowStep"><span className="flowNum">3</span>{t("Sign")}</div>
                  <div className="flowStep"><span className="flowNum">4</span>{t("Pay")}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="spacer" />

      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <div className="sectionLabel">{t("Highlights")}</div>
          <h2 className="sectionTitle">{t("Features")}</h2>
          <div className="sectionSub">{t("Why people love AafnoGhar.")}</div>
        </div>
      </div>

      <div className="spacer" />

      <div className="featureGrid">
        <div className="featureCard card cardPad">
          <div className="featureIcon">🛡️</div>
          <div className="featureTitle">{t("Verified Owners")}</div>
          <div className="muted featureText">{t("KYC verified owners build trust and safety.")}</div>
        </div>
        <div className="featureCard card cardPad">
          <div className="featureIcon">⚡</div>
          <div className="featureTitle">{t("Smart Requests")}</div>
          <div className="muted featureText">{t("Send requests, get approvals, and move fast.")}</div>
        </div>
        <div className="featureCard card cardPad">
          <div className="featureIcon">✍️</div>
          <div className="featureTitle">{t("Agreements")}</div>
          <div className="muted featureText">{t("Digital agreements with signatures and PDF export.")}</div>
        </div>
        <div className="featureCard card cardPad">
          <div className="featureIcon">📌</div>
          <div className="featureTitle">{t("Rent Tracking")}</div>
          <div className="muted featureText">{t("Payments are recorded and confirmed by owners.")}</div>
        </div>
      </div>

      <div className="spacer" />

      <div className="featuredWrap">
        <div className="featuredHeader row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <div className="sectionLabel">{t("Trending")}</div>
            <h2 className="sectionTitle">{t("Featured Rooms")}</h2>
            <div className="sectionSub">{t("Newest listings from owners.")}</div>
          </div>
          <Link className="btn btnOutline" to="/rooms">{t("View All")}</Link>
        </div>

        <div className="spacer" />

        {loading ? (
          <Spinner text={t("Loading featured rooms...")} />
        ) : featured.length === 0 ? (
          <div className="card cardPad">{t("No featured rooms yet.")}</div>
        ) : (
          <div className="featuredGrid">
            {featured.map((r) => {
              const img = r.photos?.[0] ? getPhotoUrl(r.photos[0]) : "";
              const isVerified = r.isVerifiedOwner ?? (r.owner?.kyc?.status === "approved");

              return (
                <Link key={r._id} to={`/rooms/${r._id}`} className="roomCard card">
                  <div className="roomImgWrap">
                    {img ? <img src={img} alt="room" className="roomImg" /> : <div className="roomImgEmpty">{t("No Photo")}</div>}
                    {isVerified ? <div className="vBadge">✓ {t("Verified")}</div> : null}
                    <div className="roomPrice">NPR {r.monthlyRent}/mo</div>
                  </div>

                  <div className="roomBody">
                    <div className="roomTitle">{r.title}</div>
                    <div className="muted roomLoc">{r.location}</div>

                    <div className="roomBadges">
                      {r.facilities?.wifi && <span className="badge">{t("WiFi")}</span>}
                      {r.facilities?.parking && <span className="badge">{t("Parking")}</span>}
                      {r.facilities?.waterSupply && <span className="badge">{t("Water")}</span>}
                      {r.facilities?.electricityBackup && <span className="badge">{t("Backup")}</span>}
                      {r.facilities?.kitchen && <span className="badge">{t("Kitchen")}</span>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="spacer" />

      <div className="cta card cardPad">
        <div>
          <div style={{ fontWeight: 900, fontSize: 18 }}>{t("Are you an owner?")}</div>
          <div className="muted" style={{ marginTop: 6 }}>
            {t("Post your room and manage agreements and rent tracking.")}
          </div>
        </div>
        <Link className="btn" to="/login">{t("Owner Login")}</Link>
      </div>
    </div>
  );
}
