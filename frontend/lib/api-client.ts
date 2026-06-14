const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, "");

function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("auth_token") || "";
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
    });
  } catch (error) {
    const hint =
      typeof window !== "undefined" && window.location.hostname !== "localhost"
        ? ` Cannot reach API at ${API_BASE}. If you use a custom domain, ensure BACKEND_URL is reachable from your browser.`
        : ` Cannot reach API at ${API_BASE}. Is the backend running on port 4000?`;
    throw new Error(
      error instanceof Error ? `${error.message}.${hint}` : `Network request failed.${hint}`
    );
  }

  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch (_error) {
      // ignore
    }
    throw new Error(message);
  }
  return res;
}

export { API_BASE };
