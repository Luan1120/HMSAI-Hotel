import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './Auth.css';
import MeteorBg from './MeteorBg';

const ResetPassword = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    // Prefill email from query string if provided
    useEffect(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            const qEmail = params.get('email');
            if (qEmail) setEmail(qEmail);
        } catch {}
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setError('Mật khẩu xác nhận không khớp!');
            setMessage('');
            return;
        }
        try {
            const res = await fetch('http://localhost:5000/api/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.message || 'Đổi mật khẩu thất bại');
                setMessage('');
                return;
            }
            setMessage(data.message || 'Đổi mật khẩu thành công!');
            setError('');
            // clear sensitive fields
            setPassword('');
            setConfirmPassword('');
        } catch (err) {
            setError('Có lỗi xảy ra, vui lòng thử lại!');
            setMessage('');
        }
    };

    return (
        <>
            <MeteorBg />
            <div className="auth-container">
                <div className="snake-border-top"></div>
                <div className="snake-border-bottom"></div>
                <h2>TẠO MẬT KHẨU MỚI</h2>
                <form onSubmit={handleSubmit}>
                    <label htmlFor="email">Email</label>
                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                    />
                    <label>Mật Khẩu</label>
                    <div className="password-field">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Mật khẩu"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                        <span className="toggle-password" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Ẩn' : 'Hiện'}</span>
                    </div>
                    <label>Xác Nhận Mật Khẩu</label>
                    <div className="password-field">
                        <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            placeholder="Xác nhận mật khẩu"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            required
                        />
                        <span className="toggle-password" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>{showConfirmPassword ? 'Ẩn' : 'Hiện'}</span>
                    </div>
                    <button type="submit" className="btn-primary">Xác nhận</button>
                </form>
                {error && <div className="error-msg">{error}</div>}
                {message && <div className="success-msg">{message}</div>}
                <div className="auth-links">
                    <span>Tạo tài khoản mới ? </span>
                    <Link className="auth-link" to="/register">Đăng ký</Link>
                </div>
            </div>
        </>
    );
};

export default ResetPassword;
