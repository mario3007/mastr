/**
 * Shared in-memory / cache job store to map jobId to outputKey and metadata
 */

export interface MasterJobRecord {
  jobId: string;
  fileKey: string;
  outputKey: string;
  preset: string;
  durationSeconds: number;
  createdAt: number;
}

const globalForJobs = globalThis as unknown as {
  jobMapInstance?: Map<string, MasterJobRecord>;
};

export const jobStore: Map<string, MasterJobRecord> =
  globalForJobs.jobMapInstance ?? new Map<string, MasterJobRecord>();

if (process.env.NODE_ENV !== 'production') {
  globalForJobs.jobMapInstance = jobStore;
}
