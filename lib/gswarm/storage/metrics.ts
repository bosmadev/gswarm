import * as path from "node:path";
import type {
  AggregatedMetrics,
  DailyMetrics,
  ErrorRateInfo,
  QuotaExhaustionPrediction,
  RequestMetric,
  StorageResult,
} from "../types";
import {
  deleteFile,
  getStoragePath,
  listFiles,
  readJsonFile,
  writeJsonFile,
} from "./base";

// Constants
export const METRICS_DIR = "metrics";
export const METRICS_CACHE_TTL_MS = 10000; // 10 seconds

// In-memory cache for metrics
interface MetricsCache {
  data: DailyMetrics;
  loadedAt: number;
}

const metricsCache = new Map<string, MetricsCache>();

/**
 * Gets today's date as YYYY-MM-DD string
 */
export function getTodayDateString(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

/**
 * Gets the file path for metrics on a specific date
 */
export function getMetricsPath(date: string): string {
  return getStoragePath(METRICS_DIR, `${date}.json`);
}

/**
 * Creates an empty aggregated metrics object
 */
export function createEmptyAggregated(
  periodStart: string,
  periodEnd: string,
): AggregatedMetrics {
  return {
    period_start: periodStart,
    period_end: periodEnd,
    total_requests: 0,
    successful_requests: 0,
    failed_requests: 0,
    avg_duration_ms: 0,
    total_duration_ms: 0,
    by_endpoint: {},
    by_account: {},
    by_project: {},
    error_breakdown: {},
  };
}

/**
 * Creates empty daily metrics for a date
 */
export function createEmptyDailyMetrics(date: string): DailyMetrics {
  return {
    date,
    requests: [],
    aggregated: createEmptyAggregated(
      `${date}T00:00:00.000Z`,
      `${date}T23:59:59.999Z`,
    ),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Updates aggregated metrics with a new metric
 */
export function updateAggregated(
  agg: AggregatedMetrics,
  metric: RequestMetric,
): void {
  // Update totals
  agg.total_requests++;
  agg.total_duration_ms += metric.duration_ms;

  if (metric.status === "success") {
    agg.successful_requests++;
  } else {
    agg.failed_requests++;
    if (metric.error_type) {
      agg.error_breakdown[metric.error_type] =
        (agg.error_breakdown[metric.error_type] || 0) + 1;
    }
  }

  // Recalculate average
  agg.avg_duration_ms = agg.total_duration_ms / agg.total_requests;

  // Update endpoint stats
  const endpointKey = `${metric.method} ${metric.endpoint}`;
  if (!agg.by_endpoint[endpointKey]) {
    agg.by_endpoint[endpointKey] = {
      total: 0,
      successful: 0,
      failed: 0,
      avg_duration_ms: 0,
      total_duration_ms: 0,
    };
  }
  const endpointStats = agg.by_endpoint[endpointKey];
  endpointStats.total++;
  endpointStats.total_duration_ms += metric.duration_ms;
  if (metric.status === "success") {
    endpointStats.successful++;
  } else {
    endpointStats.failed++;
  }
  endpointStats.avg_duration_ms =
    endpointStats.total_duration_ms / endpointStats.total;

  // Update account stats
  if (!agg.by_account[metric.account_id]) {
    agg.by_account[metric.account_id] = {
      total: 0,
      successful: 0,
      failed: 0,
      avg_duration_ms: 0,
      total_duration_ms: 0,
      error_types: {},
    };
  }
  const accountStats = agg.by_account[metric.account_id];
  accountStats.total++;
  accountStats.total_duration_ms += metric.duration_ms;
  if (metric.status === "success") {
    accountStats.successful++;
  } else {
    accountStats.failed++;
    if (metric.error_type) {
      accountStats.error_types[metric.error_type] =
        (accountStats.error_types[metric.error_type] || 0) + 1;
    }
  }
  accountStats.avg_duration_ms =
    accountStats.total_duration_ms / accountStats.total;

  // Update project stats
  if (!agg.by_project[metric.project_id]) {
    agg.by_project[metric.project_id] = {
      total: 0,
      successful: 0,
      failed: 0,
      avg_duration_ms: 0,
      total_duration_ms: 0,
      tokens_used: 0,
    };
  }
  const projectStats = agg.by_project[metric.project_id];
  projectStats.total++;
  projectStats.total_duration_ms += metric.duration_ms;
  if (metric.status === "success") {
    projectStats.successful++;
  } else {
    projectStats.failed++;
  }
  projectStats.avg_duration_ms =
    projectStats.total_duration_ms / projectStats.total;
  if (metric.tokens_used) {
    projectStats.tokens_used += metric.tokens_used;
  }
}

/**
 * Merges source aggregated metrics into target
 */
export function mergeAggregated(
  target: AggregatedMetrics,
  source: AggregatedMetrics,
): void {
  // Merge totals
  const combinedTotal = target.total_requests + source.total_requests;
  const combinedDuration = target.total_duration_ms + source.total_duration_ms;

  target.total_requests = combinedTotal;
  target.successful_requests += source.successful_requests;
  target.failed_requests += source.failed_requests;
  target.total_duration_ms = combinedDuration;
  target.avg_duration_ms =
    combinedTotal > 0 ? combinedDuration / combinedTotal : 0;

  // Update period bounds
  if (source.period_start < target.period_start) {
    target.period_start = source.period_start;
  }
  if (source.period_end > target.period_end) {
    target.period_end = source.period_end;
  }

  // Merge error breakdown
  for (const [errorType, count] of Object.entries(source.error_breakdown)) {
    target.error_breakdown[errorType] =
      (target.error_breakdown[errorType] || 0) + count;
  }

  // Merge endpoint stats
  for (const [endpoint, stats] of Object.entries(source.by_endpoint)) {
    if (!target.by_endpoint[endpoint]) {
      target.by_endpoint[endpoint] = { ...stats };
    } else {
      const t = target.by_endpoint[endpoint];
      const combined = t.total + stats.total;
      const combinedDur = t.total_duration_ms + stats.total_duration_ms;
      t.total = combined;
      t.successful += stats.successful;
      t.failed += stats.failed;
      t.total_duration_ms = combinedDur;
      t.avg_duration_ms = combined > 0 ? combinedDur / combined : 0;
    }
  }

  // Merge account stats
  for (const [accountId, stats] of Object.entries(source.by_account)) {
    if (!target.by_account[accountId]) {
      target.by_account[accountId] = {
        ...stats,
        error_types: { ...stats.error_types },
      };
    } else {
      const t = target.by_account[accountId];
      const combined = t.total + stats.total;
      const combinedDur = t.total_duration_ms + stats.total_duration_ms;
      t.total = combined;
      t.successful += stats.successful;
      t.failed += stats.failed;
      t.total_duration_ms = combinedDur;
      t.avg_duration_ms = combined > 0 ? combinedDur / combined : 0;
      for (const [errorType, count] of Object.entries(stats.error_types)) {
        t.error_types[errorType] = (t.error_types[errorType] || 0) + count;
      }
    }
  }

  // Merge project stats
  for (const [projectId, stats] of Object.entries(source.by_project)) {
    if (!target.by_project[projectId]) {
      target.by_project[projectId] = { ...stats };
    } else {
      const t = target.by_project[projectId];
      const combined = t.total + stats.total;
      const combinedDur = t.total_duration_ms + stats.total_duration_ms;
      t.total = combined;
      t.successful += stats.successful;
      t.failed += stats.failed;
      t.total_duration_ms = combinedDur;
      t.avg_duration_ms = combined > 0 ? combinedDur / combined : 0;
      t.tokens_used += stats.tokens_used;
    }
  }
}

/**
 * Loads metrics for a specific date (defaults to today)
 */
export async function loadMetrics(
  date?: string,
): Promise<StorageResult<DailyMetrics>> {
  const targetDate = date || getTodayDateString();
  const filePath = getMetricsPath(targetDate);

  // Check cache
  const cached = metricsCache.get(targetDate);
  if (cached && Date.now() - cached.loadedAt < METRICS_CACHE_TTL_MS) {
    return { success: true, data: cached.data };
  }

  const result = await readJsonFile<DailyMetrics>(filePath);

  if (!result.success) {
    if (result.error === "File not found") {
      const emptyMetrics = createEmptyDailyMetrics(targetDate);
      return { success: true, data: emptyMetrics };
    }
    return result;
  }

  // Update cache
  metricsCache.set(targetDate, {
    data: result.data,
    loadedAt: Date.now(),
  });

  return result;
}

/**
 * Records a new metric and updates aggregated stats in real-time
 */
export async function recordMetric(
  metric: RequestMetric,
): Promise<StorageResult<void>> {
  const metricDate = metric.timestamp.split("T")[0];
  const loadResult = await loadMetrics(metricDate);

  if (!loadResult.success) {
    return { success: false, error: loadResult.error };
  }

  const dailyMetrics = loadResult.data;

  // Add request to list
  dailyMetrics.requests.push(metric);

  // Update aggregated stats in real-time
  updateAggregated(dailyMetrics.aggregated, metric);

  // Update timestamp
  dailyMetrics.updated_at = new Date().toISOString();

  // Write to file
  const filePath = getMetricsPath(metricDate);
  const writeResult = await writeJsonFile(filePath, dailyMetrics);

  if (!writeResult.success) {
    return writeResult;
  }

  // Update cache
  metricsCache.set(metricDate, {
    data: dailyMetrics,
    loadedAt: Date.now(),
  });

  return { success: true, data: undefined };
}

/**
 * Gets aggregated metrics for a date range
 */
export async function getAggregatedMetrics(
  startDate: string,
  endDate?: string,
): Promise<StorageResult<AggregatedMetrics>> {
  const end = endDate || getTodayDateString();
  const result = createEmptyAggregated(
    `${startDate}T00:00:00.000Z`,
    `${end}T23:59:59.999Z`,
  );

  // Iterate through each day in the range
  const start = new Date(startDate);
  const endDt = new Date(end);

  for (let d = new Date(start); d <= endDt; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    const dailyResult = await loadMetrics(dateStr);

    if (dailyResult.success && dailyResult.data.requests.length > 0) {
      mergeAggregated(result, dailyResult.data.aggregated);
    }
  }

  return { success: true, data: result };
}

/**
 * Gets error rates for all accounts on a specific date
 */
export async function getAccountErrorRates(
  date?: string,
): Promise<StorageResult<Record<string, ErrorRateInfo>>> {
  const loadResult = await loadMetrics(date);

  if (!loadResult.success) {
    return { success: false, error: loadResult.error };
  }

  const result: Record<string, ErrorRateInfo> = {};
  const byAccount = loadResult.data.aggregated.by_account;

  for (const [accountId, stats] of Object.entries(byAccount)) {
    result[accountId] = {
      errorRate: stats.total > 0 ? stats.failed / stats.total : 0,
      total: stats.total,
    };
  }

  return { success: true, data: result };
}

/**
 * Predicts when quota will be exhausted based on current usage rate
 */
export async function predictQuotaExhaustion(
  projectId: string,
  dailyQuota: number,
): Promise<StorageResult<QuotaExhaustionPrediction>> {
  const today = getTodayDateString();
  const loadResult = await loadMetrics(today);

  if (!loadResult.success) {
    return { success: false, error: loadResult.error };
  }

  const projectStats = loadResult.data.aggregated.by_project[projectId];

  if (!projectStats) {
    return {
      success: true,
      data: {
        remainingRequests: dailyQuota,
      },
    };
  }

  const usedRequests = projectStats.total;
  const remainingRequests = Math.max(0, dailyQuota - usedRequests);

  if (remainingRequests === 0) {
    return {
      success: true,
      data: {
        exhaustedAt: new Date().toISOString(),
        remainingRequests: 0,
      },
    };
  }

  // Calculate rate and predict exhaustion
  const now = new Date();
  const startOfDay = new Date(today);
  const elapsedMs = now.getTime() - startOfDay.getTime();
  const elapsedHours = elapsedMs / (1000 * 60 * 60);

  if (elapsedHours > 0 && usedRequests > 0) {
    const requestsPerHour = usedRequests / elapsedHours;
    const hoursUntilExhaustion = remainingRequests / requestsPerHour;
    const exhaustionTime = new Date(
      now.getTime() + hoursUntilExhaustion * 60 * 60 * 1000,
    );

    // Only predict if exhaustion would happen today
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    if (exhaustionTime <= endOfDay) {
      return {
        success: true,
        data: {
          exhaustedAt: exhaustionTime.toISOString(),
          remainingRequests,
        },
      };
    }
  }

  return {
    success: true,
    data: {
      remainingRequests,
    },
  };
}

/**
 * Cleans up metrics files older than the specified number of days
 */
export async function cleanupOldMetrics(
  keepDays = 30,
): Promise<StorageResult<number>> {
  const metricsDir = getStoragePath(METRICS_DIR);
  const listResult = await listFiles(metricsDir, ".json");

  if (!listResult.success) {
    return { success: false, error: listResult.error };
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - keepDays);
  const cutoffStr = cutoffDate.toISOString().split("T")[0];

  let deletedCount = 0;
  const errors: string[] = [];

  for (const file of listResult.data) {
    // Extract date from filename (format: YYYY-MM-DD.json)
    const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})\.json$/);
    if (!dateMatch) continue;

    const fileDate = dateMatch[1];
    if (fileDate < cutoffStr) {
      const filePath = path.join(metricsDir, file);
      const deleteResult = await deleteFile(filePath);

      if (deleteResult.success) {
        deletedCount++;
        // Remove from cache
        metricsCache.delete(fileDate);
      } else {
        errors.push(deleteResult.error);
      }
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      error: `Deleted ${deletedCount} files but encountered errors: ${errors.join(", ")}`,
    };
  }

  return { success: true, data: deletedCount };
}
