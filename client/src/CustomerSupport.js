import React from 'react';
import './HomePage.css';

export default function CustomerSupport({ isModal, onClose }) {
  return (
    <div className="admin-rooms" style={{ padding: isModal ? 0 : '80px 12px 20px' }}>
      {!isModal && (
        <header className="home-header" style={{ position: 'sticky', top: 0 }}>
          <div className="home-header-left">
            <img src="/logo.png" alt="logo" className="home-header-logo" />
            <a href="/" className="home-header-title home-header-home-btn">TRANG CHỦ</a>
          </div>
        </header>
      )}
      <div className="ph-table" style={{ padding: 16 }}>
        <h2 className="home-rooms-title" style={{ textAlign: 'left', marginTop: 0 }}>Hỗ trợ khách hàng</h2>
        <div style={{ color: '#666' }}>
          Kênh hỗ trợ đang được xây dựng. Bạn có thể liên hệ qua email hoặc hotline ở phần chân trang.
        </div>
      </div>
    </div>
  );
}
