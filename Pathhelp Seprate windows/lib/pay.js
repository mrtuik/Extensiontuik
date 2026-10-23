// "Take a coffee for me" — UPI details shown on the Pay page.
// The QR in assets/pay-qr.png points to the same UPI ID.
export const UPI_ID = 'mrtuik@axl';
export const UPI_NAME = 'MOLLA TOUFIK AHAMED';
export const QR_SRC = 'assets/pay-qr.png';
export const upiLink = () =>
  `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(UPI_NAME)}&cu=INR&tn=${encodeURIComponent('Take a coffee')}`;
