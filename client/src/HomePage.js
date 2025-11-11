import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import RoomTypeInline from './RoomTypeInline';
import RoomsBrowse from './RoomsBrowse';
import ServicesBrowse from './ServicesBrowse';
import AdminUsers from './AdminUsers';
import AdminServices from './AdminServices';
import AdminPromotions from './AdminPromotions';
import AdminAmenities from './AdminAmenities';
import AdminRooms from './AdminRooms';
import AdminBookings from './AdminBookings';
import PaymentHistory from './PaymentHistory';
import Profile from './Profile';
import CheckInOut from './CheckInOut';
import { getUserRole, authHeaders } from './auth';
import CustomerSupport from './CustomerSupport';
import StaffSupport from './StaffSupport';
import './Auth.css';
import './HomePage.css';
import ChatBotAI from './ChatBotAI';
import showToast from './toast';
import AdminReports from './AdminReports';
import AdminFeedback from './AdminFeedback';
import NotificationsBell from './NotificationsBell';
// Promotions feature removed

const HomePage = () => {
  const [inlineType, setInlineType] = useState('');
  const [roomTypes, setRoomTypes] = useState([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [typesError, setTypesError] = useState('');
  const [openProfile, setOpenProfile] = useState(false);
  const [openHistory, setOpenHistory] = useState(false);
  const [openAdminUsers, setOpenAdminUsers] = useState(false);
  const [openAdminServices, setOpenAdminServices] = useState(false);
  const [openAdminRooms, setOpenAdminRooms] = useState(false);
  const [openAdminAmenities, setOpenAdminAmenities] = useState(false);
  const [openAdminBookings, setOpenAdminBookings] = useState(false);
  const [highlightBookingId, setHighlightBookingId] = useState(null);
  const [openAdminReports, setOpenAdminReports] = useState(false);
  const [openAdminFeedback, setOpenAdminFeedback] = useState(false);
  const [openAdminPromotions, setOpenAdminPromotions] = useState(false);
  const [showOffersModal, setShowOffersModal] = useState(false);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersList, setOffersList] = useState([]);
  const [offersError, setOffersError] = useState('');
  const [offersLoadedAt, setOffersLoadedAt] = useState(null);
  // const [openAdminPromotions, setOpenAdminPromotions] = useState(false); // removed
  const [openCheckInOut, setOpenCheckInOut] = useState(false);
  const [openCustomerSupport, setOpenCustomerSupport] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [openChat, setOpenChat] = useState(false);
  const [showRoomsOverlay, setShowRoomsOverlay] = useState(false);
  const [returnDraft, setReturnDraft] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showServicesOverlay, setShowServicesOverlay] = useState(false);
  const scrollerRef = useRef(null);
  // Load danh sách ưu đãi (offers) khi mở modal hoặc khi người dùng nhấn làm mới
  const refreshOffers = async () => {
    setOffersLoading(true); setOffersError('');
    try {
      const res = await fetch('/api/promotions');
      if (!res.ok) throw new Error('Không tải được ưu đãi');
      const j = await res.json();
      setOffersList(Array.isArray(j.items) ? j.items : []);
      setOffersLoadedAt(Date.now());
    } catch (e) {
      setOffersError(e.message || 'Lỗi tải ưu đãi');
      setOffersList([]);
    } finally { setOffersLoading(false); }
  };

  // Tự động tải lần đầu khi modal mở và chưa có dữ liệu
  useEffect(() => {
    if (showOffersModal && offersList.length === 0 && !offersLoading && !offersError) {
      refreshOffers();
    }
  }, [showOffersModal]);

  // Khôi phục overlay đặt phòng nếu quay lại từ trang thanh toán với tham số ?return=1
  useEffect(() => {
    try {
      if (searchParams.get('return') === '1') {
        const raw = sessionStorage.getItem('hmsReturnBookingDraft');
        if (raw) {
          try { const parsed = JSON.parse(raw); setReturnDraft(parsed); setShowRoomsOverlay(true); } catch { /* ignore */ }
        }
        // Xóa param để tránh lặp lại khi user tương tác tiếp
        searchParams.delete('return');
        setSearchParams(searchParams, { replace: true });
      }
    } catch { /* ignore */ }
  }, [searchParams, setSearchParams]);

  const scrollByViewport = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    const vw = el.clientWidth;
    el.scrollBy({ left: dir * (vw - 40), behavior: 'smooth' });
  };


  useEffect(() => {
    let active = true;
    setTypesLoading(true);
    setTypesError('');
    fetch('/api/room-types')
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.message || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((list) => { if (active) setRoomTypes(Array.isArray(list) ? list : []); })
      .catch((err) => { if (active) setTypesError(err.message || 'Lỗi tải hạng phòng'); })
      .finally(() => { if (active) setTypesLoading(false); });
    return () => { active = false; };
  }, []);

  // Listen for requests to open admin bookings from other parts of the app
  useEffect(() => {
    const onOpenAdminBookings = (e) => {
      const bid = e && e.detail && e.detail.bookingId ? Number(e.detail.bookingId) : null;
      setHighlightBookingId(bid);
      setOpenAdminBookings(true);
    };
    window.addEventListener('open-admin-bookings', onOpenAdminBookings);
    return () => window.removeEventListener('open-admin-bookings', onOpenAdminBookings);
  }, []);

  const scrollTop = () => {
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
  };

  return (
    <div className="home-root">
      <header className="home-header">
        <div className="home-header-left">
          <img src="/logo.png" alt="HMS Logo" className="home-header-logo" />
          <button type="button" onClick={scrollTop} className="home-header-title home-header-home-btn">TRANG CHỦ</button>
        </div>
        <div className="home-header-search">
          <input type="text" className="home-header-search-input" placeholder="Tìm kiếm..." />
          <img src="/icon-search.png" alt="Search" className="home-header-search-img" />
        </div>
        <div className="home-header-icons">
          <span className="home-header-icon"><img src="/icon-language.png" alt="Language" className="home-header-icon-img" /></span>
          <NotificationsBell />
          <GridMenu
            onOpenHistory={() => setOpenHistory(true)}
            onOpenReviews={() => setReviewing('list')}
            onOpenServices={() => setShowServicesOverlay(true)}
            onOpenOffers={() => setShowOffersModal(true)}
            onOpenAdminUsers={() => setOpenAdminUsers(true)}
            onOpenAdminServices={() => setOpenAdminServices(true)}
            onOpenAdminRooms={() => setOpenAdminRooms(true)}
            onOpenAdminAmenities={() => setOpenAdminAmenities(true)}
            onOpenAdminBookings={() => setOpenAdminBookings(true)}
            onOpenAdminReports={() => setOpenAdminReports(true)}
            onOpenAdminFeedback={() => setOpenAdminFeedback(true)}
            onOpenAdminPromotions={() => setOpenAdminPromotions(true)}
            // promotions removed
            onOpenCheckInOut={() => setOpenCheckInOut(true)}
            onOpenCustomerSupport={() => setOpenCustomerSupport(true)}
          />
          {/* User menu */}
          <UserMenu onOpenProfile={() => setOpenProfile(true)} />
        </div>
      </header>
      {/* Banner Section */}
      <section className="home-banner">
        <img
          src="/HomeBanner/home-banner.png"
          alt="Hotel Banner"
          className="home-banner-img"
        />
        <div className="home-banner-content">
          <h1 className="home-banner-title">
            WELCOME TO<br />HMS-AI
          </h1>
          <h2 className="home-banner-subtitle">
            HỆ THỐNG QUẢN LÝ KHÁCH SẠN <br />TRỰC TUYẾN
          </h2>
          <button
            className="btn-primary home-banner-btn"
            onClick={() => {
              try {
                if (getUserRole() === 'Admin') { showToast('Tài khoản admin không được phép đặt phòng', { duration: 2200, type: 'warn' }); return; }
              } catch {}
              setShowRoomsOverlay(true);
            }}
            disabled={getUserRole() === 'Admin'}
          >ĐẶT PHÒNG NGAY</button>
        </div>
        {/* Chatbot Icon */}
        <div className="home-chatbot" role="button" aria-label="Mở chat hỗ trợ" onClick={()=> setOpenChat(v=>!v)}>
          <img src="/chatbox.png" alt="Chatbot" className="home-chatbot-img" />
          <div className="home-chatbot-label">CHATBOT</div>
        </div>

      </section>

      {/* Info Section */}
      <section className="home-info">
        <div className="home-info-text">
          <h2 className="home-info-title">
            Nơi nghỉ dưỡng đẳng cấp – Chạm đến từng khoảnh khắc bình yên
          </h2>
          <p className="home-info-desc">
            Khách sạn HMS-AI mang đến bạn một không gian nghỉ dưỡng sang trọng và tiện nghi bậc nhất. Với hệ thống phòng hiện đại, dịch vụ chuyên nghiệp cùng đội ngũ nhân viên thân thiện, chúng tôi cam kết mang lại cho bạn những trải nghiệm thoải mái và đáng nhớ. Hãy để HMS-AI trở thành điểm đến lý tưởng cho kỳ nghỉ hoặc chuyến công tác của bạn!
          </p>
        </div>
        <div className="home-info-img-wrap">
          <img
            src="/HomeBanner/home.png"
            alt="Resort View"
            className="home-info-img"
          />
        </div>
      </section>

      {/* Rooms Section */}
      <section className="home-rooms">
        <h2 className="home-rooms-title">Hạng Phòng</h2>
        {typesLoading && <div>Đang tải danh sách hạng phòng...</div>}
        {typesError && <div style={{ color: 'red' }}>{typesError}</div>}
        {!typesLoading && !typesError && (
          <div className="home-rooms-scroller">
            <button type="button" className="home-rooms-nav left" aria-label="Trước" onClick={() => scrollByViewport(-1)}>{'<'}</button>
            <div className="home-rooms-grid" ref={scrollerRef}>
              {roomTypes.length === 0 ? (
                <div>Chưa có hạng phòng nào.</div>
              ) : (
                roomTypes.map((rt) => {
                  const img = rt.image || '/khachsan/hp1.jpg';
                  const maxAdults = Number(rt.maxAdults || 0);
                  const maxChildren = Number(rt.maxChildren || 0);
                  const price = Number(rt.basePrice || 0);
                  return (
                    <button
                      key={rt.id}
                      onClick={() => setInlineType(rt.name)}
                      className="home-room-card"
                      style={{ textAlign: 'left' }}
                    >
                      <img className="home-room-img" src={img} alt={rt.name} />
                      <div className="home-room-meta">{maxAdults} người lớn | {maxChildren} trẻ em</div>
                      <div className="home-room-name">{rt.name}</div>
                      <div className="home-room-price">Giá từ {price.toLocaleString('vi-VN')} VNĐ/đêm</div>
                    </button>
                  );
                })
              )}
            </div>
            <button type="button" className="home-rooms-nav right" aria-label="Sau" onClick={() => scrollByViewport(1)}>{'>'}</button>
          </div>
        )}
        {inlineType && (
          <RoomTypeInline name={inlineType} onClose={() => setInlineType('')} />
        )}
      </section>

      {showRoomsOverlay && (
        <div className="profile-overlay" style={{ zIndex: 1500 }} onMouseDown={(e) => { if (e.target === e.currentTarget) setShowRoomsOverlay(false); }}>
          <div className="profile-modal" style={{ width: '95%', maxWidth: 1400, padding: 0, display: 'flex', flexDirection: 'column' }} onMouseDown={e => e.stopPropagation()}>
            <div style={{ flex: 1, overflow: 'auto', padding: '4px 4px 12px' }}>
              <RoomsBrowse inline onClose={() => setShowRoomsOverlay(false)} restoredDraft={returnDraft} />
            </div>
          </div>
        </div>
      )}

      {showServicesOverlay && (
        <div className="profile-overlay" style={{ zIndex: 1500 }} onMouseDown={(e) => { if (e.target === e.currentTarget) setShowServicesOverlay(false); }}>
          <div className="profile-modal" style={{ width: '90%', maxWidth: 1200, padding: 0, display: 'flex', flexDirection: 'column' }} onMouseDown={e => e.stopPropagation()}>
            <div style={{ flex: 1, overflow: 'auto', padding: '4px 4px 12px' }}>
              <ServicesBrowse inline onClose={() => setShowServicesOverlay(false)} />
            </div>
          </div>
        </div>
      )}

      {/* Stay Experience Section */}
      <section className="home-experience">
        <div className="home-experience-left">
          <h2 className="home-experience-title">Trải Nghiệm Lưu Trú</h2>
          <p className="home-experience-desc">
            Khám phá không gian nghỉ dưỡng đẳng cấp với hạng phòng tiêu biểu của chúng tôi — nét thiết kế tinh tế hòa quyện cùng tiện nghi hiện đại mang đến trải nghiệm lưu trú khó quên. 
            Mỗi phòng đều được trang trí bằng những vật liệu cao cấp, tạo nên sự sang trọng và ấm cúng, khiến bạn cảm thấy như đang ở trong một thiên đường riêng. Không chỉ có vậy, tầm nhìn hướng ra cảnh quan tuyệt đẹp sẽ khiến bạn bị cuốn hút, mang lại cảm giác thư giãn tuyệt đối. 
            Tại đây, bạn sẽ được tận hưởng những dịch vụ chăm sóc khách hàng tận tình, giúp cho kỳ nghỉ của bạn trở nên hoàn hảo hơn bao giờ hết.
          </p>
        </div>
        <div className="home-experience-right">
          <div className="home-frame">
            <img className="home-frame-img" src="/khachsan/ks10.png" alt="Phòng nghỉ" />
          </div>
          <div className="home-caption">Phòng nghỉ đẳng cấp, tiện nghi đầy đủ và không gian thoải mái, mang đến cảm giác thư giãn như chính ngôi nhà của bạn. Mỗi chi tiết trong phòng đều được thiết kế tỉ mỉ, từ nội thất sang trọng đến ánh sáng ấm áp, tạo nên một bầu không khí dễ chịu và gần gũi.</div>
        </div>
      </section>

      {/* Experience Gallery */}
      <section className="home-gallery">
        <div className="home-gallery-item">
          <img className="home-gallery-img" src="/khachsan/ks11.png" alt="" />
          <div className="home-gallery-caption">Không gian ấm áp, nội thất tinh tế — lựa chọn hoàn hảo cho kỳ nghỉ đáng nhớ.</div>
        </div>
        <div className="home-gallery-item">
          <img className="home-gallery-img" src="/khachsan/ks12.png" alt="" />
          <div className="home-gallery-caption">Mỗi chi tiết trong căn phòng đều được chăm chút, tạo nên sự thoải mái và đẳng cấp cho khách hàng.</div>
        </div>
      </section>

      {/* Offers Section */}
      <section className="home-offers" id="offers-section">
        <h2 className="home-offers-title">Ưu đãi dành cho bạn</h2>
        <div className="home-offers-grid">
          <article className="home-offer-card">
            <img className="home-offer-img" src="/khachsan/ks1.png" alt="Đặt phòng sớm" />
            <div className="home-offer-body">
              <h3 className="home-offer-card-title">Đặt phòng sớm</h3>
              <ul className="home-offer-list">
                <li>Đặt phòng trước 30 ngày để nhận ngay giảm giá 20%.</li>
                <li>Tiết kiệm chi phí, đảm bảo chỗ nghỉ trong mùa cao điểm.</li>
              </ul>
            </div>
          </article>
          <article className="home-offer-card">
            <img className="home-offer-img" src="/khachsan/ks2.png" alt="Câu lạc bộ Wellhall" />
            <div className="home-offer-body">
              <h3 className="home-offer-card-title">Câu lạc bộ Wellhall</h3>
              <ul className="home-offer-list">
                <li>Giảm giá khi đặt phòng.</li>
                <li>Nâng hạng phòng miễn phí tùy tình trạng.</li>
                <li>Được hưởng các dịch vụ VIP riêng biệt.</li>
              </ul>
            </div>
          </article>
          <article className="home-offer-card">
            <img className="home-offer-img" src="/khachsan/ks3.png" alt="Ở 3 đêm tặng 1 đêm" />
            <div className="home-offer-body">
              <h3 className="home-offer-card-title">Ở 3 đêm - Tặng 1 đêm miễn phí</h3>
              <ul className="home-offer-list">
                <li>Đặt phòng liên tiếp 3 đêm, nhận ngay 1 đêm miễn phí.</li>
                <li>Kỳ nghỉ dài hơn mà không lo về chi phí.</li>
              </ul>
            </div>
          </article>
        </div>
      </section>

      {/* About band with testimonials */}
      <section className="home-about">
        <div className="home-about-overlay"></div>
        <div className="home-about-inner">
          <h2 className="home-about-title">Về chúng tôi</h2>
          <div className="home-about-grid">
            <blockquote className="home-quote">
              <p>Khách sạn HMS-AI mang đến trải nghiệm nghỉ dưỡng đẳng cấp, kết hợp công nghệ hiện đại với sự hiếu khách truyền thống. Một điểm đến lý tưởng cho mọi du khách.</p>
              <cite>Santa Solana Post</cite>
            </blockquote>
            <blockquote className="home-quote">
              <p>Không chỉ là một nơi lưu trú, HMS-AI còn mang lại dịch vụ chăm sóc khách hàng tận tâm. Đặc biệt, hệ thống đặt phòng thông minh giúp tiết kiệm thời gian và chi phí.</p>
              <cite>Marianne’s Luxe Travels</cite>
            </blockquote>
            <blockquote className="home-quote">
              <p>Với không gian sang trọng, tiện nghi cao cấp và chatbot AI hỗ trợ 24/7, HMS-AI đang thay đổi cách khách hàng trải nghiệm dịch vụ khách sạn trực tuyến.</p>
              <cite>Fairhill Journal</cite>
            </blockquote>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="home-footer">
        <div className="home-footer-top">HMS–AI Hotel</div>
        <div className="home-footer-cols">
          <div className="home-footer-col">
            <h4>Địa chỉ liên hệ</h4>
            <ul className="home-contact-list">
              <li>
                <img src="/icon-location.png" alt="Địa chỉ" />
                <span>Đại học Duy Tân</span>
              </li>
              <li>
                <img src="/icon-phone.png" alt="Điện thoại" />
                <span>0123-456-7890</span>
              </li>
              <li>
                <img src="/icon-mail.png" alt="Email" />
                <span>HMS_AI_Hotel@gmail.com</span>
              </li>
            </ul>
          </div>
          <div className="home-footer-col">
            <h4>Kết nối với chúng tôi</h4>
            <div className="home-social">
              <a href="https://www.facebook.com" target="_blank" rel="noreferrer" className="home-social-icon">
                <img src="/icon-facebook.png" alt="Facebook" />
              </a>
              <a href="https://twitter.com" target="_blank" rel="noreferrer" className="home-social-icon">
                <img src="/icon-twitter.png" alt="Twitter" />
              </a>
              <a href="https://www.instagram.com" target="_blank" rel="noreferrer" className="home-social-icon">
                <img src="/icon-instagram.png" alt="Instagram" />
              </a>
            </div>
            <div className="home-footer-note">Đừng quên theo dõi HMS-AI Hotel để nhận ưu đãi hấp dẫn.</div>
          </div>
          <div className="home-footer-col">
            <h4>Điều khoản & Chỉnh sách</h4>
            <ul>
              <li>Điều khoản sử dụng</li>
              <li>Chính sách bảo mật</li>
              <li>Chính sách hủy phòng</li>
              <li>Quy định & hỗ trợ khách hàng</li>
            </ul>
          </div>
        </div>
      </footer>
      {openProfile && (
        <Profile isModal onClose={() => setOpenProfile(false)} />
      )}
      {openHistory && (
        <div
          className="profile-overlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenHistory(false); }}
        >
          <button className="profile-back" type="button" aria-label="Quay lại" onClick={() => setOpenHistory(false)}>
            ← Quay lại
          </button>
          <div
            className="profile-modal"
            style={{ maxWidth: '98%', width: '98%', marginTop: 56 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ background: '#fff', borderRadius: 12, padding: 8 }}>
              <PaymentHistory inline onReview={(it) => setReviewing(it)} />
            </div>
          </div>
        </div>
      )}
      {openAdminUsers && (
        <div
          className="profile-overlay profile-overlay--center"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenAdminUsers(false); }}
          style={{ alignItems: 'flex-start' }}
        >
          <button className="profile-back" type="button" aria-label="Quay lại" onClick={() => setOpenAdminUsers(false)}>
            ← Quay lại
          </button>
          <div
            className="profile-modal"
            style={{ maxWidth: '1100px', width: '98%', marginTop: 56, maxHeight: '90vh', overflow: 'auto' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ background: '#fff', borderRadius: 12, padding: 8 }}>
              <AdminUsers isModal onClose={() => setOpenAdminUsers(false)} />
            </div>
          </div>
        </div>
      )}
      {openAdminServices && (
        <div
          className="profile-overlay profile-overlay--center"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenAdminServices(false); }}
          style={{ alignItems: 'flex-start' }}
        >
          <button className="profile-back" type="button" aria-label="Quay lại" onClick={() => setOpenAdminServices(false)}>
            ← Quay lại
          </button>
          <div
            className="profile-modal"
            style={{ maxWidth: '100%', width: '100%', marginTop: 56 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ background: '#fff', borderRadius: 12, padding: 8 }}>
              <AdminServices isModal onClose={() => setOpenAdminServices(false)} />
            </div>
          </div>
        </div>
      )}
      {openAdminRooms && (
        <div
          className="profile-overlay profile-overlay--center"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenAdminRooms(false); }}
          style={{ alignItems: 'flex-start' }}
        >
          <button className="profile-back" type="button" aria-label="Quay lại" onClick={() => setOpenAdminRooms(false)}>
            ← Quay lại
          </button>
          <div
            className="profile-modal"
            style={{ maxWidth: '100%', width: '100%', marginTop: 56 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ background: '#fff', borderRadius: 12, padding: 8 }}>
              <AdminRooms isModal onClose={() => setOpenAdminRooms(false)} />
            </div>
          </div>
        </div>
      )}
      {openAdminAmenities && (
        <div
          className="profile-overlay profile-overlay--center"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenAdminAmenities(false); }}
          style={{ alignItems: 'flex-start' }}
        >
          <button className="profile-back" type="button" aria-label="Quay lại" onClick={() => setOpenAdminAmenities(false)}>
            ← Quay lại
          </button>
          <div
            className="profile-modal"
            style={{ maxWidth: '100%', width: '100%', marginTop: 56 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ background: '#fff', borderRadius: 12, padding: 8 }}>
              <AdminAmenities isModal onClose={() => setOpenAdminAmenities(false)} />
            </div>
          </div>
        </div>
      )}
      {openAdminBookings && (
        <div
          className="profile-overlay profile-overlay--center"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenAdminBookings(false); }}
          style={{ alignItems: 'flex-start' }}
        >
          <button className="profile-back" type="button" aria-label="Quay lại" onClick={() => setOpenAdminBookings(false)}>
            ← Quay lại
          </button>
          <div
            className="profile-modal"
            style={{ maxWidth: '100%', width: '100%', marginTop: 56 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ background: '#fff', borderRadius: 12, padding: 8 }}>
              <AdminBookings isModal onClose={() => { setOpenAdminBookings(false); setHighlightBookingId(null); }} highlightBookingId={highlightBookingId} />
            </div>
          </div>
        </div>
      )}
      {openAdminReports && (
        <div
          className="profile-overlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenAdminReports(false); }}
          style={{ alignItems: 'flex-start' }}
        >
          <button className="profile-back" type="button" aria-label="Quay lại" onClick={() => setOpenAdminReports(false)} style={{ top: 12, left: 12 }}>
            ← Quay lại
          </button>
          <div
            className="profile-modal"
            style={{ maxWidth: 'calc(100vw - 24px)', width: '100%', marginTop: 56, maxHeight: '90vh', overflow: 'auto' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ background: '#fff', borderRadius: 12, padding: 8 }}>
              <AdminReports isModal onClose={() => setOpenAdminReports(false)} />
            </div>
          </div>
        </div>
      )}
      {openAdminFeedback && (
        <div
          className="profile-overlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenAdminFeedback(false); }}
          style={{ alignItems: 'flex-start' }}
        >
          <button className="profile-back" type="button" aria-label="Quay lại" onClick={() => setOpenAdminFeedback(false)}>
            ← Quay lại
          </button>
          <div
            className="profile-modal"
            style={{ maxWidth: 'calc(100vw - 24px)', width: '100%', marginTop: 56, maxHeight: '90vh', overflow: 'auto' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ background: '#fff', borderRadius: 12, padding: 8 }}>
              <AdminFeedback isModal onClose={() => setOpenAdminFeedback(false)} />
            </div>
          </div>
        </div>
      )}
      {/* AdminPromotions modal */}
      {openAdminPromotions && (
        <div
          className="profile-overlay profile-overlay--center"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenAdminPromotions(false); }}
          style={{ alignItems: 'flex-start' }}
        >
          <button className="profile-back" type="button" aria-label="Quay lại" onClick={() => setOpenAdminPromotions(false)}>
            ← Quay lại
          </button>
          <div
            className="profile-modal"
            style={{ maxWidth: '1100px', width: '98%', marginTop: 56, maxHeight: '90vh', overflow: 'auto' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ background: '#fff', borderRadius: 12, padding: 8 }}>
              <AdminPromotions isModal onClose={() => setOpenAdminPromotions(false)} />
            </div>
          </div>
        </div>
      )}
      {showOffersModal && (
        <div className="profile-overlay" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowOffersModal(false); }}>
          <div className="profile-modal" style={{ maxWidth: 720, width: '96%', marginTop: 56 }} onMouseDown={e => e.stopPropagation()}>
            <div style={{ padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>Ưu đãi</h2>
                <button className="ph-btn ph-btn--secondary" onClick={() => setShowOffersModal(false)}>Đóng</button>
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={{ marginBottom: 8 }}>
                  <button className="ph-btn" onClick={async () => { await refreshOffers(); }}>{offersLoadedAt ? 'Làm mới' : 'Tải danh sách'}</button>
                </div>
                {offersLoading && <div style={{ color:'#2563eb' }}>Đang tải...</div>}
                {offersError && <div style={{ color:'#b42318' }}>{offersError}</div>}
                <div style={{ maxHeight: 420, overflowY: 'auto', marginTop: 8 }}>
                  {offersList.length === 0 ? <div style={{ color:'#666', padding:12 }}>Không có ưu đãi.</div> : offersList.map(p => (
                    <div key={p.id} style={{ borderBottom:'1px solid #eee', padding:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div>
                        <div style={{ fontWeight:700 }}>{p.code} {p.description ? `— ${p.description}` : ''}</div>
                        <div style={{ color:'#555', fontSize:13 }}>{p.discountType === 'PERCENT' ? (`Giảm ${p.discountValue}%${p.maxDiscount ? ` (tối đa ${Number(p.maxDiscount).toLocaleString('vi-VN')}đ)` : ''}`) : (`Giảm ${Number(p.discountValue||0).toLocaleString('vi-VN')}đ`)}{p.minOrderAmount ? ` • Điều kiện: tối thiểu ${Number(p.minOrderAmount).toLocaleString('vi-VN')}đ` : ''}</div>
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <button className="ph-btn ph-btn--secondary" onClick={async () => {
                          try { await navigator.clipboard.writeText(String(p.code||'')); showToast('Đã sao chép mã: ' + p.code, { duration: 1800, type: 'success' }); } catch { showToast('Không thể sao chép mã, vui lòng sao chép thủ công.', { duration: 2400, type: 'error' }); }
                        }}>Sao chép mã</button>
                      </div>
                    </div>
                  ))}
                </div>
                {offersLoadedAt && <div style={{ marginTop:6, fontSize:11, color:'#64748b' }}>Cập nhật lúc: {new Date(offersLoadedAt).toLocaleTimeString('vi-VN')}</div>}
              </div>
            </div>
          </div>
        </div>
      )}
      {openCheckInOut && (
        <div
          className="profile-overlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenCheckInOut(false); }}
        >
          <button className="profile-back" type="button" aria-label="Quay lại" onClick={() => setOpenCheckInOut(false)}>
            ← Quay lại
          </button>
          <div
            className="profile-modal"
            style={{ maxWidth: '100%', width: '100%', marginTop: 56 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ background: '#fff', borderRadius: 12, padding: 8 }}>
              <CheckInOut isModal onClose={() => setOpenCheckInOut(false)} />
            </div>
          </div>
        </div>
      )}
      {openCustomerSupport && (
        <div
          className="profile-overlay profile-overlay--center"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpenCustomerSupport(false); }}
          style={{ alignItems: 'flex-start' }}
        >
          <button className="profile-back" type="button" aria-label="Quay lại" onClick={() => setOpenCustomerSupport(false)}>
            ← Quay lại
          </button>
          <div
            className="profile-modal"
            style={{ maxWidth: '100%', width: '100%', marginTop: 56 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ background: '#fff', borderRadius: 12, padding: 8 }}>
              {getUserRole() === 'Staff' ? (
                <StaffSupport isModal onClose={() => setOpenCustomerSupport(false)} />
              ) : (
                <CustomerSupport isModal onClose={() => setOpenCustomerSupport(false)} />
              )}
            </div>
          </div>
        </div>
      )}
      {reviewing && (
        <ReviewModal
          data={typeof reviewing === 'object' ? reviewing : null}
          listMode={reviewing === 'list'}
          onClose={() => setReviewing(null)}
          onEditReview={r => setReviewing({
            bookingId: r.bookingId,
            hotelName: r.hotelName,
            roomName: r.roomName,
            checkIn: r.checkIn,
            checkOut: r.checkOut
          })}
        />
      )}
      <ChatBotAI open={openChat} onClose={()=> setOpenChat(false)} />
    </div>
  );
};
export default HomePage;

