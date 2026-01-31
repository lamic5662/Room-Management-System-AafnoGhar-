import axios from "axios";

const API_BASE =
  import.meta.env.VITE_API_URL ||
  `http://${window.location.hostname}:5001`;

const http = axios.create({
  baseURL: API_BASE,
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;

    // If token invalid/expired -> logout
    if (status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");

      // redirect to login
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    return Promise.reject(err);
  }
);

export default http;
