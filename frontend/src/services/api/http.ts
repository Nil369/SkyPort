import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

import { env } from "@/app/env";
import { useAuthStore } from "@/stores/authStore";

export const http = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 15_000,
});

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    // Placeholder for future token refresh flow.
    // SkyPort currently issues a single access token.
    return Promise.reject(err);
  }
);
