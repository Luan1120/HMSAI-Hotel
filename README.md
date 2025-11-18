# Hướng dẫn cấu hình HMSAI Hotel

Tài liệu này liệt kê những bước cần thực hiện sau khi bạn clone dự án để có thể chạy được trên máy của mình. Vui lòng đọc lần lượt và cập nhật các thông tin cho phù hợp với môi trường cá nhân.

## 1. Chuẩn bị môi trường
- **Node.js**: nên dùng Node 18 LTS (hoặc phiên bản mới hơn) cho cả thư mục `client` và `server`.
- **SQL Server**: backend kết nối với Microsoft SQL Server.
- **npm**: đi kèm với Node, dùng để cài đặt phụ thuộc.

## 2. Cập nhật cấu hình cơ sở dữ liệu
Mặc định máy phát triển ban đầu sử dụng server `LAPTOP-OF-LUAN\MAYCHU` và database `QLKS`. Bạn cần chỉnh lại các thông tin này cho phù hợp với SQL Server của mình:

1. Mở file `server/db.js`.
2. Thay đổi các trường trong biến `config` (`user`, `password`, `server`, `database`) theo thông số của bạn.
3. Nếu dùng Windows Authentication hoặc instance/port khác, điều chỉnh cấu hình tương ứng. Tham khảo thêm tài liệu [mssql configuration](https://www.npmjs.com/package/mssql#configuration-object) nếu cần.

> **Gợi ý:** Giá trị `encrypt` và `trustServerCertificate` nên đặt theo chính sách bảo mật của SQL Server bạn dùng. Khi phát triển local có thể để `encrypt: false`, nhưng các dịch vụ SQL Server quản lý (Azure, AWS) thường yêu cầu `encrypt: true`.

## 3. Khôi phục dữ liệu mẫu
File `client/public/QLKS.sql` chứa schema và dữ liệu mẫu.

- Tạo database trùng tên với cấu hình trong `server/db.js`.
- Chạy script SQL đó bằng SQL Server Management Studio, Azure Data Studio hoặc `sqlcmd`.
- Nếu bạn có dữ liệu riêng, hãy import hoặc restore thay cho script mẫu.

## 4. Biến môi trường (Environment variables)
Nếu cần các biến môi trường (ví dụ `GOOGLE_CLIENT_ID`), tạo một trong hai file sau và thêm giá trị phù hợp:

- `server/.env`
- `.env` ở thư mục gốc dự án

Server sẽ ưu tiên đọc `server/.env`, nếu không có sẽ đọc `.env` ở gốc. Kiểm tra trong `server/index.js` để biết những biến nào đang được sử dụng.

## 5. Cài đặt dependencies
Chạy các lệnh sau trong từng thư mục:

```powershell
# Cài đặt phụ thuộc cho server
cd server
npm install

# Cài đặt phụ thuộc cho client
cd ..\client
npm install
```

> Nếu thay đổi đường dẫn lưu dự án, hãy điều chỉnh lệnh tương ứng. Các lệnh mẫu dùng PowerShell trên Windows.

## 6. Khởi động dự án
- **Server**: từ thư mục `server/`, chạy `npm start` (hoặc `node index.js`).
- **Client**: từ thư mục `client/`, chạy `npm start` để khởi chạy React (mặc định port 3000).

Đảm bảo server kết nối được tới SQL Server. Nếu bị lỗi kết nối, kiểm tra lại thông tin đăng nhập, firewall hoặc quyền truy cập.

## 7. Các cấu hình tùy chọn
- **Email / thông báo**: nếu muốn kích hoạt, đặt các API key vào file `.env`.
- **Upload file**: thư mục `server/uploads` cần có quyền ghi. Nếu chạy trên hệ điều hành khác, bạn có thể phải tạo thủ công các thư mục con.

## 8. Lưu ý khi commit
Không commit thông tin nhạy cảm (mật khẩu, khóa bí mật). Nếu cần, tạo thêm file `.env.example` hoặc cập nhật README này với những trường mới mà đồng đội cần biết.

> Hãy cập nhật tài liệu này mỗi khi phát hiện thêm bước cấu hình nào cần nhắc nhở để mọi người thiết lập dự án dễ dàng hơn.
