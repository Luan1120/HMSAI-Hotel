import React, { useEffect, useMemo, useState } from 'react';
import './HomePage.css';
import { authHeaders, getUserRole } from './auth';

const defaultForm = {
  question: '',
  answer: '',
  variations: '',
  suggestions: '',
  tags: '',
  status: 'Active',
};

function splitUniqueLines(value) {
  if (!value) return [];
  const seen = new Set();
  const out = [];
  String(value)
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const key = part.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(part);
    });
  return out;
}

function splitUniqueTags(value) {
  if (!value) return [];
  const normalized = String(value).replace(/\n+/g, ',');
  const seen = new Set();
  const out = [];
  normalized
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const key = part.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(part);
    });
  return out;
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('vi-VN');
  } catch {
    return iso;
  }
}

export default function AdminChatbotTraining() {
  const role = getUserRole();
  const isAdmin = role === 'Admin';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [modal, setModal] = useState({ mode: null, item: null });
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    loadItems();
  }, [isAdmin]);

  const loadItems = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/ai/training', { headers: authHeaders() });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        throw new Error(msg.message || 'Lỗi tải dữ liệu huấn luyện');
      }
      const json = await res.json();
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (err) {
      setError(err.message || 'Lỗi tải dữ liệu huấn luyện');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const tagOptions = useMemo(() => {
    const set = new Set();
    items.forEach((item) => {
      (item.tags || []).forEach((tag) => {
        if (!tag) return;
        set.add(tag);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const status = statusFilter;
    const tag = tagFilter.toLowerCase();
    return items.filter((item) => {
      if (status !== 'all' && (item.status || 'Active').toLowerCase() !== status) return false;
      if (tag !== 'all') {
        const hasTag = (item.tags || []).some((t) => t && t.toLowerCase() === tag);
        if (!hasTag) return false;
      }
      if (!q) return true;
      const stack = [
        item.question || '',
        item.answer || '',
        (item.variations || []).join(' '),
        (item.tags || []).join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return stack.includes(q);
    });
  }, [items, search, statusFilter, tagFilter]);

  const openCreate = () => {
    setForm(defaultForm);
    setModal({ mode: 'create', item: null });
  };

  const openEdit = (item) => {
    setForm({
      question: item.question || '',
      answer: item.answer || '',
      variations: (item.variations || []).join('\n'),
      suggestions: (item.suggestions || []).join('\n'),
      tags: (item.tags || []).join(', '),
      status: item.status || 'Active',
    });
    setModal({ mode: 'edit', item });
  };

  const openPreview = (item) => {
    setModal({ mode: 'preview', item });
  };

  const closeModal = () => {
    if (saving) return;
    setModal({ mode: null, item: null });
    setForm(defaultForm);
  };

  const handleSubmit = async (evt) => {
    evt.preventDefault();
    if (saving) return;
    const question = form.question.trim();
    const answer = form.answer.trim();
    if (!question) {
      alert('Vui lòng nhập câu hỏi chính.');
      return;
    }
    if (!answer) {
      alert('Vui lòng nhập câu trả lời.');
      return;
    }
    const payload = {
      question,
      answer,
      status: form.status === 'Draft' ? 'Draft' : 'Active',
      variations: splitUniqueLines(form.variations),
      suggestions: splitUniqueLines(form.suggestions),
      tags: splitUniqueTags(form.tags),
    };
    const isEdit = modal.mode === 'edit' && modal.item;
    const url = isEdit ? `/api/admin/ai/training/${modal.item.id}` : '/api/admin/ai/training';
    const method = isEdit ? 'PUT' : 'POST';
    setSaving(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        throw new Error(msg.message || 'Không lưu được mẫu huấn luyện');
      }
      const data = await res.json();
      if (isEdit) {
        setItems((prev) => prev.map((item) => (item.id === data.item.id ? data.item : item)));
      } else {
        setItems((prev) => [data.item, ...prev]);
      }
      closeModal();
    } catch (err) {
      alert(err.message || 'Không lưu được mẫu huấn luyện');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm('Xóa mẫu huấn luyện này?')) return;
    setActionId(item.id);
    try {
      const res = await fetch(`/api/admin/ai/training/${item.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        throw new Error(msg.message || 'Không xóa được mẫu huấn luyện');
      }
      setItems((prev) => prev.filter((row) => row.id !== item.id));
    } catch (err) {
      alert(err.message || 'Không xóa được mẫu huấn luyện');
    } finally {
      setActionId(null);
    }
  };

  const toggleStatus = async (item) => {
    const nextStatus = item.status === 'Active' ? 'Draft' : 'Active';
    setActionId(item.id);
    try {
      const res = await fetch(`/api/admin/ai/training/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        throw new Error(msg.message || 'Không cập nhật được trạng thái');
      }
      const data = await res.json();
      setItems((prev) => prev.map((row) => (row.id === data.item.id ? data.item : row)));
    } catch (err) {
      alert(err.message || 'Không cập nhật được trạng thái');
    } finally {
      setActionId(null);
    }
  };

  if (!isAdmin) {
    return <div style={{ padding: 16 }}>Chức năng này chỉ dành cho quản trị viên.</div>;
  }

  return (
    <div className="af-container ai-training-root">
      <h2 className="home-rooms-title" style={{ textAlign: 'left', marginTop: 0 }}>Huấn luyện Chatbot AI</h2>
      <div className="ai-training-toolbar">
        <input
          className="reports-input"
          placeholder="Tìm kiếm câu hỏi, câu trả lời, thẻ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="reports-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Tất cả trạng thái</option>
          <option value="active">Đang sử dụng</option>
          <option value="draft">Nháp / Tạm dừng</option>
        </select>
        <select className="reports-select" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
          <option value="all">Tất cả thẻ</option>
          {tagOptions.map((tag) => (
            <option key={tag} value={tag.toLowerCase()}>{tag}</option>
          ))}
        </select>
        <button type="button" className="ph-btn ph-btn--success" onClick={openCreate}>+ Thêm mẫu huấn luyện</button>
        <button type="button" className="ph-btn ph-btn--secondary" onClick={loadItems}>Làm mới</button>
      </div>
      {loading ? (
        <div style={{ padding: '12px 0' }}>Đang tải dữ liệu...</div>
      ) : error ? (
        <div style={{ padding: '12px 0', color: '#b42318' }}>{error}</div>
      ) : (
        <div className="ai-training-table-wrap">
          <table className="ph-table-el ai-training-table">
            <thead>
              <tr>
                <th style={{ width: '24%' }}>Câu hỏi mẫu</th>
                <th style={{ width: '28%' }}>Câu trả lời</th>
                <th style={{ width: '14%' }}>Biến thể</th>
                <th style={{ width: '14%' }}>Thẻ</th>
                <th style={{ width: '10%' }}>Trạng thái</th>
                <th style={{ width: '6%' }}>Lượt dùng</th>
                <th style={{ width: '14%' }}>Cập nhật</th>
                <th style={{ width: '14%' }}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: '#555', padding: '24px 0' }}>Không có dữ liệu phù hợp.</td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="ai-training-question" title={item.question}>{item.question}</div>
                    </td>
                    <td>
                      <div className="ai-training-answer" title={item.answer}>{item.answer}</div>
                    </td>
                    <td>
                      {item.variations && item.variations.length ? (
                        <span>{item.variations.length} biến thể</span>
                      ) : '—'}
                    </td>
                    <td>
                      {item.tags && item.tags.length ? (
                        <div className="ai-training-taglist">
                          {item.tags.map((tag) => (
                            <span key={tag} className="ai-training-tag">{tag}</span>
                          ))}
                        </div>
                      ) : '—'}
                    </td>
                    <td>
                      <span className={`ai-training-status ${item.status === 'Active' ? 'active' : 'draft'}`}>
                        {item.status === 'Active' ? 'Đang sử dụng' : 'Nháp'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>{Number(item.usageCount || 0)}</td>
                    <td>
                      <div>{formatDate(item.updatedAt)}</div>
                      <div className="ai-training-subtext">{item.lastUsedAt ? `Sử dụng: ${formatDate(item.lastUsedAt)}` : 'Chưa sử dụng'}</div>
                    </td>
                    <td className="ai-training-actions">
                      <button type="button" className="ph-btn ph-btn--secondary" onClick={() => openPreview(item)}>Xem</button>
                      <button type="button" className="ph-btn" onClick={() => openEdit(item)}>Sửa</button>
                      <button
                        type="button"
                        className="ph-btn ph-btn--warning"
                        onClick={() => toggleStatus(item)}
                        disabled={actionId === item.id}
                      >
                        {item.status === 'Active' ? 'Về nháp' : 'Kích hoạt'}
                      </button>
                      <button
                        type="button"
                        className="ph-btn ph-btn--danger"
                        onClick={() => handleDelete(item)}
                        disabled={actionId === item.id}
                      >
                        Xóa
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal.mode && (
        <div className="profile-overlay" style={{ zIndex: 2100 }} onMouseDown={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="profile-modal ai-training-modal" onMouseDown={(e) => e.stopPropagation()}>
            {modal.mode === 'preview' && modal.item ? (
              <div className="ai-preview">
                <h3 style={{ marginTop: 0 }}>Xem mẫu huấn luyện</h3>
                <div className="ai-preview-block">
                  <div className="ai-preview-label">Câu hỏi</div>
                  <div>{modal.item.question}</div>
                </div>
                <div className="ai-preview-block">
                  <div className="ai-preview-label">Câu trả lời</div>
                  <div>{modal.item.answer}</div>
                </div>
                <div className="ai-preview-block">
                  <div className="ai-preview-label">Biến thể</div>
                  <div>{modal.item.variations && modal.item.variations.length ? modal.item.variations.join(', ') : '—'}</div>
                </div>
                <div className="ai-preview-block">
                  <div className="ai-preview-label">Gợi ý tiếp theo</div>
                  <div>{modal.item.suggestions && modal.item.suggestions.length ? modal.item.suggestions.join(', ') : '—'}</div>
                </div>
                <div className="ai-preview-block">
                  <div className="ai-preview-label">Thẻ</div>
                  <div>{modal.item.tags && modal.item.tags.length ? modal.item.tags.join(', ') : '—'}</div>
                </div>
                <div className="ai-preview-footer">
                  <button type="button" className="ph-btn" onClick={closeModal}>Đóng</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="ai-form">
                <h3 style={{ marginTop: 0 }}>{modal.mode === 'edit' ? 'Chỉnh sửa mẫu huấn luyện' : 'Thêm mẫu huấn luyện'}</h3>
                <label className="ai-form-field">
                  <span>Câu hỏi chính *</span>
                  <textarea
                    rows={2}
                    value={form.question}
                    onChange={(e) => setForm((prev) => ({ ...prev, question: e.target.value }))}
                    required
                  />
                </label>
                <label className="ai-form-field">
                  <span>Biến thể câu hỏi (mỗi dòng một biến thể)</span>
                  <textarea
                    rows={3}
                    value={form.variations}
                    onChange={(e) => setForm((prev) => ({ ...prev, variations: e.target.value }))}
                  />
                </label>
                <label className="ai-form-field">
                  <span>Câu trả lời *</span>
                  <textarea
                    rows={5}
                    value={form.answer}
                    onChange={(e) => setForm((prev) => ({ ...prev, answer: e.target.value }))}
                    required
                  />
                </label>
                <label className="ai-form-field">
                  <span>Gợi ý câu hỏi tiếp theo (mỗi dòng một gợi ý)</span>
                  <textarea
                    rows={3}
                    value={form.suggestions}
                    onChange={(e) => setForm((prev) => ({ ...prev, suggestions: e.target.value }))}
                  />
                </label>
                <label className="ai-form-field">
                  <span>Thẻ (phân tách bằng dấu phẩy)</span>
                  <input
                    type="text"
                    value={form.tags}
                    onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))}
                    placeholder="đặt phòng, thanh toán"
                  />
                </label>
                <label className="ai-form-field">
                  <span>Trạng thái</span>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                    className="reports-select"
                  >
                    <option value="Active">Đang sử dụng</option>
                    <option value="Draft">Nháp / Tạm dừng</option>
                  </select>
                </label>
                <div className="ai-form-actions">
                  <button type="submit" className="ph-btn ph-btn--success" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu mẫu'}</button>
                  <button type="button" className="ph-btn ph-btn--secondary" onClick={closeModal} disabled={saving}>Hủy</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <style>{`
        .ai-training-root { padding: 16px; }
        .ai-training-toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 16px; }
        .ai-training-toolbar .reports-input { width: clamp(220px, 32vw, 340px); }
        .ai-training-toolbar .reports-select { height: 38px; }
        .ai-training-table-wrap { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; }
        .ai-training-table { width: 100%; border-collapse: collapse; font-size: 14px; }
        .ai-training-table th, .ai-training-table td { padding: 10px 12px; border-bottom: 1px solid #e5eaf1; vertical-align: top; }
        .ai-training-table th { background: #f8fafc; font-weight: 600; color: #1f2937; }
        .ai-training-table tbody tr:hover { background: #fff9eb; }
        .ai-training-question { font-weight: 600; color: #111827; }
        .ai-training-answer { max-height: 4.5em; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; color: #334155; }
        .ai-training-taglist { display: flex; flex-wrap: wrap; gap: 6px; }
        .ai-training-tag { background: #fef3c7; color: #b45309; border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 600; }
        .ai-training-status { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 10px; font-weight: 600; font-size: 13px; }
        .ai-training-status.active { background: #dcfce7; color: #047857; border: 1px solid #bbf7d0; }
        .ai-training-status.draft { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
        .ai-training-actions { display: flex; flex-wrap: wrap; gap: 8px; }
        .ai-training-actions .ph-btn { min-width: 88px; }
        .ai-training-subtext { font-size: 12px; color: #64748b; margin-top: 4px; }
        .ai-training-modal { width: clamp(360px, 65vw, 720px); max-height: 90vh; overflow-y: auto; }
        .ai-form { display: flex; flex-direction: column; gap: 14px; }
        .ai-form-field { display: flex; flex-direction: column; gap: 6px; font-size: 14px; color: #1f2937; }
        .ai-form-field textarea, .ai-form-field input { border: 1px solid #d0d7e2; border-radius: 8px; padding: 8px 10px; font-size: 14px; }
        .ai-form-field textarea:focus, .ai-form-field input:focus { outline: none; border-color: #f59f00; box-shadow: 0 0 0 2px rgba(245, 159, 0, 0.2); }
        .ai-form-actions { display: flex; gap: 12px; justify-content: flex-end; padding-top: 4px; }
        .ai-preview { display: flex; flex-direction: column; gap: 12px; }
        .ai-preview-block { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
        .ai-preview-label { font-size: 12px; font-weight: 700; letter-spacing: 0.5px; color: #475569; text-transform: uppercase; margin-bottom: 4px; }
        .ai-preview-footer { display: flex; justify-content: flex-end; margin-top: 12px; }
        @media (max-width: 720px) {
          .ai-training-actions { flex-direction: column; align-items: stretch; }
          .ai-training-actions .ph-btn { width: 100%; }
          .ai-training-toolbar { flex-direction: column; align-items: stretch; }
          .ai-training-toolbar .reports-input { width: 100%; }
          .ai-training-modal { width: 94vw; }
        }
      `}</style>
    </div>
  );
}
