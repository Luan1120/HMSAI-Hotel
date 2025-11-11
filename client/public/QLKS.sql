-- Bảng Roles
CREATE TABLE Roles (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(50) NOT NULL,
    description NVARCHAR(255) NULL
);

-- Bảng Users
CREATE TABLE Users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    email NVARCHAR(100) NOT NULL,
    password NVARCHAR(255) NOT NULL,
    phone NVARCHAR(50) NULL,
    address NVARCHAR(255) NULL,
    avatar NVARCHAR(MAX) NULL,
    name NVARCHAR(50) NOT NULL,
    date_of_birth DATE NULL,
    country NVARCHAR(50) NULL,
    createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    updatedAt DATETIME2 NULL,
    roleId INT NULL FOREIGN KEY REFERENCES Roles(id),
    status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    verificationCode NVARCHAR(10) NULL,
    verificationCodeExpiresAt DATETIME2 NULL,
    isVerified BIT NOT NULL DEFAULT 0
);

-- Bảng Hotels
CREATE TABLE Hotels (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL,
    address NVARCHAR(255) NOT NULL,
    city NVARCHAR(60) NOT NULL,
    country NVARCHAR(60) NOT NULL,
    phone NVARCHAR(20) NULL,
    email NVARCHAR(100) NULL,
    rating DECIMAL(2,1) NULL,
    image NVARCHAR(255) NULL,
    createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    updatedAt DATETIME2 NULL
);

-- Bảng Room_Types
CREATE TABLE Room_Types (
    id INT IDENTITY(1,1) PRIMARY KEY,
    hotelId INT NOT NULL FOREIGN KEY REFERENCES Hotels(id),
    name NVARCHAR(60) NOT NULL,
    description NVARCHAR(MAX) NULL,
    basePrice DECIMAL(10,2) NOT NULL,
    maxAdults INT NOT NULL,
    maxChildren INT NOT NULL,
    image NVARCHAR(255) NULL,
    createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    updatedAt DATETIME2 NULL
);

-- Bảng Rooms
CREATE TABLE Rooms (
    id INT IDENTITY(1,1) PRIMARY KEY,
    hotelId INT NOT NULL FOREIGN KEY REFERENCES Hotels(id),
    roomTypeId INT NOT NULL FOREIGN KEY REFERENCES Room_Types(id),
    roomNumber NVARCHAR(20) NOT NULL,
    floor INT NULL,
    status NVARCHAR(20) NOT NULL,
    image NVARCHAR(255) NULL,
    images NVARCHAR(MAX) NULL,
    createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    updatedAt DATETIME2 NULL,
    description NVARCHAR(255) NULL
);

-- Bảng Services
CREATE TABLE Services (
    id INT PRIMARY KEY IDENTITY(1,1),
    name NVARCHAR(100) NOT NULL,
    description NVARCHAR(255),
    price DECIMAL(10,2),
    icon NVARCHAR(100),
    hotelId INT NOT NULL FOREIGN KEY REFERENCES Hotels(id),
    status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    UpdatedAt DATETIME2 NULL
);

-- Bảng Amenities
CREATE TABLE Amenities (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(60) NOT NULL,
    icon NVARCHAR(100) NULL,
    status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    number INT NOT NULL DEFAULT 0,
    description NVARCHAR(255) NULL
);

-- Bảng Room_Amenities
CREATE TABLE Room_Amenities (
    roomTypeId INT NOT NULL FOREIGN KEY REFERENCES Room_Types(id),
    amenityId INT NOT NULL FOREIGN KEY REFERENCES Amenities(id),
    isIncluded BIT NOT NULL DEFAULT 0,
    PRIMARY KEY (roomTypeId, amenityId)
);

-- Bảng Bookings
CREATE TABLE Bookings (
    id INT IDENTITY(1,1) PRIMARY KEY,
    userId INT NOT NULL FOREIGN KEY REFERENCES Users(id),
    hotelId INT NOT NULL FOREIGN KEY REFERENCES Hotels(id),
    roomTypeId INT NOT NULL FOREIGN KEY REFERENCES Room_Types(id),
    roomId INT NULL FOREIGN KEY REFERENCES Rooms(id),
    checkInDate DATE NOT NULL,
    checkOutDate DATE NOT NULL,
    adults INT NOT NULL,
    children INT NULL,
    status NVARCHAR(20) NOT NULL,
    originalAmount DECIMAL(10,2) NULL, -- Giá gốc (gross) trước giảm giá; có thể để NULL với dữ liệu cũ
    totalAmount DECIMAL(10,2) NOT NULL, -- Giá cuối sau giảm giá (net)
    paymentStatus NVARCHAR(20) NOT NULL,
    createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    updatedAt DATETIME2 NULL
);

-- Bảng Payments
CREATE TABLE Payments (
    id INT IDENTITY(1,1) PRIMARY KEY,
    bookingId INT NOT NULL FOREIGN KEY REFERENCES Bookings(id),
    userId INT NOT NULL FOREIGN KEY REFERENCES Users(id),
    amount DECIMAL(10,2) NOT NULL,
    method NVARCHAR(30) NOT NULL,
    status NVARCHAR(20) NOT NULL,
    orderId NVARCHAR(50) NULL,
    createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    updatedAt DATETIME2 NULL
);

-- Bảng Stays
CREATE TABLE Stays (
    id INT IDENTITY(1,1) PRIMARY KEY,
    bookingId INT NOT NULL FOREIGN KEY REFERENCES Bookings(id),
    roomId INT NOT NULL FOREIGN KEY REFERENCES Rooms(id),
    actualCheckIn DATETIME2 NULL,
    actualCheckOut DATETIME2 NULL,
    note NVARCHAR(MAX) NULL,
    createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    updatedAt DATETIME2 NULL
);

