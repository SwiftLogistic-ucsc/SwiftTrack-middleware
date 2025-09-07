import axios from "axios";

export async function registerPackage(order, baseUrl) {
  const { data } = await axios.post(`${baseUrl}/register`, {
    orderId: order.id,
    items: order.items,
  });
  return data; // { message: "...", packageId: "...", ok: true }
}
