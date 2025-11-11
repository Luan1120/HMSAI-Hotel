import React, { useState } from 'react';
import './Auth.css';
import MeteorBg from './MeteorBg';
import { Link } from 'react-router-dom';

function ForgotPassword() {
    const [email, setEmail] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        // chuyển đến trang đặt lại mật khẩu
        window.location.href = `/reset-password?email=${encodeURIComponent(email)}`;
    };

    return (
        <>
            <MeteorBg />
            <div className="auth-container">
                <div className="snake-border-top"></div>
                <div className="snake-border-bottom"></div>
                <h2>QUÊN MẬT KHẨU</h2>
                <form onSubmit={handleSubmit}>
                    <label>Nhập Email Của Bạn</label>
                    <input
                        id="email"
                        type="email"
                        className="auth-input"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        required
                    />
                    <button type="submit" className="btn-primary">Tiếp tục</button>
                    <div className="auth-links">
                        <span>Đã nhớ mật khẩu ?</span>
                        <Link to="/login">Đăng Nhập</Link>
                    </div>
                </form>
            </div>
        </>
    );
}

export default ForgotPassword;
