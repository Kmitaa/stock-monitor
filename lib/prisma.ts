import path from 'node:path';
import { PrismaClient } from '@prisma/client';

// Resolve SQLite path: relative `file:./...` breaks when cwd isn't project root (Next/Turbopack).
function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    return `file:${path.join(process.cwd(), 'prisma', 'dev.db')}`;
  }
  if (raw.startsWith('file:')) {
    const rest = raw.slice('file:'.length);
    if (rest.startsWith('./') || rest.startsWith('.\\')) {
      return `file:${path.resolve(process.cwd(), rest)}`;
    }
  }
  return raw;
}

if (typeof process !== 'undefined') {
  process.env.DATABASE_URL = resolveDatabaseUrl();
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
