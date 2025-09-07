import axios from "axios";

export async function registerPackage(order, baseUrl) {
  const { data } = await axios.post(`${baseUrl}/register`, {
    orderId: order.id,
    clientId: order.clientId,
    packages: order.packages,
    deliveryAddresses: order.deliveryAddresses,
    priority: order.priority,
  });
  return data; // { message: "...", packageId: "...", ok: true }
}
