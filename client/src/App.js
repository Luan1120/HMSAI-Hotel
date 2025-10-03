import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useParams } from 'react-router-dom';
import ForgotPassword from './ForgotPassword';
import Login from './Login';
import Register from './Register';
import ResetPassword from './ResetPassword';
import HomePage from './HomePage';
import Profile from './Profile';
import RoomTypeInline from './RoomTypeInline';
import PaymentSuccess from './PaymentSuccess';
import PaymentPending from './PaymentConfirm'; // file will be renamed to PaymentPending.js
import BookingDetails from './BookingDetails';
import PaymentHistory from './PaymentHistory';
import RoomsBrowse from './RoomsBrowse';
import ReviewForm from './ReviewForm';
import AdminUsers from './AdminUsers';
import AdminServices from './AdminServices';
import { getUserRole } from './auth';

function RoomTypeRouteWrapper() {
  const { name } = useParams();
  return (
    <div className="home-root" style={{ paddingTop: 80 }}>
      <header className="home-header" style={{ position: 'sticky', top: 0 }}>
        <div className="home-header-left">
          <img src="/logo.png" alt="logo" className="home-header-logo" />
          <Link to="/" className="home-header-title home-header-home-btn">TRANG CHỦ</Link>
        </div>
        <div className="home-header-icons">
          <Link to="/login" className="home-header-icon" title="Đăng nhập">
            <img src="/icon-user.png" alt="user" className="home-header-icon-img" />
          </Link>
        </div>
      </header>
      <div style={{ padding: '16px 12px' }}>
        <h2 className="home-rooms-title" style={{ textAlign: 'left', marginTop: 12 }}>Hạng phòng: {name}</h2>
        <RoomTypeInline name={name} />
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/room-types/:name" element={<RoomTypeRouteWrapper />} />
  <Route path="/payment/confirm" element={<PaymentPending />} />
        <Route path="/payment/success" element={<PaymentSuccess />} />
        <Route path="/booking/:token" element={<BookingDetails />} />
  <Route path="/transactions" element={<PaymentHistory />} />
  <Route path="/rooms" element={<RoomsBrowse />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/review" element={<ReviewForm />} />
        <Route path="/admin/users" element={getUserRole()==='Admin' ? <AdminUsers /> : <HomePage />} />
        <Route path="/admin/services" element={['Admin','Staff'].includes(getUserRole()) ? <AdminServices /> : <HomePage />} />
  {/* Promotions feature removed */}
      </Routes>
    </Router>
  );
}

export default App;
