import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import './HomePage.css';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { isLoggedIn } from './auth';

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const amount = Number(params.get('amount') || 0);
  const code = params.get('code') || '';
  const rt = params.get('rt') || '';
  const rn = params.get('rn') || '';
  const ci = params.get('ci') || '';
  const co = params.get('co') || '';
  const ad = Number(params.get('ad') || 0);
  const ch = Number(params.get('ch') || 0);

  const [hotelName, setHotelName] = useState('');
  const summary = useMemo(() => {
    try {
      const raw = token ? localStorage.getItem('hmsBooking:' + token) : null;
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      token, code, amount, roomType: rt, roomNames: rn, checkIn: ci, checkOut: co, adults: ad, children: ch, hotelId: (Number(params.get('hid')||0)||null),
      hotel: '', checkInTime: '14:00', checkOutTime: '12:00'
    };
  }, [token, code, amount, rt, rn, ci, co, ad, ch, params]);

  useEffect(() => {
    let cancelled = false;
    const setName = (name) => { if (!cancelled) setHotelName(name); };
    const fetchHotel = (hid) => {
      if (!hid) return;
      fetch(`/api/hotels/${hid}`).then(r => r.ok ? r.json() : null).then(j => {
        if (j && j.name) setName(j.name);
      }).catch(() => {});
    };
    if (!hotelName) {
      const hidParam = Number(params.get('hid') || 0) || null;
      if (summary.hotelId) {
        fetchHotel(summary.hotelId);
      } else if (hidParam) {
        fetchHotel(hidParam);
      } else if (summary.roomType) {
        fetch(`/api/room-types/${encodeURIComponent(summary.roomType)}/rooms`)
          .then(r => r.ok ? r.json() : null)
          .then(j => {
            if (j && j.roomType) {
              if (j.roomType.hotelName && !hotelName) setName(j.roomType.hotelName);
              if (j.roomType.hotelId) fetchHotel(j.roomType.hotelId);
            }
          })
          .catch(() => {});
      }
    }
    return () => { cancelled = true; };
  }, [summary.hotelId, summary.roomType, hotelName, params]);

  const detailsHref = useMemo(() => {
    const q = new URLSearchParams({
      amount: String(summary.amount || amount || 0),
      code: String(summary.code || code || ''),
      rn: String(summary.roomNames || rn || ''),
      rt: String(summary.roomType || rt || ''),
      ci: String(summary.checkIn || ci || ''),
      co: String(summary.checkOut || co || ''),
      ad: String(summary.adults || ad || 0),
      ch: String(summary.children || ch || 0),
      hid: String(summary.hotelId || params.get('hid') || ''),
    });
    return `/booking/${token || summary.token || ''}?${q.toString()}`;
  }, [summary, token, amount, code, rn, ci, co, ad, ch, params]);

  const toBase64 = (buf) => {
    let binary = '';
    const bytes = new Uint8Array(buf);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const ensurePdfFonts = async () => {
    const REG_KEY = 'hmsPdfFont:DejaVu-Regular';
    const BOLD_KEY = 'hmsPdfFont:DejaVu-Bold';
    let regular = '';
    let bold = '';
    try { regular = localStorage.getItem(REG_KEY) || ''; } catch {}
    try { bold = localStorage.getItem(BOLD_KEY) || ''; } catch {}
    const fetchFont = async (url) => {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error('Font fetch failed');
      const buf = await res.arrayBuffer();
      return toBase64(buf);
    };
    if (!regular) {
      regular = await fetchFont('https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/ttf/DejaVuSans.ttf');
      try { localStorage.setItem(REG_KEY, regular); } catch {}
    }
    if (!bold) {
      bold = await fetchFont('https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/master/ttf/DejaVuSans-Bold.ttf');
      try { localStorage.setItem(BOLD_KEY, bold); } catch {}
    }
    return { regular, bold };
  };

  const printReceipt = async () => {
    const hotel = hotelName || summary.hotel || '';
    const file = `${summary.code || token || 'receipt'}.pdf`;
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-99999px';
    container.style.top = '0';
    container.style.width = '560px';
    container.style.background = '#fff';
    container.style.padding = '24px 16px';
    container.style.fontFamily = "'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'DejaVu Sans', 'Liberation Sans', sans-serif";
    container.innerHTML = `
      <div>
        <div style="font-weight:800;font-size:22px;margin:0 0 10px 0;">Phiếu xác nhận đặt phòng</div>
        <div style="height:1px;background:#e6e6e6;margin:8px 0 14px 0;"></div>
        <div style="display:grid;grid-template-columns:180px 1fr;gap:10px 16px;font-size:13px;">
          <div style="color:#666;font-weight:700;">Mã đặt phòng</div>
          <div style="font-weight:800;">${String(summary.code || token)}</div>
          <div style="color:#666;font-weight:700;">Khách sạn</div>
          <div style="font-weight:800;">${hotel || '—'}</div>
          <div style="color:#666;font-weight:700;">Ngày nhận</div>
          <div style="font-weight:800;">${summary.checkIn} - ${summary.checkInTime}</div>
          <div style="color:#666;font-weight:700;">Ngày trả</div>
          <div style="font-weight:800;">${summary.checkOut} - ${summary.checkOutTime}</div>
          <div style="color:#666;font-weight:700;">Phòng</div>
          <div style="font-weight:800;">${String(summary.roomNames || summary.roomType || '—')}</div>
          <div style="color:#666;font-weight:700;">Khách</div>
          <div style="font-weight:800;">${summary.adults || 0} người lớn${summary.children ? ` • ${summary.children} trẻ em` : ''}</div>
          <div style="color:#666;font-weight:700;">Tổng cộng</div>
          <div style="font-weight:800;">${Number(summary.amount || 0).toLocaleString('vi-VN')} VND</div>
        </div>
        <div style="margin-top:10px;font-weight:800;">(ĐÃ THANH TOÁN)</div>
      </div>`;
    document.body.appendChild(container);
    try {
      const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = Math.min(540, pageWidth - 56 * 2);
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const x = (pageWidth - imgWidth) / 2;
      let y = 56;
      if (imgHeight > pageHeight - 112) {
        // Multi-page if content longer than one page
        let remaining = imgHeight;
        let offset = 0;
        while (remaining > 0) {
          pdf.addImage(imgData, 'PNG', x, y - offset, imgWidth, imgHeight);
          remaining -= (pageHeight - 112);
          offset += (pageHeight - 112);
          if (remaining > 0) {
            pdf.addPage();
          }
        }
      } else {
        pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
      }
      pdf.save(file);
    } finally {
      document.body.removeChild(container);
    }
  };

  // Save to DB on mount (once)
  useEffect(() => {
    if (!isLoggedIn()) {
      try { sessionStorage.setItem('hmsRedirectAfterLogin', window.location.pathname + window.location.search); } catch {}
      navigate('/login');
      return; // skip saving
    }
    const save = async () => {
      try {
        const raw = token ? localStorage.getItem('hmsBooking:' + token) : null;
        if (!raw) return;
        const s = JSON.parse(raw);
        let email = s.userEmail || '';
        if (!email) {
          try { const rawUser = localStorage.getItem('hmsUser'); if (rawUser) email = JSON.parse(rawUser).email || ''; } catch {}
        }
        if (!email) return;
        const body = {
          token: token || s.token,
          email,
          checkIn: s.checkIn,
          checkOut: s.checkOut,
          method: s.payMethod || 'MOMO',
          rooms: (s.rooms || []).map(r => ({ id: r.id, adults: r.adults || 1, children: r.children || 0, price: r.price })),
        };
        await fetch('/api/payments/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } catch {}
    };
    save();
  }, []);

  return (
    <div className="home-root success-root">
      <div className="success-card">
        <div className="success-top">
          <Link to="/" className="success-home">← Quay lại Trang Chủ</Link>
          <span />
        </div>
        <div className="success-icon">
          <img src="/success.png" alt="success" />
        </div>
        <h2 className="success-title">Thanh Toán Thành Công!</h2>
        <div className="success-sub">Cảm ơn bạn đã đặt phòng tại HMS Hotel.</div>
  <div className="success-code-line"><span className="label">Mã Đặt Phòng</span><span className="value">{summary.code || token}</span></div>
        <div className="success-sep" />
        <div className="success-grid">
          <div className="label">Khách Sạn</div><div className="value">{hotelName || summary.hotel || '—'}</div>
          <div className="label">Ngày Nhận</div><div className="value">{summary.checkIn} - {summary.checkInTime}</div>
          <div className="label">Ngày Trả</div><div className="value">{summary.checkOut} - {summary.checkOutTime}</div>
          <div className="label">Hạng Phòng</div><div className="value">{summary.roomType || '—'}</div>
          <div className="label">Phòng</div><div className="value wrap">{summary.roomNames || summary.roomType}</div>
          <div className="label">Khách</div><div className="value">{summary.adults || 0} người lớn{summary.children ? ` • ${summary.children} trẻ em` : ''}</div>
          <div className="label">Tổng Cộng</div><div className="value bold nowrap">{Number(summary.amount || 0).toLocaleString('vi-VN')} VND</div>
        </div>
        <div className="success-paid">(ĐÃ THANH TOÁN)</div>
        <div className="success-actions">
          <button className="checkout-btn success-btn" onClick={printReceipt}>Tải phiếu xác nhận (PDF)</button>
        </div>
      </div>
    </div>
  );
}