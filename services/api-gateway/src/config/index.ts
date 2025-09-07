interface Config {
  SERVICE_NAME: string;
  PORT: number;
  DEFAULT_TIMEOUT: number;
  AUTH_JWT_SECRET: string;
  GATEWAY_JWT_SECRET: string;
  GATEWAY_JWT_EXPIRES_IN: string;
  LOG_LEVEL: string;
  REDIS_URL: string;
  AUTH_SERVICE_URL: string;
  INSTITUTION_SERVICE_URL: string;
  PATIENT_RECORD_SERVICE_URL: string;
  LAB_REPORT_SERVICE_URL: string;
  NODE_ENV: string;
}

export const config: Config = {
  SERVICE_NAME: require('../../package.json').name,
  PORT: Number(process.env.PORT) || 3000,
  DEFAULT_TIMEOUT: Number(process.env.DEFAULT_TIMEOUT || '30000'),
  AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET || 'default-auth-secret-key',
  GATEWAY_JWT_SECRET:
    process.env.GATEWAY_JWT_SECRET || 'default-gateway-secret-key',
  GATEWAY_JWT_EXPIRES_IN: process.env.GATEWAY_JWT_EXPIRES_IN || '1m',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  INSTITUTION_SERVICE_URL:
    process.env.INSTITUTION_SERVICE_URL || 'http://localhost:3002',
  PATIENT_RECORD_SERVICE_URL:
    process.env.PATIENT_RECORD_SERVICE_URL || 'http://localhost:3005',
  LAB_REPORT_SERVICE_URL:
    process.env.LAB_REPORT_SERVICE_URL || 'http://localhost:3004',
  NODE_ENV: process.env.NODE_ENV || 'development',
};
