# Hướng dẫn & Định hướng mở rộng AI Chat Booking

Tài liệu này tổng hợp kiến trúc hiện tại của chatbot hỗ trợ tìm kiếm & tư vấn đặt phòng, đồng thời đề xuất các bước mở rộng trong tương lai.

## 1. Kiến trúc hiện tại (Baseline)
- Backend: `Express` + `mssql` (kết nối SQL Server) trong `server/index.js`.
- Endpoint AI: `POST /api/ai/chat`
  - Chức năng:
    - Lưu trạng thái hội thoại tối giản trong `_chatSessions` (Map trên bộ nhớ) theo `sessionId`.
    - Phân tích câu hỏi bằng regex/heuristic:
      - Loại phòng (tên chứa từ khóa)
      - Khoảng giá ("dưới", "tầm", số + k / triệu + vnd)
      - Sức chứa (người lớn, trẻ em)
      - Đánh giá ("x sao")
    - Hợp nhất bộ lọc đa lượt (multi-turn filter accumulation)
    - Sinh câu tóm tắt filter + gợi ý thao tác (tiếp tục lọc, đặt phòng...)
    - Truy vấn Room Types + AvgRating (JOIN Reviews qua Bookings)
    - Trả về cấu trúc: `{ reply, suggestions[], results[] }`
- Frontend: `client/src/ChatBotAI.js`
  - Quản lý `sessionId` và lịch sử tin nhắn trong `localStorage`.
  - Render danh sách phòng (cards) + nút "Đặt phòng" (dispatch Event `open-room-type`).
  - Gợi ý (suggestions) dạng nút nhanh.

## 2. Hạn chế hiện tại
| Khía cạnh | Tình trạng | Ghi chú |
|-----------|-----------|--------|
| Hiểu ngôn ngữ tự nhiên | Rule-based | Dễ vỡ với câu phức tạp |
| Trạng thái dài hạn | In-memory Map | Mất khi restart server |
| Ngữ cảnh lịch sử sâu | Chỉ tích lũy filter | Không phân biệt chủ đề mới |
| Đặt phòng thật | Chưa thực thi | Chỉ phát sự kiện frontend |
| Kiểm tra tồn phòng | Chưa | Chưa xét ngày, số lượng phòng trống |
| Bảo mật | Không xác thực riêng cho AI | Dùng sessionId tự sinh |
| Khả năng mở rộng | Single-process memory | Cần Redis / DB cache |

## 3. Lộ trình mở rộng đề xuất
### 3.1. Ngắn hạn (Quick Wins)
1. Listener ở `HomePage.js` bắt sự kiện `open-room-type` và mở overlay đặt phòng sẵn chọn loại.
2. Hỏi ngày nhận/trả & số lượng khách khi người dùng bấm "Đặt phòng" -> lưu vào session.
3. Thêm lệnh xoá filter: người dùng gõ "xóa lọc" hoặc "reset".
4. Hiển thị breadcrumb bộ lọc đang áp dụng phía trên danh sách kết quả.
5. TTL cho session (_chatSessions) + dọn dẹp định kỳ (setInterval 30m).

### 3.2. Trung hạn
1. Lưu session AI xuống bảng `Chat_Sessions` + `Chat_Messages` để khôi phục sau restart.
2. Gộp logic parser thành mô-đun riêng (`ai/parsers.js`).
3. Thêm phân tích ngày: regex dd/mm/yyyy, "mai", "cuối tuần", chuyển thành range.
4. Kiểm tra tồn phòng: JOIN bảng Rooms & Bookings loại trừ khoảng trùng.
5. Tối ưu truy vấn: áp dụng chỉ mục (index) cho cột `Name`, `BasePrice`, `MaxAdults`, `MaxChildren`.
6. Tách config ngưỡng: minRating, limit kết quả sang `.env`.

### 3.3. Dài hạn
1. Tích hợp LLM (Azure OpenAI / OpenAI) ở tầng hiểu intent:
   - Pipeline: User text -> (LLM extract JSON schema {intent, filters}) -> Validation -> DB query -> Final response.
2. Embedding semantic search tên phòng / mô tả tiện nghi (bảng vector `RoomType_Embeddings`).
3. Re-ranking kết quả dựa trên hành vi (CTR, tỷ lệ đặt phòng) -> Machine Learning lightweight.
4. Context window strategy: chỉ gửi tóm tắt lịch sử (summary) thay vì full messages.
5. A/B testing prompt & thứ tự gợi ý.
6. Đa ngôn ngữ: i18n layer + detect language.

