import { Kafka, logLevel } from "kafkajs";
import dotenv from "dotenv";
dotenv.config();

const kafka = new Kafka({
  clientId: "order-service",
  brokers: process.env.KAFKA_BROKERS.split(","),
  logLevel: logLevel.NOTHING,
});

const producer = kafka.producer();

export async function ensureTopic(topic) {
  const admin = kafka.admin();
  await admin.connect();
  const existing = await admin.listTopics();
  if (!existing.includes(topic)) {
    await admin.createTopics({
      topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
    });
  }
  await admin.disconnect();
}

export async function startProducer() {
  await producer.connect();
}

export async function emitEvent(topic, event) {
  await producer.send({
    topic,
    messages: [{ value: JSON.stringify(event) }],
  });
}
