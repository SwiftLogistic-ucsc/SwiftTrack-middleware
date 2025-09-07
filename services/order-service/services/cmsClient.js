import axios from "axios";

export async function verifyContract(order, baseUrl) {
  const { data } = await axios.post(`${baseUrl}/verify`, {
    orderId: order.id,
    clientId: order.clientId,
  });
  return data; // { message: "...", contractId: "...", ok: true }
}
