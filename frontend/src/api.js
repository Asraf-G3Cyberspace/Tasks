const API_BASE = "/api/auth";

export function getTokens() {
  return {
    accessToken: localStorage.getItem("accessToken"),
    refreshToken: localStorage.getItem("refreshToken"),
  };
}

export function setTokens(accessToken, refreshToken) {
  if (accessToken) localStorage.setItem("accessToken", accessToken);
  if (refreshToken) localStorage.setItem("refreshToken", refreshToken);
}

export function clearTokens() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
}

async function rawFetch(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  const { accessToken } = getTokens();
  if (auth && accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

export async function api(path, options = {}) {
  let res = await rawFetch(path, options);
  if (res.status === 403 && options.auth !== false) {
    // try refresh
    const { refreshToken } = getTokens();
    if (!refreshToken) throw new Error("Session expired. Please log in again.");
    const refreshRes = await rawFetch("/refresh-token", { method: "POST", body: { refreshToken }, auth: false });
    if (!refreshRes.ok) {
      clearTokens();
      throw new Error("Session expired. Please log in again.");
    }
    const data = await refreshRes.json();
    setTokens(data.accessToken, data.refreshToken);
    // retry
    res = await rawFetch(path, options);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export const AuthApi = {
  register: (body) => api("/register", { method: "POST", body, auth: false }),
  login: (body) => api("/login", { method: "POST", body, auth: false }),
  confirmLogoutLogin: (body) => api("/confirm-logout-login", { method: "POST", body, auth: false }),
  logout: () => api("/logout", { method: "POST" }),
  profile: () => api("/profile"),
  updateProfile: (body) => api("/update-profile", { method: "POST", body }),
  testProtected: () => api("/test-protected"),
  
  // User Management CRUD operations
  getUsers: (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    return api(`/users${queryString ? `?${queryString}` : ''}`);
  },
  getUser: (id) => api(`/users/${id}`),
  createUser: (body) => api("/users", { method: "POST", body }),
  updateUser: (id, body) => api(`/users/${id}`, { method: "PUT", body }),
  deleteUser: (id) => api(`/users/${id}`, { method: "DELETE" }),
};
