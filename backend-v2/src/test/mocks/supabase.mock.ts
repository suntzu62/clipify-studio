import { vi } from 'vitest';

export const mockStorageUpload = vi.fn();
export const mockStorageDownload = vi.fn();
export const mockStorageRemove = vi.fn();
export const mockStorageGetPublicUrl = vi.fn();
export const mockStorageList = vi.fn();
export const mockStorageCreateSignedUrl = vi.fn();

export const mockSupabaseStorage = {
  from: vi.fn().mockImplementation(() => ({
    upload: mockStorageUpload,
    download: mockStorageDownload,
    remove: mockStorageRemove,
    getPublicUrl: mockStorageGetPublicUrl,
    list: mockStorageList,
    createSignedUrl: mockStorageCreateSignedUrl,
  })),
};

export const mockSupabaseClient = {
  storage: mockSupabaseStorage,
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  single: vi.fn(),
};

export const mockCreateClient = vi.fn().mockImplementation(() => mockSupabaseClient);

export function setupSupabaseMock() {
  vi.mock('@supabase/supabase-js', () => ({
    createClient: mockCreateClient,
  }));
}

export function resetSupabaseMock() {
  mockStorageUpload.mockReset();
  mockStorageDownload.mockReset();
  mockStorageRemove.mockReset();
  mockStorageGetPublicUrl.mockReset();
  mockStorageList.mockReset();
  mockStorageCreateSignedUrl.mockReset();
}

// Helper to create mock upload response
export function createMockUploadResponse(path: string, error?: string) {
  if (error) {
    return { data: null, error: { message: error } };
  }
  return {
    data: { path, id: 'test-file-id', fullPath: `bucket/${path}` },
    error: null,
  };
}

// Helper to create mock download response
export function createMockDownloadResponse(data: Blob | null, error?: string) {
  if (error) {
    return { data: null, error: { message: error } };
  }
  return { data, error: null };
}

// Helper to create mock public URL response
export function createMockPublicUrlResponse(publicUrl: string) {
  return {
    data: { publicUrl },
  };
}

// Helper to create mock signed URL response
export function createMockSignedUrlResponse(signedUrl: string, error?: string) {
  if (error) {
    return { data: null, error: { message: error } };
  }
  return {
    data: { signedUrl },
    error: null,
  };
}

// Helper to create mock list response
export function createMockListResponse(files: Array<{ name: string; id: string }>, error?: string) {
  if (error) {
    return { data: null, error: { message: error } };
  }
  return { data: files, error: null };
}
