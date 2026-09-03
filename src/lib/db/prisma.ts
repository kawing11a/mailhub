import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { runtimeConfig } from '@/lib/runtime-config';

// Polyfill for BigInt serialization in JSON
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  max: runtimeConfig.dbPoolMax,
  connectionTimeoutMillis: runtimeConfig.dbConnectionTimeoutMs,
  idleTimeoutMillis: 30000,
});
const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const createPrismaClient = () =>
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

export const prisma =
  globalForPrisma.prisma && (globalForPrisma.prisma as any).signature
    ? globalForPrisma.prisma
    : createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