### 3.4. Kiến trúc phân tầng AI đề xuất (Target)
```
[Controller] /api/ai/chat
    ↓
[Session Store] Redis/DB
    ↓
[NL Processor]
   - Fast Path: Heuristic Parser
   - LLM Path: nếu câu mơ hồ / độ tự tin thấp
    ↓
[Filter Builder] -> SQL Generator
    ↓
[Data Access Layer]
    ↓
[Result Post-Processor]
    - Ranking
    - Deduplicate
    - Summary generator
    ↓
[Response Adapter]
```

## 4. Mô hình dữ liệu gợi ý (mở rộng)
```sql
CREATE TABLE Chat_Sessions (
  Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  UserId INT NULL,
  CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
  UpdatedAt DATETIME2,
  Locale NVARCHAR(10),
  LastIntent NVARCHAR(50),
  FiltersJson NVARCHAR(MAX)
);

CREATE TABLE Chat_Messages (
  Id BIGINT IDENTITY PRIMARY KEY,
  SessionId UNIQUEIDENTIFIER NOT NULL,
  Role NVARCHAR(10) NOT NULL, -- user / ai / system
  Content NVARCHAR(MAX) NOT NULL,
  CreatedAt DATETIME2 DEFAULT SYSUTCDATETIME(),
  FOREIGN KEY (SessionId) REFERENCES Chat_Sessions(Id)
);
```

## 5. Chuẩn JSON intent (draft)
```json
{
  "intent": "search_rooms | book_room | reset_filters | smalltalk | unknown",
  "filters": {
    "roomNames": ["Deluxe"],
    "price": {"min": 500000, "max": 1500000},
    "capacity": {"adults": 2, "children": 1},
    "rating": {"min": 4}
  },
  "dates": {"checkIn": "2025-10-10", "checkOut": "2025-10-12"},
  "followUp": "ask_dates | ask_guests | confirm_booking"
}
```

## 6. Triển khai LLM gợi ý
- Prompt extraction: Few-shot + JSON schema enforced.
- Temperature thấp (0 - 0.3) để ổn định cấu trúc.
- Validation: Joi / Zod -> fallback heuristic nếu lỗi parse.
- Guardrail: Giới hạn độ dài input, lọc từ khóa nhạy cảm.

## 7. Bảo mật & Hiệu năng
| Chủ đề | Khuyến nghị |
|--------|-------------|
| Rate limit | 20 req / phút / IP cho `/api/ai/chat` |
| Log | Ghi intent + thời gian truy vấn, ẩn thông tin nhạy cảm |
| Cache | Cache danh sách Room Types 5 phút nếu ít thay đổi |
| Circuit breaker | Nếu LLM timeout > 3 lần, fallback heuristic 5 phút |

## 8. Bước tiếp theo đề xuất (Actionable)
1. (Dev) Thêm listener event open-room-type trong `HomePage.js` -> mở modal đặt phòng.
2. (Dev) Hỏi và lưu ngày nhận/trả sau khi người dùng nhấn Đặt phòng.
3. (Dev) Thêm lệnh reset filter + hiển thị chips filter hiện hành.
4. (DB) Thêm chỉ mục: `CREATE INDEX IX_Room_Types_Search ON Room_Types (Name, BasePrice);`
5. (Infra) Thêm ENV: `AI_RESULT_LIMIT`, `AI_SESSION_TTL_MINUTES`.
6. (AI) Viết parser module tách riêng, thêm unit test.
7. (AI) Draft prompt LLM & adapter (flag qua ENV `AI_MODE=heuristic|llm`).

## 9. Ví dụ prompt LLM (draft)
```
Bạn là bộ trích xuất intent JSON cho hệ thống đặt phòng khách sạn. Chỉ trả JSON hợp lệ.

Ngữ cảnh: Người dùng nói tiếng Việt, có thể lẫn đơn vị (k, triệu, vnd), mô tả nhu cầu.
Schema: { intent, filters, dates, followUp }
Intent hợp lệ: search_rooms, book_room, reset_filters, smalltalk, unknown

Ví dụ:
User: Tôi muốn phòng deluxe cho 2 người lớn dưới 1 triệu
→ {
  "intent":"search_rooms",
  "filters":{"roomNames":["deluxe"],"price":{"max":1000000},"capacity":{"adults":2}},
  "followUp":null
}
```

## 10. Testing đề xuất
- Unit: parser (câu đa dạng, edge case số & đơn vị), price normalization.
- Integration: /api/ai/chat với chuỗi multi-turn (thêm điều kiện dần).
- Load test nhẹ: 50 req đồng thời -> đảm bảo truy vấn index.

---
Tài liệu sẽ cập nhật dần khi kiến trúc AI phát triển.
