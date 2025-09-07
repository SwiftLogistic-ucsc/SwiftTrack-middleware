import axios from "axios";

export async function optimizeRoute(order, baseUrl) {
  const { data } = await axios.post(`${baseUrl}/optimize-route`, {
    orderId: order.id,
    addresses: order.addresses || [],
  });
  return data; // { message: "...", routeId: "...", etaMinutes: 42, ok: true }
}
