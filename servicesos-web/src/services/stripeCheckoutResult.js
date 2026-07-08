export function getStripeBookingCheckoutResult(search = "") {
  const params = new URLSearchParams(search);
  const result = params.get("stripe_booking_checkout");
  if (result === "success") return "success";
  if (result === "cancelled" || result === "canceled") return "cancelled";
  return null;
}
