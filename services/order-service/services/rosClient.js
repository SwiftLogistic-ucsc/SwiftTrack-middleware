import axios from "axios";

export async function optimizeRoute(order, baseUrl) {
  const { data } = await axios.post(`${baseUrl}/optimize-route`, {
    orderId: order.id,
    clientId: order.clientId,
    packages: order.packages,
    deliveryAddresses: order.deliveryAddresses,
    priority: order.priority,
  });
  return data; // { message: "...", routeId: "...", etaMinutes: 42, ok: true }
}
