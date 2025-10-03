export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  CANCELED: 'canceled'
});

export const BOOKING_STATUS = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  SUCCESS: 'success',
  CANCELED: 'canceled'
});

// Helper mappers (frontend side only)
export function mapPaymentLabel(st){
  switch(st){
    case PAYMENT_STATUS.PAID: return 'Đã thanh toán';
    case PAYMENT_STATUS.CANCELED: return 'Hủy';
    default: return 'Chờ thanh toán';
  }
}

export function mapBookingLabel(st){
  switch(st){
    case BOOKING_STATUS.SUCCESS: return 'Thành công';
    case BOOKING_STATUS.CONFIRMED: return 'Đã xác nhận';
    case BOOKING_STATUS.CANCELED: return 'Đã hủy';
    default: return 'Chờ xác nhận';
  }
}