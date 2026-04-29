import axios from "axios";
import { captureApiFailure } from "../lib/monitoring";

const DEFAULT_PROD_API_BASE_URL = "https://avantika-interview-api-d0hubeg6exgwbgg3.centralindia-01.azurewebsites.net/api";
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? DEFAULT_PROD_API_BASE_URL : "/api");
const MAX_RETRIES = 2;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 60_000,
});

let isRefreshing = false;
let refreshQueue = []; // pending requests during token refresh

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeError(err) {
  const status = err.response?.status;
  const code = err.response?.data?.code || (err.code === "ECONNABORTED" ? "TIMEOUT" : "REQUEST_FAILED");
  const message =
    err.response?.data?.message ||
    err.response?.data?.error ||
    (code === "TIMEOUT" ? "Request timed out. Please retry." : "Something went wrong. Please try again.");

  return {
    status,
    code,
    message,
    details: err.response?.data?.details,
    requestId: err.response?.data?.requestId,
  };
}

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.metadata = config.metadata || { retryCount: 0 };
  return config;
});

// Handle 401 globally — try refresh token before logging out
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const cfg = err.config || {};
    const isRetryableNetworkError = !err.response && (err.code === "ECONNABORTED" || err.message === "Network Error");
    const isGet = (cfg.method || "get").toLowerCase() === "get";

    if (isRetryableNetworkError && isGet && (cfg.metadata?.retryCount || 0) < MAX_RETRIES) {
      cfg.metadata.retryCount += 1;
      const backoffMs = 300 * Math.pow(2, cfg.metadata.retryCount - 1);
      await delay(backoffMs);
      return api(cfg);
    }

    if (err.response?.status === 401 && !cfg._isRetry) {
      const refreshToken = localStorage.getItem("refreshToken");

      if (!refreshToken) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.dispatchEvent(new CustomEvent("auth:expired"));
        err.normalized = normalizeError(err);
        return Promise.reject(err);
      }

      if (isRefreshing) {
        // Queue this request to retry after refresh completes
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then(() => {
          cfg._isRetry = true;
          cfg.headers.Authorization = `Bearer ${localStorage.getItem("token")}`;
          return api(cfg);
        });
      }

      isRefreshing = true;
      try {
        const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
        const { token, refreshToken: newRefresh } = res.data;
        localStorage.setItem("token", token);
        if (newRefresh) localStorage.setItem("refreshToken", newRefresh);

        // Flush queue
        refreshQueue.forEach(p => p.resolve());
        refreshQueue = [];

        cfg._isRetry = true;
        cfg.headers.Authorization = `Bearer ${token}`;
        return api(cfg);
      } catch (_refreshErr) {
        refreshQueue.forEach(p => p.reject(_refreshErr));
        refreshQueue = [];
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
        window.dispatchEvent(new CustomEvent("auth:expired"));
      } finally {
        isRefreshing = false;
      }
    }

    err.normalized = normalizeError(err);
    captureApiFailure(err, err.normalized);
    return Promise.reject(err);
  }
);

export default api;