function GridMenu({ onOpenHistory, onOpenReviews, onOpenServices, onOpenOffers, onOpenAdminUsers, onOpenAdminServices, onOpenAdminRooms, onOpenAdminPromotions, onOpenAdminBookings, onOpenCheckInOut, onOpenCustomerSupport, onOpenAdminReports, onOpenAdminFeedback, onOpenAdminAmenities }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('');
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDocClick); document.removeEventListener('keydown', onEsc); };
  }, []);

  const role = getUserRole();
  const isAdmin = role === 'Admin';
  const isStaff = role === 'Staff';
  // Theo yêu cầu: Admin chỉ thấy các chức năng Quản lý + Báo cáo/Thống kê (loại bỏ các mục chung khách hàng)
  let items;
  if (isAdmin) {
    items = [
      { key: 'manage-users', label: 'QUẢN LÝ NGƯỜI DÙNG' },
      { key: 'manage-services', label: 'QUẢN LÝ DỊCH VỤ KHÁCH SẠN' },
      { key: 'manage-rooms', label: 'QUẢN LÝ PHÒNG' },
      { key: 'manage-promotions', label: 'QUẢN LÝ ƯU ĐÃI' },
      { key: 'manage-amenities', label: 'QUẢN LÝ TIỆN NGHI' },
      { key: 'manage-bookings', label: 'QUẢN LÝ ĐẶT PHÒNG' },
      { key: 'manage-feedback', label: 'QUẢN LÝ PHẢN HỒI' },
      { key: 'reports', label: 'BÁO CÁO, THỐNG KÊ' },
    ];
  } else {
    // Người dùng thường hoặc Staff vẫn thấy các mục chung
    items = [
      { key: 'news', label: 'TIN TỨC' },
      { key: 'offers', label: 'ƯU ĐÃI' },
      { key: 'services', label: 'DỊCH VỤ' },
      { key: 'history', label: 'LỊCH SỬ GIAO DỊCH', to: '/transactions' },
      { key: 'reviews', label: 'ĐÁNH GIÁ', isReview: true },
      ...(isStaff ? [
        { key: 'checkinout', label: 'QUẢN LÝ CHECK IN - CHECK OUT' },
        { key: 'support', label: 'HỖ TRỢ KHÁCH HÀNG' },
      ] : []),
    ];
  }

  return (
    <div className="grid-menu" ref={ref}>
      <button
        type="button"
        className={`home-header-icon grid-btn ${open ? 'is-open' : ''} ${active ? 'has-active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <img src="/icon-grid.png" alt="Grid" className={`home-header-icon-img ${active ? 'active' : ''}`} />
      </button>
      {open && (
        <div className="grid-menu-dropdown" role="menu">
          {items.map((it) => (
            <button
              key={it.key}
              type="button"
              className={`grid-item ${active === it.key ? 'active' : ''}`}
              onClick={() => {
                setActive(it.key);
                setOpen(false);
                if (it.key === 'history' && typeof onOpenHistory === 'function') { onOpenHistory(); return; }
                // Requirement: clicking 'TIN TỨC' scrolls to 'Ưu đãi dành cho bạn'
                if (it.key === 'news') {
                  try {
                    const el = document.getElementById('offers-section');
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  } catch {}
                  return;
                }
                if (it.key === 'offers' && typeof onOpenOffers === 'function') { onOpenOffers(); return; }
                if (it.isReview && typeof onOpenReviews === 'function') { onOpenReviews(); return; }
                if (it.key === 'services' && typeof onOpenServices === 'function') { onOpenServices(); return; }
                if (it.key === 'manage-users' && typeof onOpenAdminUsers === 'function') { onOpenAdminUsers(); return; }
                if (it.key === 'manage-rooms' && typeof onOpenAdminRooms === 'function') { onOpenAdminRooms(); return; }
                if (it.key === 'manage-promotions' && typeof onOpenAdminPromotions === 'function') { onOpenAdminPromotions(); return; }
                if (it.key === 'manage-amenities' && typeof onOpenAdminAmenities === 'function') { onOpenAdminAmenities(); return; }
                if (it.key === 'manage-bookings' && typeof onOpenAdminBookings === 'function') { onOpenAdminBookings(); return; }
                if (it.key === 'manage-services' && typeof onOpenAdminServices === 'function') { onOpenAdminServices(); return; }
                if (it.key === 'checkinout' && typeof onOpenCheckInOut === 'function') { onOpenCheckInOut(); return; }
                if (it.key === 'support' && typeof onOpenCustomerSupport === 'function') { onOpenCustomerSupport(); return; }
                if (it.key === 'reports' && typeof onOpenAdminReports === 'function') { onOpenAdminReports(); return; }
                if (it.key === 'manage-feedback' && typeof onOpenAdminFeedback === 'function') { onOpenAdminFeedback(); return; }
                // promotions handler removed
                if (it.to) navigate(it.to);
              }}
            >
              <span className="grid-dot" aria-hidden />
              <span className="grid-label">{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu({ onOpenProfile }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('');
  const [user, setUser] = useState(null);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const handleEsc = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  // Load user from localStorage and listen for changes (e.g., after login)
  useEffect(() => {
    const loadUser = () => {
      try {
        const u = localStorage.getItem('hmsUser');
        const parsed = u ? JSON.parse(u) : null;
        if (parsed && parsed.avatar && typeof parsed.avatar === 'string' && parsed.avatar.startsWith('/')) {
          // Ensure absolute URL to avoid broken image in some setups
          parsed.avatar = parsed.avatar; // CRA proxy serves /uploads from backend
        }
        setUser(parsed);
      } catch {
        setUser(null);
      }
    };
    loadUser();
    const onStorage = (e) => {
      if (!e || e.key === 'hmsUser') loadUser();
    };
    window.addEventListener('storage', onStorage);
    // Custom event for same-tab updates
    window.addEventListener('hms-auth-change', loadUser);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('hms-auth-change', loadUser);
    };
  }, []);

  // Enrich user with avatar if missing
  useEffect(() => {
    const enrich = async () => {
      if (!user || !user.email || user.avatar) return;
      try {
        const res = await fetch(`/api/users/profile?email=${encodeURIComponent(user.email)}&_=${Date.now()}`);
        if (!res.ok) return;
        const j = await res.json();
        if (j && j.user) {
          const next = { ...user, name: j.user.name || user.name, avatar: j.user.avatar || user.avatar };
          setUser(next);
          try { localStorage.setItem('hmsUser', JSON.stringify(next)); } catch { }
          try { window.dispatchEvent(new Event('hms-auth-change')); } catch { }
        }
      } catch { }
    };
    enrich();
  }, [user && user.email, user && user.avatar]);
  return (
    <div className="home-user-menu" ref={ref}>
      <button
        type="button"
        className={`home-header-icon home-user-button ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {user?.avatar ? (
          <span className="home-avatar-circle"><img src={user.avatar} alt="avatar" /></span>
        ) : (
          <img src="/icon-user.png" alt="User" className="home-header-icon-img" />
        )}
      </button>
      {user && (
        <span className="home-user-name" style={{ marginLeft: 8 }}>
          {user.name || user.email}
        </span>
      )}
      {open && (
        <div className="home-user-dropdown" role="menu">
          {user ? (
            <>
              <div className="home-user-greet" aria-disabled>
                Xin chào, {user.name || user.email}
              </div>
              <button
                type="button"
                className="home-user-item"
                onClick={() => { setOpen(false); onOpenProfile && onOpenProfile(); }}
              >
                <span className="user-item-dot" aria-hidden />
                <span className="user-item-label">THÔNG TIN CÁ NHÂN</span>
              </button>
              <button
                type="button"
                className="home-user-item"
                onClick={() => {
                  try {
                    localStorage.removeItem('hmsUser');
                  } catch { }
                  setUser(null);
                  setOpen(false);
                  try { window.dispatchEvent(new Event('hms-auth-change')); } catch { }
                  // Navigate to homepage and scroll to top
                  try { navigate('/'); } catch { }
                  try { setTimeout(() => window.scrollTo(0, 0), 0); } catch { }
                }}
              >
                <span className="user-item-dot" aria-hidden />
                <span className="user-item-label">ĐĂNG XUẤT</span>
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className={`home-user-item ${active === 'login' ? 'active' : ''}`}
              onClick={() => {
                setActive('login');
                setOpen(false);
              }}
            >
              <span className="user-item-dot" aria-hidden />
              <span className="user-item-label">ĐĂNG NHẬP</span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewModal({ data, onClose, listMode, onEditReview }) {
  const [reviewList, setReviewList] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [user, setUser] = useState(null);
  // List mode: fetch all reviews for user
  useEffect(() => {
    if (!listMode || !user?.email) return;
    let active = true;
    setListLoading(true);
    fetch(`/api/reviews?email=${encodeURIComponent(user.email)}&_=${Date.now()}`, { cache: 'no-store' })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(j => { if (active) setReviewList(Array.isArray(j.reviews) ? j.reviews : []); })
      .catch(() => { if (active) setReviewList([]); })
      .finally(() => { if (active) setListLoading(false); });
    return () => { active = false; };
  }, [listMode, user?.email]);
  const [rating, setRating] = useState(4);
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try { const u = localStorage.getItem('hmsUser'); if (u) setUser(JSON.parse(u)); } catch { }
  }, []);
  useEffect(() => {
    if (user) { setName(user.name || ''); setEmail(user.email || ''); }
  }, [user]);
  useEffect(() => {
    if (listMode) return;
    let active = true;
    const load = async () => {
      if (!data?.bookingId || !user?.email) { setLoading(false); return; }
      try {
        setLoading(true);
        const url = new URL('/api/reviews', window.location.origin);
        url.searchParams.set('email', user.email);
        url.searchParams.set('bookingId', String(data.bookingId));
        url.searchParams.set('_', String(Date.now()));
        const res = await fetch(url.toString(), { cache: 'no-store' });
        if (!active) return;
        if (res.ok) {
          const j = await res.json();
          if (j?.review) {
            setRating(j.review.rating || 4);
            setComment(j.review.comment || '');
          } else {
            // No review yet: keep defaults
          }
        } else {
          // keep defaults on error
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [listMode, data?.bookingId, user?.email]);

  const submit = async () => {
    setErrMsg('');
    if (!rating || !email || !data?.bookingId) { setErrMsg('Thiếu thông tin bắt buộc'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          bookingId: data.bookingId,
          rating, // 0.5 steps; server converts to integer halves
          comment
        })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ message: 'Lỗi gửi đánh giá' }));
        throw new Error(j.message || 'Lỗi gửi đánh giá');
      }
      setDone(true);
      // Reflect new values immediately
      try { const j = await res.json(); } catch { }
      setTimeout(() => { onClose && onClose(); }, 900);
    } catch (e) {
      setErrMsg(e.message || 'Không thể gửi đánh giá');
    } finally { setSubmitting(false); }
  };

  // Show only exact room name for display
  const roomLabel = data?.roomName || '';

  if (listMode) {
    return (
      <div
        className="profile-overlay"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}
      >
        <button className="profile-back" type="button" aria-label="Quay lại" onClick={onClose}>← Quay lại</button>
        <div
          className="profile-modal"
          style={{ maxWidth: '720px', width: '96%', marginTop: 56 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="ph-table" style={{ padding: 16 }}>
            <h2 className="home-rooms-title" style={{ textAlign: 'left', marginTop: 0 }}>Danh sách đánh giá của bạn</h2>
            {listLoading ? <div style={{ color: '#666', fontSize: 13 }}>Đang tải...</div> : (
              reviewList.length === 0 ? <div style={{ color: '#888', padding: 12 }}>Bạn chưa có đánh giá nào.</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f7f7fb' }}>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>Khách sạn</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>Phòng</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center' }}>Số sao</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>Nhận xét</th>
                      <th style={{ padding: '8px 6px', textAlign: 'center' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewList.map(r => (
                      <tr key={r.id} style={{ borderTop: '1px solid #eee' }}>
                        <td style={{ padding: '8px 6px' }}>{r.hotelName}</td>
                        <td style={{ padding: '8px 6px' }}>{r.roomName}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'center' }}>{r.rating.toFixed(1)} / 5.0</td>
                        <td style={{ padding: '8px 6px', maxWidth: 220, overflowWrap: 'anywhere' }}>{r.comment}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                          <button className="ph-btn ph-btn--secondary" onClick={() => onEditReview && onEditReview(r)}>Sửa</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="profile-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}
    >
      <button className="profile-back" type="button" aria-label="Quay lại" onClick={onClose}>← Quay lại</button>
      <div
        className="profile-modal"
        style={{ maxWidth: '720px', width: '96%', marginTop: 56 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ph-table" style={{ padding: 16 }}>
          <h2 className="home-rooms-title" style={{ textAlign: 'left', marginTop: 0 }}>Đánh giá dịch vụ</h2>
          <div style={{ color: '#444', marginBottom: 10 }}>
            <div>Khách sạn: <b>{data?.hotelName || '—'}</b></div>
            <div>Phòng: <b>{roomLabel}</b> ({fmtDate(data?.checkIn)} – {fmtDate(data?.checkOut)})</div>
          </div>

          <div style={{ margin: '8px 0' }}>Chọn số sao của bạn:</div>
          <div className="rv-stars">
            <HalfStarRow value={rating} onChange={setRating} />
            <span className="rv-rating-text">{rating.toFixed(1)} / 5.0</span>
          </div>
          {loading && <div style={{ color: '#666', fontSize: 13 }}>Đang tải đánh giá...</div>}

          <div style={{ marginTop: 10 }}>Nhận xét của bạn:</div>
          <textarea className="rv-textarea" rows={6} placeholder="Chia sẻ trải nghiệm dịch vụ..." value={comment} onChange={(e) => setComment(e.target.value)} />

          <div className="rv-field">
            <label>Tên của bạn:</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nhập tên" />
          </div>
          <div className="rv-field">
            <label>Email:</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Nhập email" />
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button className="ph-btn" disabled={submitting || !email || !rating} onClick={submit}>
              {submitting ? 'Đang gửi...' : 'Gửi đánh giá'}
            </button>
            <button className="ph-btn ph-btn--secondary" onClick={onClose}>Hủy</button>
            {done && <span style={{ marginLeft: 6, color: '#0b7a30', fontWeight: 700, alignSelf: 'center' }}>Cảm ơn bạn!</span>}
            {!done && errMsg && <span style={{ marginLeft: 6, color: '#b42318', fontWeight: 700, alignSelf: 'center' }}>{errMsg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function HalfStarRow({ value, onChange }) {
  // Render 5 stars; each supports full and half selection
  const stars = [1, 2, 3, 4, 5];
  const handleMouseClick = (n, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isLeft = (e.clientX - rect.left) < rect.width / 2;
    onChange(isLeft ? n - 0.5 : n);
  };
  return (
    <div role="radiogroup" aria-label="Chọn số sao (0.5)">
      {stars.map(n => {
        const fillRatio = Math.max(0, Math.min(1, value - (n - 1)));
        const widthPct = `${Math.round(fillRatio * 100)}%`;
        return (
          <button key={n} type="button" className="rv-star-wrap" onClick={(e) => handleMouseClick(n, e)} aria-label={`${Math.max(0.5, Math.min(5, value)).toFixed(1)} sao`}>
            <span className="rv-star-base">★</span>
            <span className="rv-star-fill" style={{ width: widthPct }}>★</span>
          </button>
        );
      })}
    </div>
  );
}

function fmtDate(d) { if (!d) return '—'; const dt = new Date(d); const dd = String(dt.getDate()).padStart(2, '0'); const mm = String(dt.getMonth() + 1).padStart(2, '0'); const yy = dt.getFullYear(); return `${dd}/${mm}/${yy}`; }

// BellMenu đã được gỡ bỏ theo yêu cầu
