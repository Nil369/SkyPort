import axios from 'axios';
import type { AxiosInstance } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

const axiosInstance: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth interceptor if needed
axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle errors
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface VPSListResponse {
  success: boolean;
  data: any[];
  total: number;
}

export interface VPSResponse {
  success: boolean;
  data: any;
}

export interface TestConnectionResponse {
  success: boolean;
  data: {
    success: boolean;
    message: string;
    test_time: string;
    duration_ms: number;
  };
}

export interface UpdateCheckResponse {
  success: boolean;
  data: {
    is_update_available: boolean;
    current_version: string;
    latest_version: string;
    latest_release?: {
      tag_name: string;
      name: string;
      body: string;
      html_url: string;
      published_at: string;
    };
    check_time: string;
    error?: string;
  };
}

export const vpsApi = {
  // List all VPS servers
  listVPS: async (params?: { offset?: number; limit?: number }): Promise<VPSListResponse> => {
    const response = await axiosInstance.get('/vps', { params });
    return response.data;
  },

  // Get single VPS
  getVPS: async (vpsId: string): Promise<VPSResponse> => {
    const response = await axiosInstance.get(`/vps/${vpsId}`);
    return response.data;
  },

  // Create VPS
  createVPS: async (data: any): Promise<VPSResponse> => {
    const response = await axiosInstance.post('/vps', data);
    return response.data;
  },

  // Update VPS
  updateVPS: async (vpsId: string, data: any): Promise<VPSResponse> => {
    const response = await axiosInstance.put(`/vps/${vpsId}`, data);
    return response.data;
  },

  // Delete VPS
  deleteVPS: async (vpsId: string): Promise<{ success: boolean; message: string }> => {
    const response = await axiosInstance.delete(`/vps/${vpsId}`);
    return response.data;
  },

  // Test SSH connection
  testConnection: async (vpsId: string): Promise<TestConnectionResponse> => {
    const response = await axiosInstance.post(`/vps/${vpsId}/test`);
    return response.data;
  },
};

export const updateApi = {
  // Check for updates
  checkForUpdates: async (): Promise<UpdateCheckResponse> => {
    const response = await axiosInstance.get('/updates/check');
    return response.data;
  },

  // Get latest release
  getLatestRelease: async (): Promise<UpdateCheckResponse> => {
    const response = await axiosInstance.get('/updates/latest');
    return response.data;
  },
};

export default axiosInstance;
