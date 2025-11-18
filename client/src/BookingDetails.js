import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import './HomePage.css';
import { isLoggedIn } from './auth';

export default function BookingDetails() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [hotelName] = useState('');

  const amount = Number(params.get('amount') || 0);
  const code = params.get('code') || '';
  const rn = params.get('rn') || '';
  const rt = params.get('rt') || '';
  const ci = params.get('ci') || '';
  const co = params.get('co') || '';
  const ad = Number(params.get('ad') || 0);
  const ch = Number(params.get('ch') || 0);
  const hid = Number(params.get('hid') || 0) || null;

  const summary = useMemo(() => {
    try {
      const raw = token ? localStorage.getItem('hmsBooking:' + token) : null;
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      token, code, amount, roomNames: rn, roomType: rt, checkIn: ci, checkOut: co, adults: ad, children: ch, hotelId: hid,
      hotel: '', checkInTime: '14:00', checkOutTime: '12:00', rooms: [], depositAmount: Math.round(Number(amount || 0) * 0.2), finalAmount: Number(amount || 0)
    };
  }, [token, amount, code, rn, ci, co, ad, ch, hid]);

  // Derive pricing (only final price is stored in DB; UI can still show original for clarity if promo applied)
  const { grossAmount, finalAmount, discountValue, discountPercent, promoCode } = useMemo(() => {
    const gross = Number(summary.amount || 0);
    // Support either summary.promo.final (old shape) or summary.finalAmount (future shape)
    let final = gross;
    if (summary && summary.promo && typeof summary.promo.final !== 'undefined' && summary.promo.final !== null) {
      final = Number(summary.promo.final);
    } else if (typeof summary.finalAmount !== 'undefined' && summary.finalAmount !== null) {
      final = Number(summary.finalAmount);
    }
    if (!(final >= 0)) final = gross;
    const discount = Math.max(0, gross - final);
    let percent = 0;
    if (discount > 0 && gross > 0) percent = Math.round((discount / gross) * 100);
    const pCode = summary && summary.promo && summary.promo.code ? summary.promo.code : null;
    return { grossAmount: gross, finalAmount: final, discountValue: discount, discountPercent: percent, promoCode: pCode };
  }, [summary]);

  const depositAmount = useMemo(() => {
    if (typeof summary?.depositAmount === 'number' && !Number.isNaN(summary.depositAmount)) {
      return Math.max(0, Math.round(Number(summary.depositAmount)));
    }
    return Math.max(0, Math.round(finalAmount * 0.2));
  }, [summary, finalAmount]);

  const remainingAmount = useMemo(() => {
    const remain = Math.round(finalAmount - depositAmount);
    return remain > 0 ? remain : 0;
  }, [finalAmount, depositAmount]);

  // Intentionally no hotel fetch: hotel name shows only in receipt
  useEffect(() => {
    if (!isLoggedIn()) {
      try { sessionStorage.setItem('hmsRedirectAfterLogin', window.location.pathname + window.location.search); } catch {}
      navigate('/login');
    }
  }, [navigate]);

  return (
    <div className="home-root" style={{ paddingTop: 80 }}>
      <header className="home-header" style={{ position: 'sticky', top: 0 }}>
        <div className="home-header-left">
          <img src="/logo.png" alt="logo" className="home-header-logo" />
          <Link to="/" className="home-header-title home-header-home-btn">TRANG CHỦ</Link>
        </div>
        <div className="home-header-icons">
          <Link to="/" className="home-header-icon" title="Về Trang Chủ">
            <img src="/icon-grid.png" alt="home" className="home-header-icon-img" />
          </Link>
        </div>
      </header>
      <div style={{ padding: '20px 16px', maxWidth: 900, margin: '0 auto' }}>
        <h2 style={{ marginTop: 0 }}>Chi Tiết Đặt Phòng</h2>
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
          <div style={{ marginBottom: 8 }}><b>Mã đặt phòng:</b> {summary.code || token}</div>
          {/* Hotel name intentionally omitted on details page */}
          <div style={{ marginBottom: 8 }}><b>Ngày nhận:</b> {summary.checkIn} - {summary.checkInTime}</div>
          <div style={{ marginBottom: 8 }}><b>Ngày trả:</b> {summary.checkOut} - {summary.checkOutTime}</div>
          <div style={{ marginBottom: 8 }}><b>Hạng phòng:</b> {summary.roomType || '—'}</div>
          <div style={{ marginBottom: 8 }}><b>Phòng:</b> {summary.roomNames || '—'}</div>
          <div style={{ marginBottom: 8 }}><b>Khách:</b> {summary.adults || 0} người lớn{summary.children ? ` • ${summary.children} trẻ em` : ''}</div>
          {discountValue > 0 ? (
            <div style={{ marginBottom: 8 }}>
              <b>Tổng cộng:</b>{' '}
              <span style={{ textDecoration: 'line-through', opacity: 0.6, marginRight: 6 }}>
                {grossAmount.toLocaleString('vi-VN')} VND
              </span>
              <span style={{ color: '#d97706', fontWeight: 700 }}>
                {finalAmount.toLocaleString('vi-VN')} VND
              </span>
              <span style={{ marginLeft: 6, fontSize: 12, background: '#fef3c7', color: '#b45309', padding: '2px 6px', borderRadius: 6 }}>
                -{discountValue.toLocaleString('vi-VN')} VND{discountPercent ? ` (${discountPercent}%)` : ''}
              </span>
              {promoCode && (
                <span style={{ marginLeft: 6, fontSize: 12, color: '#334155' }}>Mã: <strong>{promoCode}</strong></span>
              )}
            </div>
          ) : (
            <div style={{ marginBottom: 8 }}><b>Tổng cộng:</b> {grossAmount.toLocaleString('vi-VN')} VND</div>
          )}
          <div style={{ marginBottom: 8 }}><b>Đã đặt cọc:</b> {depositAmount.toLocaleString('vi-VN')} VND</div>
          <div style={{ marginBottom: 8 }}><b>Còn lại thanh toán tại khách sạn:</b> {remainingAmount.toLocaleString('vi-VN')} VND</div>
          {Array.isArray(summary.rooms) && summary.rooms.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Danh sách phòng:</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {summary.rooms.map((r) => (
                  <li key={r.id}>Phòng {r.number}{r.floor != null ? ` • Tầng ${r.floor}` : ''} — Giá: {Number(r.price || 0).toLocaleString('vi-VN')} VND/đêm</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
