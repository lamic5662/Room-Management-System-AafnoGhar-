import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Rooms from "./pages/Rooms";
import RoomDetails from "./pages/RoomDetails";
import MyRequests from "./pages/MyRequests";
import AddRoom from "./pages/AddRoom";
import MyRooms from "./pages/MyRooms";
import OwnerDashboard from "./pages/OwnerDashboard";
import TenantDashboard from "./pages/TenantDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import AdminKyc from "./pages/AdminKyc";
import KycSubmit from "./pages/KycSubmit";
import EditRoom from "./pages/EditRoom";
import Home from "./pages/Home";
import ProtectedRoute from "./components/ProtectedRoute";
import useAuthCheck from "./hooks/useAuthCheck";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import ChatWidget from "./components/ChatWidget";
import NotFound from "./pages/NotFound";
import OwnerRequests from "./pages/OwnerRequests";
import OwnerAgreements from "./pages/OwnerAgreements";
import TenantAgreements from "./pages/TenantAgreements";
import PayRent from "./pages/PayRent";
import OwnerPayments from "./pages/OwnerPayments";
import TenantPayments from "./pages/TenantPayments";
import TenantComplaints from "./pages/TenantComplaints";
import OwnerComplaints from "./pages/OwnerComplaints";
import AdminUsers from "./pages/AdminUsers";
import AdminAuditLogs from "./pages/AdminAuditLogs";
import OwnerRoomRules from "./pages/OwnerRoomRules";
import TenantAgreementRules from "./pages/TenantAgreementRules";
import TenantExits from "./pages/TenantExits";
import OwnerExits from "./pages/OwnerExits";
import AdminFlaggedRooms from "./pages/AdminFlaggedRooms";
import OwnerKyc from "./pages/OwnerKyc";
import TenantOffers from "./pages/TenantOffers";
import OwnerOffers from "./pages/OwnerOffers";
import EsewaSuccess from "./pages/EsewaSuccess";
import EsewaFailure from "./pages/EsewaFailure";
import KhaltiReturn from "./pages/KhaltiReturn";
import Profile from "./pages/Profile";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import DailyRent from "./pages/DailyRent";
import TenantSavedSearches from "./pages/TenantSavedSearches";
import TenantVisits from "./pages/TenantVisits";
import OwnerVisits from "./pages/OwnerVisits";
import PaymentTimeline from "./pages/PaymentTimeline";
import AgreementChat from "./pages/AgreementChat";

export default function App() {
  const checking = useAuthCheck();

  if (checking) return <div className="muted" style={{ padding: 20 }}>Checking login...</div>;

  return (
    <>
      <Navbar />
      <div className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/rooms" element={<Rooms />} />
          <Route path="/rooms/:id" element={<RoomDetails />} />
          <Route path="/daily-rent" element={<DailyRent />} />
          <Route element={<ProtectedRoute allowedRoles={["admin", "super_admin", "moderator"]} />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/flagged-rooms" element={<AdminFlaggedRooms />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={["admin", "super_admin"]} />}>
            <Route path="/admin/kyc" element={<AdminKyc />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={["super_admin"]} />}>
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["owner"]} />}>
            <Route path="/owner/dashboard" element={<OwnerDashboard />} />
            <Route path="/owner/add-room" element={<AddRoom />} />
            <Route path="/owner/my-rooms" element={<MyRooms />} />
            <Route path="/owner/kyc" element={<OwnerKyc />} />
            <Route path="/owner/requests" element={<OwnerRequests />} />
            <Route path="/owner/offers" element={<OwnerOffers />} />
            <Route path="/owner/agreements" element={<OwnerAgreements />} />
            <Route path="/owner/payments" element={<OwnerPayments />} />
            <Route path="/owner/complaints" element={<OwnerComplaints />} />
            <Route path="/owner/exits" element={<OwnerExits />} />
            <Route path="/owner/visits" element={<OwnerVisits />} />
            <Route path="/owner/rooms/:roomId/rules" element={<OwnerRoomRules />} />
            <Route path="/owner/rooms/:id/edit" element={<EditRoom />} />
            <Route path="/owner/agreements/:agreementId/timeline" element={<PaymentTimeline />} />
            <Route path="/owner/agreements/:agreementId/chat" element={<AgreementChat />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["tenant"]} />}>
            <Route path="/tenant/dashboard" element={<TenantDashboard />} />
            <Route path="/tenant/kyc" element={<KycSubmit />} />
            <Route path="/tenant/requests" element={<MyRequests />} />
            <Route path="/tenant/offers" element={<TenantOffers />} />
            <Route path="/tenant/agreements" element={<TenantAgreements />} />
            <Route path="/tenant/pay/:agreementId" element={<PayRent />} />
            <Route path="/tenant/payments" element={<TenantPayments />} />
            <Route path="/tenant/complaints" element={<TenantComplaints />} />
            <Route path="/tenant/exits" element={<TenantExits />} />
            <Route path="/tenant/agreements/:agreementId/rules" element={<TenantAgreementRules />} />
            <Route path="/tenant/agreements/:agreementId/timeline" element={<PaymentTimeline />} />
            <Route path="/tenant/agreements/:agreementId/chat" element={<AgreementChat />} />
            <Route path="/tenant/saved-searches" element={<TenantSavedSearches />} />
            <Route path="/tenant/visits" element={<TenantVisits />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["tenant", "owner", "admin", "super_admin", "moderator"]} />}>
            <Route path="/profile" element={<Profile />} />
          </Route>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/register" element={<Register />} />
          <Route path="/payment/esewa/success" element={<EsewaSuccess />} />
          <Route path="/payment/esewa/failure" element={<EsewaFailure />} />
          <Route path="/payment/khalti/return" element={<KhaltiReturn />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
      <Footer />
      <ChatWidget />
    </>
  );
}
