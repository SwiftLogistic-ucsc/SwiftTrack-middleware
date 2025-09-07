import axios from "axios";

export async function verifyContract(order, baseUrl) {
  const { data } = await axios.post(`${baseUrl}/verify`, {
    orderId: order.id,
    clientId: order.clientId,
    packages: order.packages,
    deliveryAddresses: order.deliveryAddresses,
    priority: order.priority,
  });
  return data; // { message: "...", contractId: "...", ok: true }
}
