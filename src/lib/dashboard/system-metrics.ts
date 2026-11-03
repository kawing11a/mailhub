import { readFile, statfs } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

type CpuSample = { usageMicros: number; sampledAt: number };
type NetworkSample = { receivedBytes: number; sentBytes: number; sampledAt: number };

export interface SystemMetrics {
  cpuPercent: number | null;
  memory: { usedBytes: number; totalBytes: number; percent: number } | null;
  disk: { usedBytes: number; totalBytes: number; percent: number } | null;
  network: { receiveBytesPerSecond: number; sendBytesPerSecond: number } | null;
}

let previousCpuSample: CpuSample | null = null;
let previousHostCpuSample: { usedTime: number; totalTime: number } | null = null;
let previousNetworkSample: NetworkSample | null = null;

function finitePercent(value: number): number | null {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;
}

async function readText(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function readMemory(): Promise<SystemMetrics['memory']> {
  const [currentText, limitText] = await Promise.all([
    readText('/sys/fs/cgroup/memory.current'),
    readText('/sys/fs/cgroup/memory.max'),
  ]);
  const current = Number(currentText?.trim());
  const limit = Number(limitText?.trim());

  if (Number.isFinite(current) && Number.isFinite(limit) && current >= 0 && limit > 0) {
    return { usedBytes: current, totalBytes: limit, percent: finitePercent((current / limit) * 100)! };
  }

  const totalBytes = os.totalmem();
  const usedBytes = totalBytes - os.freemem();
  if (totalBytes <= 0 || !Number.isFinite(usedBytes)) return null;
  return { usedBytes, totalBytes, percent: finitePercent((usedBytes / totalBytes) * 100)! };
}

async function readCpuPercent(): Promise<number | null> {
  const [cpuStats, cpuMax] = await Promise.all([
    readText('/sys/fs/cgroup/cpu.stat'),
    readText('/sys/fs/cgroup/cpu.max'),
  ]);
  const usageMatch = cpuStats?.match(/^usage_usec\s+(\d+)$/m);
  const usageMicros = Number(usageMatch?.[1]);
  const cpuMaxParts = cpuMax?.trim().split(/\s+/);
  const quota = Number(cpuMaxParts?.[0]);
  const period = Number(cpuMaxParts?.[1]);
  const now = Date.now();
  if (Number.isFinite(usageMicros)) {
    const quotaCores = Number.isFinite(quota) && quota > 0 && Number.isFinite(period) && period > 0
      ? quota / period
      : os.availableParallelism();
    const previous = previousCpuSample;
    previousCpuSample = { usageMicros, sampledAt: now };
    if (!previous || !Number.isFinite(quotaCores) || quotaCores <= 0) return null;

    const elapsedMicros = (now - previous.sampledAt) * 1000;
    const usedMicros = usageMicros - previous.usageMicros;
    if (elapsedMicros <= 0 || usedMicros < 0) return null;
    return finitePercent((usedMicros / elapsedMicros / quotaCores) * 100);
  }

  const cpus = os.cpus();
  if (cpus.length === 0) return null;
  const totalTime = cpus.reduce((total, cpu) => total + Object.values(cpu.times).reduce((sum, value) => sum + value, 0), 0);
  const idleTime = cpus.reduce((total, cpu) => total + cpu.times.idle, 0);
  const usedTime = totalTime - idleTime;
  const previous = previousHostCpuSample;
  previousHostCpuSample = { usedTime, totalTime };
  if (!previous) return null;

  const totalDelta = totalTime - previous.totalTime;
  const usedDelta = usedTime - previous.usedTime;
  if (totalDelta <= 0 || usedDelta < 0) return null;
  return finitePercent((usedDelta / totalDelta) * 100);
}

async function readDisk(): Promise<SystemMetrics['disk']> {
  try {
    const disk = await statfs(path.join(process.cwd(), '.storage'));
    const totalBytes = Number(disk.blocks) * Number(disk.bsize);
    const freeBytes = Number(disk.bavail) * Number(disk.bsize);
    const usedBytes = totalBytes - freeBytes;
    if (totalBytes <= 0 || usedBytes < 0 || !Number.isFinite(usedBytes)) return null;
    return { usedBytes, totalBytes, percent: finitePercent((usedBytes / totalBytes) * 100)! };
  } catch {
    return null;
  }
}

async function readNetworkRate(): Promise<SystemMetrics['network']> {
  const contents = await readText('/proc/net/dev');
  if (!contents) return null;

  let receivedBytes = 0;
  let sentBytes = 0;
  let interfaces = 0;
  for (const line of contents.split('\n').slice(2)) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const interfaceName = line.slice(0, separator).trim();
    if (interfaceName === 'lo') continue;
    const counters = line.slice(separator + 1).trim().split(/\s+/).map(Number);
    if (counters.length < 9 || !Number.isFinite(counters[0]) || !Number.isFinite(counters[8])) continue;
    receivedBytes += counters[0];
    sentBytes += counters[8];
    interfaces += 1;
  }

  if (interfaces === 0) return null;
  const now = Date.now();
  const previous = previousNetworkSample;
  previousNetworkSample = { receivedBytes, sentBytes, sampledAt: now };
  if (!previous) return null;

  const elapsedSeconds = (now - previous.sampledAt) / 1000;
  const receivedDelta = receivedBytes - previous.receivedBytes;
  const sentDelta = sentBytes - previous.sentBytes;
  if (elapsedSeconds <= 0 || receivedDelta < 0 || sentDelta < 0) return null;
  return {
    receiveBytesPerSecond: receivedDelta / elapsedSeconds,
    sendBytesPerSecond: sentDelta / elapsedSeconds,
  };
}

export async function getSystemMetrics(): Promise<SystemMetrics> {
  const [cpuPercent, memory, disk, network] = await Promise.all([
    readCpuPercent().catch(() => null),
    readMemory().catch(() => null),
    readDisk().catch(() => null),
    readNetworkRate().catch(() => null),
  ]);

  return { cpuPercent, memory, disk, network };
}
