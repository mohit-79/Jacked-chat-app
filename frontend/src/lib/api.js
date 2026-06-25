import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("hn_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  console.log(`[API] -> ${config.method?.toUpperCase()} ${config.url}`);
  return config;
});

api.interceptors.response.use(
  (response) => {
    console.log(`[API] <- ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}`);
    return response;
  },
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url;
    console.warn(`[API] <- ${status || "ERR"} ${error.config?.method?.toUpperCase()} ${url}`, error.response?.data?.detail || error.message);
    // Stale/invalid token: clear it so future requests don't keep failing silently.
    if (status === 401 && url !== "/auth/login" && url !== "/auth/register") {
      localStorage.removeItem("hn_token");
    }
    return Promise.reject(error);
  }
);

export function getWebSocketUrl() {
  const token = localStorage.getItem("hn_token");
  const wsBase = BACKEND_URL.replace(/^http/, "ws");
  return `${wsBase}/api/ws?token=${encodeURIComponent(token || "")}`;
}

export function fileDownloadUrl(file_id) {
  const token = localStorage.getItem("hn_token");
  return `${API}/files/${file_id}/download?auth=${encodeURIComponent(token || "")}`;
}
