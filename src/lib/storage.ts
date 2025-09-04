import { Job } from './jobs-api';

const STORAGE_KEY = 'cortai:jobs';

export function getStorageKey(userId: string): string {
  return `${STORAGE_KEY}:${userId}`;
}

export function getUserJobs(userId: string): Job[] {
  try {
    const stored = localStorage.getItem(getStorageKey(userId));
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to get user jobs from storage:', error);
    return [];
  }
}

export function saveUserJob(userId: string, job: Job): void {
  try {
    const jobs = getUserJobs(userId);
    const existingIndex = jobs.findIndex(j => j.id === job.id);
    
    if (existingIndex >= 0) {
      jobs[existingIndex] = job;
    } else {
      jobs.unshift(job); // Add new jobs to the beginning
    }
    
    localStorage.setItem(getStorageKey(userId), JSON.stringify(jobs));
  } catch (error) {
    console.error('Failed to save user job to storage:', error);
  }
}

export function updateJobStatus(
  userId: string, 
  jobId: string, 
  updates: Partial<Job>
): void {
  try {
    const jobs = getUserJobs(userId);
    const jobIndex = jobs.findIndex(j => j.id === jobId);
    
    if (jobIndex >= 0) {
      jobs[jobIndex] = { ...jobs[jobIndex], ...updates };
      localStorage.setItem(getStorageKey(userId), JSON.stringify(jobs));
    }
  } catch (error) {
    console.error('Failed to update job status in storage:', error);
  }
}

export function clearUserJobs(userId: string): void {
  try {
    localStorage.removeItem(getStorageKey(userId));
  } catch (error) {
    console.error('Failed to clear user jobs from storage:', error);
  }
}