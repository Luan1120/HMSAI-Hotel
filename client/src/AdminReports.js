import React, { useEffect, useMemo, useState } from 'react';
import { getUserRole, authHeaders } from './auth';
import './HomePage.css';

export default function AdminReports({ isModal, onClose }) {
  const role = getUserRole();
  const isAdmin = role === 'Admin';
  useEffect(() => {
    // Prevent background page from scrolling while modal is open
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  // Default to current year full range
  const initialYear = new Date().getFullYear();
  const [from, setFrom] = useState(`${initialYear}-01-01`);
  const [to, setTo] = useState(`${initialYear}-12-31`);
  const [summary, setSummary] = useState({ totalBookings: 0, checkInsCount: 0, revenue: 0, availableRooms: 0, totalRooms: 0 });
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [months, setMonths] = useState(Array.from({length:12}, (_,i)=>({month:i+1,revenue:0})));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);

  const load = async () => {
    setLoading(true); setErr('');
    try {
      const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
      params.set('_', String(Date.now()));
      const sRes = await fetch(`/api/admin/reports/summary?${params.toString()}`, { cache: 'no-store', headers: authHeaders() });
      if (!sRes.ok) throw new Error('Không thể tải tổng quan');
      const s = await sRes.json();
      setSummary({
        totalBookings: s.totalBookings || 0,
        checkInsCount: s.checkInsCount || 0,
        revenue: Number(s.revenue || 0),
        availableRooms: s.availableRooms || 0,
        totalRooms: s.totalRooms || 0,
      });
      // Align chart year with selected to-date if provided
  const yParam = to ? new Date(to).getFullYear() : year;
      if (yParam !== year) setYear(yParam);
      const mRes = await fetch(`/api/admin/reports/monthly?year=${encodeURIComponent(yParam)}&_=${Date.now()}`, { cache: 'no-store', headers: authHeaders() });
      if (!mRes.ok) throw new Error('Không thể tải doanh thu theo tháng');
      const mj = await mRes.json();
      setMonths(Array.isArray(mj.months) ? mj.months : []);
    } catch (e) {
      setErr(e.message || 'Lỗi tải báo cáo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isAdmin) load(); }, []);
  useEffect(() => { if (isAdmin) load(); }, [year]);
  // Auto-load when date filters change (debounced)
  useEffect(() => {
    if (!isAdmin) return;
    const id = setTimeout(() => { load(); }, 250);
    return () => clearTimeout(id);
  }, [isAdmin, from, to]);
  // Keep chart year in sync with end date's year
  useEffect(() => {
    if (!to) return;
    const y = new Date(to).getFullYear();
    if (y !== year) setYear(y);
  }, [to]);

  const totalYearRevenue = useMemo(() => months.reduce((s, m) => s + Number(m.revenue || 0), 0), [months]);

  const yearsList = useMemo(() => {
    const y = new Date().getFullYear();
    return [y-1, y, y+1];
  }, []);

  if (!isAdmin) return (
    <div className="ph-table" style={{ padding: 16 }}>
      <div style={{ color:'#b42318' }}>Chức năng chỉ dành cho quản trị viên.</div>
    </div>
  );

  return (
    <div className="ph-table reports-root" style={{ padding: '16px 20px', maxWidth: 'unset', margin: '0 auto' }}>
      <h2 className="home-rooms-title" style={{ textAlign: 'left', marginTop: 0 }}>BÁO CÁO THỐNG KÊ</h2>

      <div className="reports-toolbar">
        <DateRangePicker from={from} to={to} onChange={(f,t)=>{ setFrom(f); setTo(t); }} />
        <div className="reports-field reports-spacer" />
        <div className="reports-field">
          <div className="reports-label">Chọn năm:</div>
          <select className="reports-select" value={year} onChange={e=>{ setYear(Number(e.target.value)); }}>
            {yearsList.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
        <Card title="Lượt check-in" value={String(summary.checkInsCount || 0)} color="#22c55e" />
        <Card title="Khách đã đặt" value={String(summary.totalBookings || 0)} color="#0ea5e9" />
        <Card title="Doanh thu (VNĐ)" value={formatVND(summary.revenue)} color="#f59e0b" />
        <Card title="Số phòng trống" value={String(summary.availableRooms || 0)} color="#64748b" />
        <Card title="Tổng số phòng" value={String(summary.totalRooms || 0)} color="#334155" />
      </div>

      <div style={{ marginTop: 16 }}>
        <Chart months={months} />
      </div>

      <div style={{ marginTop: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background:'#f7f7fb' }}>
              <th style={{ textAlign:'left', padding: '8px 6px' }}>Tháng</th>
              <th style={{ textAlign:'left', padding: '8px 6px' }}>Doanh thu (VNĐ)</th>
            </tr>
          </thead>
          <tbody>
            {months.map(m => (
              <tr key={m.month} style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: '8px 6px' }}>Tháng {m.month}</td>
                <td style={{ padding: '8px 6px' }}>{formatVND(m.revenue)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid #ddd', background: '#fafafa' }}>
              <td style={{ padding: '8px 6px', fontWeight: 700 }}>Tổng năm</td>
              <td style={{ padding: '8px 6px', fontWeight: 700 }}>{formatVND(totalYearRevenue)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {err && <div style={{ color:'#b42318', marginTop: 10 }}>{err}</div>}
    </div>
  );
}

function DateRangePicker({ from, to, onChange }){
  const f = parseYMD(from);
  const t = parseYMD(to);
  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const list = [];
    for (let y = now - 10; y <= now + 1; y++) list.push(y);
    return list;
  }, []);
  const months = Array.from({length:12}, (_,i)=>i+1);

  const updateFrom = (y,m,d) => {
    const dayMax = daysInMonth(y,m);
    const dd = Math.min(d || 1, dayMax);
    onChange(formatYMD(y,m,dd), to);
  };
  const updateTo = (y,m,d) => {
    const dayMax = daysInMonth(y,m);
    const dd = Math.min(d || dayMax, dayMax);
    onChange(from, formatYMD(y,m,dd));
  };

  const fMax = daysInMonth(f.y, f.m);
  const tMax = daysInMonth(t.y, t.m);
  const fDays = Array.from({length:fMax}, (_,i)=>i+1);
  const tDays = Array.from({length:tMax}, (_,i)=>i+1);

  return (
    <div className="reports-field" style={{ gap: 14 }}>
      <div className="reports-field reports-field-group">
        <div className="reports-label">Từ:</div>
        <select className="reports-select" data-role="day" value={f.d} onChange={e=>updateFrom(f.y, f.m, Number(e.target.value))}>
          {fDays.map(d=> <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="reports-select" data-role="month" value={f.m} onChange={e=>updateFrom(f.y, Number(e.target.value), f.d)}>
          {months.map(m=> <option key={m} value={m}>Tháng {m}</option>)}
        </select>
        <select className="reports-select" data-role="year" value={f.y} onChange={e=>updateFrom(Number(e.target.value), f.m, f.d)}>
          {years.map(y=> <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="reports-field reports-field-group">
        <div className="reports-label">Đến:</div>
        <select className="reports-select" data-role="day" value={t.d} onChange={e=>updateTo(t.y, t.m, Number(e.target.value))}>
          {tDays.map(d=> <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="reports-select" data-role="month" value={t.m} onChange={e=>updateTo(t.y, Number(e.target.value), t.d)}>
          {months.map(m=> <option key={m} value={m}>Tháng {m}</option>)}
        </select>
        <select className="reports-select" data-role="year" value={t.y} onChange={e=>updateTo(Number(e.target.value), t.m, t.d)}>
          {years.map(y=> <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
    </div>
  );
}

function daysInMonth(year, month){
  return new Date(year, month, 0).getDate();
}
function pad(n){ return String(n).padStart(2, '0'); }
function formatYMD(y,m,d){ return `${y}-${pad(m)}-${pad(d)}`; }
function parseYMD(s){
  try{
    const [y,m,d] = s.split('-').map(Number);
    return { y, m, d };
  }catch{ const d=new Date(); return { y:d.getFullYear(), m:d.getMonth()+1, d:d.getDate() }; }
}

function Chart({ months }){
  const max = Math.max(1, ...months.map(x => Number(x.revenue||0)));
  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <div style={{ minWidth: 680 }}>
        <div style={{ fontWeight: 700, margin: '6px 0 8px' }}>So sánh doanh thu theo tháng</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 260, padding: '12px 8px', background: '#f7f7fb', borderRadius: 8 }}>
          {months.map(m => {
            const h = Math.round(200 * (Number(m.revenue||0) / max));
            return (
              <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div title={`Tháng ${m.month} | Doanh thu: ${formatVND(m.revenue)}`} style={{ width: 24, height: h, background: '#3b82f6', borderRadius: 4 }} />
                <div style={{ fontSize: 12, color: '#555', marginTop: 6 }}>Tháng {m.month}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Card({ title, value, color }){
  return (
    <div style={{ background:'#fff', borderRadius: 10, padding: 12, border: '1px solid #eee' }}>
      <div style={{ fontSize: 12, color: '#666' }}>{title}</div>
      <div style={{ fontWeight: 800, color, fontSize: 20, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function formatVND(n){
  const v = Number(n || 0);
  return v.toLocaleString('vi-VN') + ' đ';
}