-- Bảng Reviews
CREATE TABLE Reviews (
    id INT IDENTITY(1,1) PRIMARY KEY,
    bookingId INT NOT NULL FOREIGN KEY REFERENCES Bookings(id),
    userId INT NOT NULL FOREIGN KEY REFERENCES Users(id),
    rating INT NOT NULL,
    comment NVARCHAR(MAX) NULL,
    createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

-- Bảng Chatbot_Sessions
CREATE TABLE Chatbot_Sessions (
    id INT IDENTITY(1,1) PRIMARY KEY,
    userId INT NULL FOREIGN KEY REFERENCES Users(id),
    startedAt DATETIME2 NOT NULL,
    endedAt DATETIME2 NULL,
    channel NVARCHAR(20) NOT NULL
);

-- Bảng Chatbot_Messages
CREATE TABLE Chatbot_Messages (
    id INT IDENTITY(1,1) PRIMARY KEY,
    sessionId INT NOT NULL FOREIGN KEY REFERENCES Chatbot_Sessions(id),
    sender NVARCHAR(10) NOT NULL,
    message NVARCHAR(MAX) NOT NULL,
    intent NVARCHAR(50) NULL,
    confidence DECIMAL(3,2) NULL,
    createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

-- Bảng Notifications
CREATE TABLE Notifications (
    id INT IDENTITY(1,1) PRIMARY KEY,
    userId INT NOT NULL FOREIGN KEY REFERENCES Users(id),
    title NVARCHAR(100) NOT NULL,
    message NVARCHAR(255) NOT NULL,
    type NVARCHAR(20) NOT NULL,
    sentAt DATETIME2 NOT NULL,
    isRead BIT NOT NULL DEFAULT 0
);

-- Bảng Promotions
CREATE TABLE Promotions (
    id INT IDENTITY(1,1) PRIMARY KEY,
    code NVARCHAR(30) NOT NULL UNIQUE,
    description NVARCHAR(255) NULL,
    discountType NVARCHAR(10) NOT NULL,
    discountValue DECIMAL(10,2) NOT NULL,
    startDate DATETIME2 NOT NULL,
    endDate DATETIME2 NOT NULL,
    minOrderAmount DECIMAL(10,2) NULL,
    maxDiscount DECIMAL(10,2) NULL,
    isActive BIT NOT NULL DEFAULT 1,
    createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    updatedAt DATETIME2 NULL,
    createdBy INT NULL FOREIGN KEY REFERENCES Users(id)
);

-- Bảng Blacklisted_Tokens
CREATE TABLE Blacklisted_Tokens (
    id INT IDENTITY(1,1) PRIMARY KEY,
    userId INT NOT NULL FOREIGN KEY REFERENCES Users(id),
    token NVARCHAR(MAX) NOT NULL,
    createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
    expiresAt DATETIME2 NOT NULL
);

------------------------------------------------------------
-- ROLES
------------------------------------------------------------
SET IDENTITY_INSERT Roles ON;
INSERT INTO Roles (id,name,description) VALUES
(1,'Admin',N'Quản trị hệ thống'),
(2,'Customer',N'Khách đặt phòng'),
(3,'Staff',N'Nhân viên khách sạn');
SET IDENTITY_INSERT Roles OFF;

------------------------------------------------------------
-- USERS (mật khẩu giả mã hóa/băm placeholder)
------------------------------------------------------------
SET IDENTITY_INSERT Users ON;
INSERT INTO Users (id,email,password,phone,address,avatar,name,date_of_birth,country,roleId,status,isVerified)
VALUES
(1,'admin@gmail.com',123,N'0900000001',N'Hà Nội',NULL,N'Quản Trị Viên', '1990-01-01',N'Vietnam',1,'active',1),
(2,'nv1@gmail.com',123,N'0900000003',N'Hà Nội',NULL,N'Nhân Viên 1','1992-03-02',N'Vietnam',3,'active',1),
(3,'nv2@gmail.com',123,N'0900000004',N'Hồ Chí Minh',NULL,N'Nhân Viên 2','1993-07-15',N'Vietnam',3,'active',1);
SET IDENTITY_INSERT Users OFF;

------------------------------------------------------------
-- HOTELS
------------------------------------------------------------
SET IDENTITY_INSERT Hotels ON;
INSERT INTO Hotels (id,name,address,city,country,phone,email,rating,image)
VALUES
(1,N'HSM Hotel Hanoi',N'12 Phố Huế',N'Hà Nội',N'Vietnam',N'0241111111','hanoi@gmail.com',4.5,Null),
(2,N'Saigon HSM Hotel',N'88 Lê Lợi',N'Hồ Chí Minh',N'Vietnam',N'0282222222','saigon@gmail.com',4.6,NULL),
(3,N'Da Nang HSM Hotel',N'55 Võ Nguyên Giáp',N'Đà Nẵng',N'Vietnam',N'0236323232','danang@gmail.com',4.4,NULL);
SET IDENTITY_INSERT Hotels OFF;

------------------------------------------------------------
-- ROOM TYPES (3 hạng phòng mỗi khách sạn)
------------------------------------------------------------
SET IDENTITY_INSERT Room_Types ON;
INSERT INTO Room_Types (id,hotelId,name,description,basePrice,maxAdults,maxChildren,image)
VALUES
(1,1,N'De Luxe Room - HaNoi',N'Phòng De Luxe tiêu chuẩn',1200000,2,1,'/hangphong/hp1.png'),
(2,1,N'De Luxe Sea View - HaNoi',N'Phòng De Luxe nhìn thành phố (HN không có biển)',1350000,2,1,'/hangphong/hp2.png'),
(3,1,N'The Wellhall Family Suite - HaNoi',N'Suite gia đình cao cấp',2500000,4,2,'/hangphong/hp3.png'),
(4,2,N'De Luxe Room - SaiGon',N'Phòng De Luxe',1300000,2,1,'/hangphong/hp1.png'),
(5,2,N'De Luxe Sea View - SaiGon',N'Phòng De Luxe nhìn sông',1500000,2,1,'/hangphong/hp2.png'),
(6,2,N'The Wellhall Family Suite - SaiGon',N'Suite gia đình',2700000,4,2,'/hangphong/hp3.png'),
(7,3,N'De Luxe Room - DaNang',N'Phòng De Luxe',1250000,2,1,'/hangphong/hp1.png'),
(8,3,N'De Luxe Sea View - DaNang',N'Phòng nhìn biển Mỹ Khê',1800000,2,1,'/hangphong/hp2.png'),
(9,3,N'The Wellhall Family Suite - DaNang',N'Suite gia đình hướng biển',3000000,4,2,'/hangphong/hp3.png');
SET IDENTITY_INSERT Room_Types OFF;

------------------------------------------------------------
-- AMENITIES (trạng thái: Active / Maintenance)
------------------------------------------------------------
SET IDENTITY_INSERT Amenities ON;
INSERT INTO Amenities (id,name,icon,status,number,description) VALUES
(1,N'Wi-Fi','/tiennghi/icon-wifi.png',N'Active',0,N'Internet tốc độ cao'),
(2,N'Điều hòa','/tiennghi/icon-ac-unit.png',N'Active',0,N'Điều hòa 2 chiều'),
(3,N'Bồn tắm','/tiennghi/icon-bath.png',N'Active',0,N'Bồn tắm tiện nghi'),
(4,N'Máy sấy tóc','/tiennghi/icon-hair-dryer.png',N'Active',0,N'Máy sấy tóc'),
(5,N'Bàn làm việc','/tiennghi/icon-workplace.png',N'Active',0,N'Bàn làm việc'),
(6,N'Minibar','/tiennghi/icon-minibar.png',N'Maintenance',0,N'Minibar đang bảo trì'),
(7,N'TV 50"','/tiennghi/icon-tv.png',N'Active',0,N'Tivi màn hình phẳng'),
(8,N'Két sắt','/tiennghi/icon-safe.png',N'Active',0,N'Két an toàn'),
(9,N'Ấm đun nước','/tiennghi/icon-kettle.png',N'Active',0,N'Ấm điện'),
(10,N'Sofa bed','/tiennghi/icon-sofa-bed.png',N'Active',0,N'Sofa chuyển đổi giường');
SET IDENTITY_INSERT Amenities OFF;

------------------------------------------------------------
-- ROOMS (mỗi hạng phòng vài phòng với trạng thái khác nhau)
-- Status: Available / Cleaning / Maintenance / Occupied
------------------------------------------------------------
SET IDENTITY_INSERT Rooms ON;
INSERT INTO Rooms (id,hotelId,roomTypeId,roomNumber,floor,status,image,description)
VALUES
(1,1,1,N'HN101',1,'Available','/khachsan/ks1.png',N'De Luxe'),
(2,1,1,N'HN102',1,'Available','/khachsan/ks2.png',N'De Luxe'),
(3,1,2,N'HN201',2,'Available','/khachsan/ks3.png',N'De Luxe View'),
(4,1,2,N'HN202',2,'Available','/khachsan/ks4.png',N'De Luxe View'),
(5,1,3,N'HN301',3,'Available','/khachsan/ks5.png',N'Family Suite'),
(6,2,4,N'SG101',1,'Available','/khachsan/ks6.png',N'De Luxe'),
(7,2,5,N'SG201',2,'Available','/khachsan/ks7.png',N'De Luxe View'),
(8,2,5,N'SG202',2,'Available','/khachsan/ks8.png',N'De Luxe View'),
(9,2,6,N'SG301',3,'Available','/khachsan/ks9.png',N'Family Suite'),
(10,3,7,N'DN101',1,'Available','/khachsan/ks10.png',N'De Luxe'),
(11,3,8,N'DN201',2,'Available','/khachsan/ks11.png',N'De Luxe Sea View'),
(12,3,9,N'DN301',3,'Available','/khachsan/ks12.png',N'Family Suite'),
(13,1,1,N'HN103',1,'Available','/khachsan/ks13.png',N'De Luxe'),
(14,1,1,N'HN104',1,'Available','/khachsan/ks14.png',N'De Luxe'),
(15,1,1,N'HN105',1,'Available','/khachsan/ks15.png',N'De Luxe'),
(16,1,1,N'HN106',1,'Available','/khachsan/ks16.png',N'De Luxe'),
(17,1,1,N'HN107',1,'Available','/khachsan/ks17.png',N'De Luxe'),
(18,1,1,N'HN108',1,'Available','/khachsan/ks18.png',N'De Luxe'),
(19,1,1,N'HN109',1,'Available','/khachsan/ks19.png',N'De Luxe'),
(20,1,1,N'HN110',1,'Available','/khachsan/ks20.png',N'De Luxe'),
(21,1,1,N'HN111',1,'Available','/khachsan/ks21.png',N'De Luxe'),
(22,1,1,N'HN112',1,'Available','/khachsan/ks22.png',N'De Luxe'),
(23,1,1,N'HN113',1,'Available','/khachsan/ks23.png',N'De Luxe'),
(24,1,1,N'HN114',1,'Available','/khachsan/ks24.png',N'De Luxe'),
(25,1,1,N'HN115',1,'Available','/khachsan/ks25.png',N'De Luxe'),
(26,1,2,N'HN203',2,'Available','/khachsan/ks26.png',N'De Luxe View'),
(27,1,2,N'HN204',2,'Available','/khachsan/ks27.png',N'De Luxe View'),
(28,1,2,N'HN205',2,'Available','/khachsan/ks28.png',N'De Luxe View'),
(29,1,2,N'HN206',2,'Available','/khachsan/ks29.png',N'De Luxe View'),
(30,1,2,N'HN207',2,'Available','/khachsan/ks30.png',N'De Luxe View'),
(31,1,2,N'HN208',2,'Available','/khachsan/ks31.png',N'De Luxe View'),
(32,1,2,N'HN209',2,'Available','/khachsan/ks32.png',N'De Luxe View'),
(33,1,2,N'HN210',2,'Available','/khachsan/ks33.png',N'De Luxe View'),
(34,1,2,N'HN211',2,'Available','/khachsan/ks34.png',N'De Luxe View'),
(35,1,2,N'HN212',2,'Available','/khachsan/ks35.png',N'De Luxe View'),
(36,1,2,N'HN213',2,'Available','/khachsan/ks36.png',N'De Luxe View'),
(37,1,2,N'HN214',2,'Available','/khachsan/ks37.png',N'De Luxe View'),
(38,1,2,N'HN215',2,'Available','/khachsan/ks38.png',N'De Luxe View'),
(39,1,3,N'HN302',3,'Available','/khachsan/ks39.png',N'Family Suite'),
(40,1,3,N'HN303',3,'Available','/khachsan/ks40.png',N'Family Suite'),
(41,1,3,N'HN304',3,'Available','/khachsan/ks41.png',N'Family Suite'),
(42,1,3,N'HN305',3,'Available','/khachsan/ks42.png',N'Family Suite'),
(43,1,3,N'HN306',3,'Available','/khachsan/ks43.png',N'Family Suite'),
(44,1,3,N'HN307',3,'Available','/khachsan/ks44.png',N'Family Suite'),
(45,1,3,N'HN308',3,'Available','/khachsan/ks45.png',N'Family Suite'),
(46,1,3,N'HN309',3,'Available','/khachsan/ks46.png',N'Family Suite'),
(47,1,3,N'HN310',3,'Available','/khachsan/ks47.png',N'Family Suite'),
(48,1,3,N'HN311',3,'Available','/khachsan/ks48.png',N'Family Suite'),
(49,1,3,N'HN312',3,'Available','/khachsan/ks49.png',N'Family Suite'),
(50,1,3,N'HN313',3,'Available','/khachsan/ks1.png',N'Family Suite'),
(51,1,3,N'HN314',3,'Available','/khachsan/ks2.png',N'Family Suite'),
(52,1,3,N'HN315',3,'Available','/khachsan/ks3.png',N'Family Suite'),
(53,2,4,N'SG102',1,'Available','/khachsan/ks4.png',N'De Luxe'),
(54,2,4,N'SG103',1,'Available','/khachsan/ks5.png',N'De Luxe'),
(55,2,4,N'SG104',1,'Available','/khachsan/ks6.png',N'De Luxe'),
(56,2,4,N'SG105',1,'Available','/khachsan/ks7.png',N'De Luxe'),
(57,2,4,N'SG106',1,'Available','/khachsan/ks8.png',N'De Luxe'),
(58,2,4,N'SG107',1,'Available','/khachsan/ks9.png',N'De Luxe'),
(59,2,4,N'SG108',1,'Available','/khachsan/ks10.png',N'De Luxe'),
(60,2,4,N'SG109',1,'Available','/khachsan/ks11.png',N'De Luxe'),
(61,2,4,N'SG110',1,'Available','/khachsan/ks12.png',N'De Luxe'),
(62,2,4,N'SG111',1,'Available','/khachsan/ks13.png',N'De Luxe'),
(63,2,4,N'SG112',1,'Available','/khachsan/ks14.png',N'De Luxe'),
(64,2,4,N'SG113',1,'Available','/khachsan/ks15.png',N'De Luxe'),
(65,2,4,N'SG114',1,'Available','/khachsan/ks16.png',N'De Luxe'),
(66,2,4,N'SG115',1,'Available','/khachsan/ks17.png',N'De Luxe'),
(67,2,5,N'SG203',2,'Available','/khachsan/ks18.png',N'De Luxe View'),
(68,2,5,N'SG204',2,'Available','/khachsan/ks19.png',N'De Luxe View'),
(69,2,5,N'SG205',2,'Available','/khachsan/ks20.png',N'De Luxe View'),
(70,2,5,N'SG206',2,'Available','/khachsan/ks21.png',N'De Luxe View'),
(71,2,5,N'SG207',2,'Available','/khachsan/ks22.png',N'De Luxe View'),
(72,2,5,N'SG208',2,'Available','/khachsan/ks23.png',N'De Luxe View'),
(73,2,5,N'SG209',2,'Available','/khachsan/ks24.png',N'De Luxe View'),
(74,2,5,N'SG210',2,'Available','/khachsan/ks25.png',N'De Luxe View'),
(75,2,5,N'SG211',2,'Available','/khachsan/ks26.png',N'De Luxe View'),
(76,2,5,N'SG212',2,'Available','/khachsan/ks27.png',N'De Luxe View'),
(77,2,5,N'SG213',2,'Available','/khachsan/ks28.png',N'De Luxe View'),
(78,2,5,N'SG214',2,'Available','/khachsan/ks29.png',N'De Luxe View'),
(79,2,5,N'SG215',2,'Available','/khachsan/ks30.png',N'De Luxe View'),
(80,2,6,N'SG302',3,'Available','/khachsan/ks31.png',N'Family Suite'),
(81,2,6,N'SG303',3,'Available','/khachsan/ks32.png',N'Family Suite'),
(82,2,6,N'SG304',3,'Available','/khachsan/ks33.png',N'Family Suite'),
(83,2,6,N'SG305',3,'Available','/khachsan/ks34.png',N'Family Suite'),
(84,2,6,N'SG306',3,'Available','/khachsan/ks35.png',N'Family Suite'),
(85,2,6,N'SG307',3,'Available','/khachsan/ks36.png',N'Family Suite'),
(86,2,6,N'SG308',3,'Available','/khachsan/ks37.png',N'Family Suite'),
(87,2,6,N'SG309',3,'Available','/khachsan/ks38.png',N'Family Suite'),
(88,2,6,N'SG310',3,'Available','/khachsan/ks39.png',N'Family Suite'),
(89,2,6,N'SG311',3,'Available','/khachsan/ks40.png',N'Family Suite'),
(90,2,6,N'SG312',3,'Available','/khachsan/ks41.png',N'Family Suite'),
(91,2,6,N'SG313',3,'Available','/khachsan/ks42.png',N'Family Suite'),
(92,2,6,N'SG314',3,'Available','/khachsan/ks43.png',N'Family Suite'),
(93,2,6,N'SG315',3,'Available','/khachsan/ks44.png',N'Family Suite'),
(94,3,7,N'DN102',1,'Available','/khachsan/ks45.png',N'De Luxe'),
(95,3,7,N'DN103',1,'Available','/khachsan/ks46.png',N'De Luxe'),
(96,3,7,N'DN104',1,'Available','/khachsan/ks47.png',N'De Luxe'),
(97,3,7,N'DN105',1,'Available','/khachsan/ks48.png',N'De Luxe'),
(98,3,7,N'DN106',1,'Available','/khachsan/ks49.png',N'De Luxe'),
(99,3,7,N'DN107',1,'Available','/khachsan/ks1.png',N'De Luxe'),
(100,3,7,N'DN108',1,'Available','/khachsan/ks2.png',N'De Luxe'),
(101,3,7,N'DN109',1,'Available','/khachsan/ks3.png',N'De Luxe'),
(102,3,7,N'DN110',1,'Available','/khachsan/ks4.png',N'De Luxe'),
(103,3,7,N'DN111',1,'Available','/khachsan/ks5.png',N'De Luxe'),
(104,3,7,N'DN112',1,'Available','/khachsan/ks6.png',N'De Luxe'),
(105,3,7,N'DN113',1,'Available','/khachsan/ks7.png',N'De Luxe'),
(106,3,7,N'DN114',1,'Available','/khachsan/ks8.png',N'De Luxe'),
(107,3,7,N'DN115',1,'Available','/khachsan/ks9.png',N'De Luxe'),
(108,3,8,N'DN202',2,'Available','/khachsan/ks10.png',N'De Luxe Sea View'),
(109,3,8,N'DN203',2,'Available','/khachsan/ks11.png',N'De Luxe Sea View'),
(110,3,8,N'DN204',2,'Available','/khachsan/ks12.png',N'De Luxe Sea View'),
(111,3,8,N'DN205',2,'Available','/khachsan/ks13.png',N'De Luxe Sea View'),
(112,3,8,N'DN206',2,'Available','/khachsan/ks14.png',N'De Luxe Sea View'),
(113,3,8,N'DN207',2,'Available','/khachsan/ks15.png',N'De Luxe Sea View'),
(114,3,8,N'DN208',2,'Available','/khachsan/ks16.png',N'De Luxe Sea View'),
(115,3,8,N'DN209',2,'Available','/khachsan/ks17.png',N'De Luxe Sea View'),
(116,3,8,N'DN210',2,'Available','/khachsan/ks18.png',N'De Luxe Sea View'),
(117,3,8,N'DN211',2,'Available','/khachsan/ks19.png',N'De Luxe Sea View'),
(118,3,8,N'DN212',2,'Available','/khachsan/ks20.png',N'De Luxe Sea View'),
(119,3,8,N'DN213',2,'Available','/khachsan/ks21.png',N'De Luxe Sea View'),
(120,3,8,N'DN214',2,'Available','/khachsan/ks22.png',N'De Luxe Sea View'),
(121,3,8,N'DN215',2,'Available','/khachsan/ks23.png',N'De Luxe Sea View'),
(122,3,9,N'DN302',3,'Available','/khachsan/ks24.png',N'Family Suite'),
(123,3,9,N'DN303',3,'Available','/khachsan/ks25.png',N'Family Suite'),
(124,3,9,N'DN304',3,'Available','/khachsan/ks26.png',N'Family Suite'),
(125,3,9,N'DN305',3,'Available','/khachsan/ks27.png',N'Family Suite'),
(126,3,9,N'DN306',3,'Available','/khachsan/ks28.png',N'Family Suite'),
(127,3,9,N'DN307',3,'Available','/khachsan/ks29.png',N'Family Suite'),
(128,3,9,N'DN308',3,'Available','/khachsan/ks30.png',N'Family Suite'),
(129,3,9,N'DN309',3,'Available','/khachsan/ks31.png',N'Family Suite'),
(130,3,9,N'DN310',3,'Available','/khachsan/ks32.png',N'Family Suite'),
(131,3,9,N'DN311',3,'Available','/khachsan/ks33.png',N'Family Suite'),
(132,3,9,N'DN312',3,'Available','/khachsan/ks34.png',N'Family Suite'),
(133,3,9,N'DN313',3,'Available','/khachsan/ks35.png',N'Family Suite'),
(134,3,9,N'DN314',3,'Available','/khachsan/ks36.png',N'Family Suite'),
(135,3,9,N'DN315',3,'Available','/khachsan/ks37.png',N'Family Suite')
SET IDENTITY_INSERT Rooms OFF;
------------------------------------------------------------
-- SERVICES
------------------------------------------------------------
SET IDENTITY_INSERT Services ON;
INSERT INTO Services (id,name,description,price,icon,HotelId,status,updatedAt) VALUES
(1,N'Spa',N'Dịch vụ spa thư giãn',500000,'/dich-vu/icon-spa.png',1,'Active',GETDATE()),
(2,N'Giặt ủi',N'Dịch vụ giặt ủi',80000,'/dich-vu/icon-laundry.png',1,'Active',GETDATE()),
(3,N'Đưa đón sân bay',N'Dịch vụ shuttle sân bay',300000,'/dich-vu/icon-airport-transfer.png',1,'Active',GETDATE()),
(4,N'Ăn sáng buffet',N'Bữa sáng tự chọn',200000,'/dich-vu/icon-breakfast.png',1,'Active',GETDATE()),
(5,N'Phòng Gym',N'Phòng tập thể hình',0,'/dich-vu/icon-gym.png',1,'Active',GETDATE()),

(6,N'Spa',N'Dịch vụ spa thư giãn',600000,'/dich-vu/icon-spa.png',2,'Active',GETDATE()),
(7,N'Giặt ủi',N'Dịch vụ giặt ủi',90000,'/dich-vu/icon-laundry.png',2,'Active',GETDATE()),
(8,N'Đưa đón sân bay',N'Dịch vụ shuttle sân bay',350000,'/dich-vu/icon-airport-transfer.png',2,'Active',GETDATE()),
(9,N'Ăn sáng buffet',N'Bữa sáng tự chọn',220000,'/dich-vu/icon-breakfast.png',2,'Active',GETDATE()),
(10,N'Phòng Gym',N'Phòng tập thể hình',0,'/dich-vu/icon-gym.png',2,'Active',GETDATE()),

(11,N'Spa',N'Dịch vụ spa thư giãn',550000,'/dich-vu/icon-spa.png',3,'Active',GETDATE()),
(12,N'Giặt ủi',N'Dịch vụ giặt ủi',85000,'/dich-vu/icon-laundry.png',3,'Active',GETDATE()),
(13,N'Đưa đón sân bay',N'Dịch vụ shuttle sân bay',320000,'/dich-vu/icon-airport-transfer.png',3,'Active',GETDATE()),
(14,N'Ăn sáng buffet',N'Bữa sáng tự chọn',210000,'/dich-vu/icon-breakfast.png',3,'Active',GETDATE()),
(15,N'Phòng Gym',N'Phòng tập thể hình',0,'/dich-vu/icon-gym.png',3,'Active',GETDATE());
SET IDENTITY_INSERT Services OFF;

------------------------------------------------------------
-- ROOM_AMENITIES 
-- isIncluded = 1: có trong hạng phòng
INSERT INTO Room_Amenities (roomTypeId,amenityId,isIncluded) VALUES
(1,1,1),(1,2,1),(1,7,1),(1,9,1),
(2,1,1),(2,2,1),(2,3,1),(2,7,1),(2,8,1),
(3,1,1),(3,2,1),(3,3,1),(3,5,1);
------------------------------------------------------------
-- BỔ SUNG USER DEMO (khách hàng) CHO REVIEW MỖI HẠNG PHÒNG
-- Chạy trên DB mới (tránh chạy lại gây trùng ID)
------------------------------------------------------------
SET IDENTITY_INSERT Users ON;
INSERT INTO Users (id,email,password,phone,address,avatar,name,date_of_birth,country,roleId,status,isVerified)
VALUES
(10,'ruser1@example.com',123,N'0908000010',N'Hà Nội',NULL,N'Khách R1','1993-02-11',N'Vietnam',2,'active',1),
(11,'ruser2@example.com',123,N'0908000011',N'Hồ Chí Minh',NULL,N'Khách R2','1994-03-12',N'Vietnam',2,'active',1),
(12,'ruser3@example.com',123,N'0908000012',N'Đà Nẵng',NULL,N'Khách R3','1992-04-13',N'Vietnam',2,'active',1),
(13,'ruser4@example.com',123,N'0908000013',N'Huế',NULL,N'Khách R4','1995-05-14',N'Vietnam',2,'active',1),
(14,'ruser5@example.com',123,N'0908000014',N'Cần Thơ',NULL,N'Khách R5','1996-06-15',N'Vietnam',2,'active',1),
(15,'ruser6@example.com',123,N'0908000015',N'Hà Nội',NULL,N'Khách R6','1991-07-16',N'Vietnam',2,'active',1),
(16,'ruser7@example.com',123,N'0908000016',N'Hồ Chí Minh',NULL,N'Khách R7','1990-08-17',N'Vietnam',2,'active',1),
(17,'ruser8@example.com',123,N'0908000017',N'Đà Nẵng',NULL,N'Khách R8','1997-09-18',N'Vietnam',2,'active',1),
(18,'ruser9@example.com',123,N'0908000018',N'Hà Nội',NULL,N'Khách R9','1998-10-19',N'Vietnam',2,'active',1),
(19,'ruser10@example.com',123,N'0908000019',N'Hải Phòng',NULL,N'Khách R10','1993-11-20',N'Vietnam',2,'active',1),
(20,'ruser11@example.com',123,N'0908000020',N'Hà Nội',NULL,N'Khách R11','1994-12-21',N'Vietnam',2,'active',1),
(21,'ruser12@example.com',123,N'0908000021',N'Hồ Chí Minh',NULL,N'Khách R12','1995-01-05',N'Vietnam',2,'active',1),
(22,'ruser13@example.com',123,N'0908000022',N'Đà Nẵng',NULL,N'Khách R13','1996-02-06',N'Vietnam',2,'active',1),
(23,'ruser14@example.com',123,N'0908000023',N'Hà Nội',NULL,N'Khách R14','1997-03-07',N'Vietnam',2,'active',1),
(24,'ruser15@example.com',123,N'0908000024',N'Hồ Chí Minh',NULL,N'Khách R15','1998-04-08',N'Vietnam',2,'active',1),
(25,'ruser16@example.com',123,N'0908000025',N'Hà Nội',NULL,N'Khách R16','1991-05-09',N'Vietnam',2,'active',1),
(26,'ruser17@example.com',123,N'0908000026',N'Đà Nẵng',NULL,N'Khách R17','1992-06-10',N'Vietnam',2,'active',1),
(27,'ruser18@example.com',123,N'0908000027',N'Huế',NULL,N'Khách R18','1993-07-11',N'Vietnam',2,'active',1),
(28,'ruser19@example.com',123,N'0908000028',N'Cần Thơ',NULL,N'Khách R19','1994-08-12',N'Vietnam',2,'active',1),
(29,'ruser20@example.com',123,N'0908000029',N'Hà Nội',NULL,N'Khách R20','1995-09-13',N'Vietnam',2,'active',1),
(30,'ruser21@example.com',123,N'0908000030',N'Hà Nội',NULL,N'Khách R21','1996-10-14',N'Vietnam',2,'active',1),
(31,'ruser22@example.com',123,N'0908000031',N'Hồ Chí Minh',NULL,N'Khách R22','1997-11-15',N'Vietnam',2,'active',1),
(32,'ruser23@example.com',123,N'0908000032',N'Đà Nẵng',NULL,N'Khách R23','1998-12-16',N'Vietnam',2,'active',1),
(33,'ruser24@example.com',123,N'0908000033',N'Hà Nội',NULL,N'Khách R24','1991-01-17',N'Vietnam',2,'active',1),
(34,'ruser25@example.com',123,N'0908000034',N'Hà Nội',NULL,N'Khách R25','1992-02-18',N'Vietnam',2,'active',1);
SET IDENTITY_INSERT Users OFF;

------------------------------------------------------------
-- BOOKINGS BỔ SUNG: 5 booking/ mỗi hạng phòng (roomTypeId 1..9, dùng phòng đầu tiên mỗi hạng)
-- Quy ước room đầu tiên: (roomTypeId 1 -> roomId 1), (2 -> 3), (3 -> 5), (4 -> 6), (5 -> 7), (6 -> 9), (7 -> 10), (8 -> 11), (9 -> 12)
-- Tất cả đặt Completed để có thể review.
------------------------------------------------------------
SET IDENTITY_INSERT Bookings ON;
INSERT INTO Bookings (id,userId,hotelId,roomTypeId,roomId,checkInDate,checkOutDate,adults,children,status,originalAmount,totalAmount,paymentStatus)
VALUES
-- RoomType 1 (basePrice 1200000) users 10-14
(1001,10,1,1,1,'2025-01-01','2025-01-03',2,0,'Completed',2400000,2400000,'Paid'),
(1002,11,1,1,1,'2025-01-05','2025-01-06',2,0,'Completed',1200000,1150000,'Paid'),
(1003,12,1,1,1,'2025-01-10','2025-01-12',2,1,'Completed',2400000,2280000,'Paid'),
(1004,13,1,1,1,'2025-01-15','2025-01-17',1,0,'Completed',2400000,2400000,'Paid'),
(1005,14,1,1,1,'2025-01-20','2025-01-22',2,0,'Completed',2400000,2300000,'Paid'),
-- RoomType 2 (1350000) users 15-19
(1006,15,1,2,3,'2025-02-01','2025-02-03',2,0,'Completed',2700000,2565000,'Paid'),
(1007,16,1,2,3,'2025-02-05','2025-02-07',2,0,'Completed',2700000,2700000,'Paid'),
(1008,17,1,2,3,'2025-02-10','2025-02-11',2,0,'Completed',1350000,1300000,'Paid'),
(1009,18,1,2,3,'2025-02-15','2025-02-17',2,1,'Completed',2700000,2565000,'Paid'),
(1010,19,1,2,3,'2025-02-20','2025-02-22',2,0,'Completed',2700000,2565000,'Paid'),
-- RoomType 3 (2500000) users 20-24
(1011,20,1,3,5,'2025-03-01','2025-03-04',3,1,'Completed',7500000,7125000,'Paid'),
(1012,21,1,3,5,'2025-03-05','2025-03-07',4,2,'Completed',5000000,4850000,'Paid'),
(1013,22,1,3,5,'2025-03-10','2025-03-12',2,0,'Completed',5000000,4750000,'Paid'),
(1014,23,1,3,5,'2025-03-15','2025-03-18',4,2,'Completed',7500000,7125000,'Paid'),
(1015,24,1,3,5,'2025-03-20','2025-03-22',2,0,'Completed',5000000,4750000,'Paid'),
-- RoomType 4 (1300000) users 25-29
(1016,25,2,4,6,'2025-04-01','2025-04-03',2,0,'Completed',2600000,2470000,'Paid'),
(1017,26,2,4,6,'2025-04-05','2025-04-07',2,0,'Completed',2600000,2600000,'Paid'),
(1018,27,2,4,6,'2025-04-10','2025-04-12',1,0,'Completed',2600000,2470000,'Paid'),
(1019,28,2,4,6,'2025-04-15','2025-04-16',2,0,'Completed',1300000,1250000,'Paid'),
(1020,29,2,4,6,'2025-04-20','2025-04-23',2,0,'Completed',3900000,3700000,'Paid'),
-- RoomType 5 (1500000) users 30-34
(1021,30,2,5,7,'2025-05-01','2025-05-03',2,0,'Completed',3000000,2850000,'Paid'),
(1022,31,2,5,7,'2025-05-05','2025-05-08',2,1,'Completed',4500000,4275000,'Paid'),
(1023,32,2,5,7,'2025-05-10','2025-05-12',2,0,'Completed',3000000,3000000,'Paid'),
(1024,33,2,5,7,'2025-05-15','2025-05-17',2,0,'Completed',3000000,2850000,'Paid'),
(1025,34,2,5,7,'2025-05-20','2025-05-23',2,0,'Completed',4500000,4370000,'Paid'),
-- RoomType 6 (2700000) reuse users 10-14 again
(1026,10,2,6,9,'2025-06-01','2025-06-03',2,0,'Completed',5400000,5130000,'Paid'),
(1027,11,2,6,9,'2025-06-05','2025-06-07',2,0,'Completed',5400000,5400000,'Paid'),
(1028,12,2,6,9,'2025-06-10','2025-06-12',2,0,'Completed',5400000,5200000,'Paid'),
(1029,13,2,6,9,'2025-06-15','2025-06-18',2,0,'Completed',8100000,7800000,'Paid'),
(1030,14,2,6,9,'2025-06-20','2025-06-22',2,0,'Completed',5400000,5200000,'Paid'),
-- RoomType 7 (1250000) users 15-19
(1031,15,3,7,10,'2025-07-01','2025-07-02',1,0,'Completed',1250000,1200000,'Paid'),
(1032,16,3,7,10,'2025-07-05','2025-07-07',2,0,'Completed',2500000,2375000,'Paid'),
(1033,17,3,7,10,'2025-07-10','2025-07-12',2,0,'Completed',2500000,2500000,'Paid'),
(1034,18,3,7,10,'2025-07-15','2025-07-16',2,0,'Completed',1250000,1190000,'Paid'),
(1035,19,3,7,10,'2025-07-20','2025-07-22',2,1,'Completed',2500000,2375000,'Paid'),
-- RoomType 8 (1800000) users 20-24
(1036,20,3,8,11,'2025-08-01','2025-08-03',2,0,'Completed',3600000,3420000,'Paid'),
(1037,21,3,8,11,'2025-08-05','2025-08-07',2,0,'Completed',3600000,3500000,'Paid'),
(1038,22,3,8,11,'2025-08-10','2025-08-12',2,0,'Completed',3600000,3420000,'Paid'),
(1039,23,3,8,11,'2025-08-15','2025-08-17',2,0,'Completed',3600000,3500000,'Paid'),
(1040,24,3,8,11,'2025-08-20','2025-08-23',2,0,'Completed',5400000,5130000,'Paid'),
-- RoomType 9 (3000000) users 25-29
(1041,25,3,9,12,'2025-09-01','2025-09-03',2,0,'Completed',6000000,5700000,'Paid'),
(1042,26,3,9,12,'2025-09-05','2025-09-08',2,0,'Completed',9000000,8550000,'Paid'),
(1043,27,3,9,12,'2025-09-10','2025-09-12',2,0,'Completed',6000000,5700000,'Paid'),
(1044,28,3,9,12,'2025-09-15','2025-09-17',2,0,'Completed',6000000,5850000,'Paid'),
(1045,29,3,9,12,'2025-09-20','2025-09-23',2,0,'Completed',9000000,8550000,'Paid');
SET IDENTITY_INSERT Bookings OFF;

------------------------------------------------------------
-- REVIEWS: 1 review cho mỗi booking trên (mỗi hạng phòng 5 review)
-- rating đa dạng: ưu thế 7-10, vài cái thấp hơn.
------------------------------------------------------------
SET IDENTITY_INSERT Reviews ON;
INSERT INTO Reviews (id,bookingId,userId,rating,comment)
VALUES
-- RoomType 1 (Bookings 1001..1005)
(2001,1001,10,9,N'Phòng sạch sẽ và yên tĩnh'),
(2002,1002,11,8,N'Nhân viên thân thiện'),
(2003,1003,12,7,N'Ổn so với giá'),
(2004,1004,13,10,N'Rất hài lòng, sẽ quay lại'),
(2005,1005,14,6,N'Check-in hơi chậm'),
-- RoomType 2
(2006,1006,15,8,N'Giường thoải mái'),
(2007,1007,16,9,N'View đẹp'),
(2008,1008,17,7,N'Ổn, bữa sáng tạm được'),
(2009,1009,18,10,N'Tuyệt vời'),
(2010,1010,19,6,N'Cần cải thiện wifi'),
-- RoomType 3
(2011,1011,20,9,N'Phòng rộng rãi'),
(2012,1012,21,8,N'Dịch vụ tốt'),
(2013,1013,22,7,N'Ổn định'),
(2014,1014,23,9,N'Gia đình rất thích'),
(2015,1015,24,10,N'Xuất sắc'),
-- RoomType 4
(2016,1016,25,8,N'Đáng tiền'),
(2017,1017,26,7,N'Một số thiết bị hơi cũ'),
(2018,1018,27,9,N'Yên tĩnh'),
(2019,1019,28,8,N'Nhân viên hỗ trợ tốt'),
(2020,1020,29,6,N'Phòng hơi nhỏ'),
-- RoomType 5
(2021,1021,30,9,N'Ăn sáng ngon'),
(2022,1022,31,8,N'Phù hợp nghỉ cuối tuần'),
(2023,1023,32,7,N'Ổn'),
(2024,1024,33,10,N'Cực kỳ hài lòng'),
(2025,1025,34,8,N'Giường êm'),
-- RoomType 6
(2026,1026,10,9,N'Dịch vụ chuyên nghiệp'),
(2027,1027,11,7,N'Trung bình khá'),
(2028,1028,12,8,N'Hợp lý'),
(2029,1029,13,9,N'Sẽ quay lại'),
(2030,1030,14,6,N'Điều hòa hơi ồn'),
-- RoomType 7
(2031,1031,15,8,N'Ổn'),
(2032,1032,16,9,N'Rất tốt'),
(2033,1033,17,7,N'Bình thường'),
(2034,1034,18,8,N'Nhân viên lễ tân nhiệt tình'),
(2035,1035,19,10,N'Tuyệt hảo'),
-- RoomType 8
(2036,1036,20,9,N'Không gian đẹp'),
(2037,1037,21,8,N'Sạch sẽ'),
(2038,1038,22,7,N'Tạm ổn'),
(2039,1039,23,9,N'Sẽ giới thiệu bạn bè'),
(2040,1040,24,10,N'Rất tuyệt'),
-- RoomType 9
(2041,1041,25,9,N'View biển đẹp'),
(2042,1042,26,8,N'Hài lòng'),
(2043,1043,27,7,N'Ổn'),
(2044,1044,28,8,N'Phòng sạch'),
(2045,1045,29,10,N'Đẳng cấp');
SET IDENTITY_INSERT Reviews OFF;

------------------------------------------------------------
-- KẾT THÚC PHẦN BỔ SUNG REVIEW THEO HẠNG PHÒNG
------------------------------------------------------------
