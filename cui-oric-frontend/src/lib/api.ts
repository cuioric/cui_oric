import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import type {
  ApiErrorBody,
  ApiResponse,
  AuthorProfile,
  Dashboard,
  Department,
  PaginationMeta,
  Publication,
  Review,
  User,
} from "../types";

const baseURL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";
let onSessionExpired: () => void = () => undefined;
let onTokenRefreshed: (token: string) => void = () => undefined;
let refreshInFlight: Promise<string | null> | null = null;
let knownToken: string | null = null;

export const setApiAccessToken = (token: string | null) => {
  knownToken = token;
};
export const configureApiAuth = (
  sessionExpired: () => void,
  tokenRefreshed: (token: string) => void,
) => {
  onSessionExpired = sessionExpired;
  onTokenRefreshed = tokenRefreshed;
};
export const apiClient = axios.create({
  baseURL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = knownToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retried?: boolean })
      | undefined;
    const isRefresh = original?.url?.endsWith("/auth/refresh");
    if (
      error.response?.status === 401 &&
      original &&
      !original._retried &&
      !isRefresh
    ) {
      original._retried = true;
      try {
        refreshInFlight ??= axios
          .post<ApiResponse<{ accessToken: string }>>(
            `${baseURL}/auth/refresh`,
            {},
            { withCredentials: true },
          )
          .then((response) => response.data.data.accessToken)
          .catch(() => null)
          .finally(() => {
            refreshInFlight = null;
          });
        const token = await refreshInFlight;
        if (token) {
          setApiAccessToken(token);
          onTokenRefreshed(token);
          original.headers.Authorization = `Bearer ${token}`;
          return apiClient(original);
        }
      } catch {
        /* fall through to session expiry */
      }
      setApiAccessToken(null);
      onSessionExpired();
    }
    return Promise.reject(error);
  },
);

/** Removes "no filter" values before Axios creates a query string. Express-validator's
 * .optional() only skips absent fields, not `?year=` / `?departmentId=`. */
export const compactQueryParams = (params: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => {
      if (value === undefined || value === null || value === "") return false;
      return !(
        typeof value === "string" && value.trim().toLowerCase() === "all"
      );
    }),
  );

/** Branded CUI ORIC error handling — every message uses institutional language and no raw localhost URLs. */
export const getErrorMessage = (error: unknown) => {
  //if it's a plain Error (thrown from our validation), return its message directly instead of generic
  if (error instanceof Error && !(error as any).response) {
    const msg = error.message?.trim();
    if (msg && msg !== "Network Error") return msg;
  }

  const axiosError = error as AxiosError<ApiErrorBody>;
  const response = axiosError.response;
  const config = axiosError.config as { url?: string } | undefined;
  const url = config?.url || "";
  const raw = response?.data?.message || "";

  // Hide any localhost / internal URLs that might leak from backend
  const sanitizedRaw = raw
    .replace(/https?:\/\/localhost[^\s]*/gi, "")
    .replace(/http:\/\/[^\s]*/gi, (m) =>
      m.toLowerCase().includes("cui") ? m : "",
    )
    .trim();

  // login 401 should be invalid credentials, not session expired
  if (response?.status === 401) {
    if (url.includes("/auth/login")) {
      return "Invalid email or password. Please check your credentials and try again.";
    }
    // For verification, forgot password etc, give specific
    if (url.includes("/auth/verify"))
      return "Verification link is invalid or expired. Please request a new one.";
    return "Your CUI ORIC session has expired. Please sign in again.";
  }

  if (response?.status === 403)
    return "You do not have permission to perform this action. If this is unexpected, please contact the CUI ORIC administrator.";
  if (response?.status === 429)
    return "You are searching too quickly. CUI ORIC repository is protecting resources — please wait a moment and try again.";
  if (response?.status === 404)
    return "The requested record was not found in the CUI ORIC repository.";
  if (
    response?.status === 422 &&
    Array.isArray(response.data?.details) &&
    response.data.details.length
  ) {
    return response.data.details
      .map(({ field, message }) => `${field}: ${message}`)
      .join(" · ");
  }
  if (sanitizedRaw) return sanitizedRaw;
  if (response && response.status >= 500)
    return "CUI ORIC server is temporarily unavailable. Please try again in a moment.";
  return "Something went wrong in the CUI ORIC system. Please try again.";
};
export const applyServerFieldErrors = (
  error: unknown,
  setError: (field: string, value: { type: string; message: string }) => void,
) => {
  const response = (error as AxiosError<ApiErrorBody>).response;
  if (response?.status === 422 && Array.isArray(response.data?.details))
    response.data.details.forEach(({ field, message }) =>
      setError(field, { type: "server", message }),
    );
};
const unwrap = <T>(request: Promise<{ data: ApiResponse<T> }>) =>
  request.then((r) => r.data);
export const withPagination = <T>(result: ApiResponse<T[]>) => ({
  items: result.data,
  pagination: result.meta?.pagination as PaginationMeta | undefined,
});

export const authApi = {
  register: (body: {
    name: string;
    email: string;
    password: string;
    role: string;
    campus: string;
  }) => unwrap(apiClient.post("/auth/register", body)),
  login: (body: { email: string; password: string }) =>
    unwrap(apiClient.post("/auth/login", body)),
  refresh: () =>
    unwrap<{ accessToken: string }>(apiClient.post("/auth/refresh", {})).then(
      (response) => {
        setApiAccessToken(response.data.accessToken);
        onTokenRefreshed(response.data.accessToken);
        return response;
      },
    ),
  verifyEmail: (token: string) =>
    unwrap(apiClient.get(`/auth/verify-email/${token}`)),
  resendVerification: (email: string) =>
    unwrap(apiClient.post("/auth/resend-verification", { email })),
  forgotPassword: (email: string) =>
    unwrap(apiClient.post("/auth/forgot-password", { email })),
  resetPassword: (token: string, password: string) =>
    unwrap(apiClient.post("/auth/reset-password", { token, password })),
  me: () => unwrap<User>(apiClient.get("/auth/me")),
  updateMe: (body: { name?: string; campus?: string }) =>
    unwrap<User>(apiClient.patch("/auth/me", body)),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    unwrap(apiClient.patch("/auth/change-password", body)),
  logout: () =>
    unwrap(apiClient.post("/auth/logout")).finally(() => {
      setApiAccessToken(null);
    }),
};
export const publicationApi = {
  list: (params: Record<string, unknown>) =>
    unwrap<Publication[]>(apiClient.get("/publications", { params })).then(
      withPagination,
    ),
  get: (id: string) =>
    unwrap<Publication>(apiClient.get(`/publications/${id}`)),
  create: (body: unknown) =>
    unwrap<Publication>(apiClient.post("/publications", body)),
  update: (id: string, body: unknown) =>
    unwrap<Publication>(apiClient.patch(`/publications/${id}`, body)),
  submit: (id: string, remarks?: string) =>
    unwrap<Publication>(
      apiClient.post(`/publications/${id}/submit`, { remarks }),
    ),
  resubmit: (id: string, remarks?: string) =>
    unwrap<Publication>(
      apiClient.post(`/publications/${id}/resubmit`, { remarks }),
    ),
  hodReview: (
    id: string,
    body: { decision: "approved" | "rejected"; remarks: string },
  ) =>
    unwrap<Publication>(apiClient.post(`/publications/${id}/hod-review`, body)),
  oricReview: (
    id: string,
    body: { decision: "verified" | "rejected"; remarks: string },
  ) =>
    unwrap<Publication>(
      apiClient.post(`/publications/${id}/oric-review`, body),
    ),
  uploadPdf: (id: string, file: File) => {
    const form = new FormData();
    form.append("pdf", file);
    return unwrap<{ key: string; downloadUrl: string }>(
      apiClient.post(`/publications/${id}/upload-pdf`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      }),
    );
  },
  download: (id: string) =>
    unwrap<{ downloadUrl: string }>(
      apiClient.get(`/publications/${id}/download`),
    ),
  reviews: (id: string) =>
    unwrap<Review[]>(apiClient.get(`/publications/${id}/reviews`)),
  remove: (id: string) => unwrap(apiClient.delete(`/publications/${id}`)),
  updateMetadata: (id: string, body: unknown) =>
    unwrap<Publication>(apiClient.patch(`/publications/${id}/metadata`, body)),
  exportCsv: (params: Record<string, unknown>) =>
    apiClient.get("/publications/export", { params, responseType: "blob" }),
};
export const searchApi = {
  publications: (params: Record<string, unknown>) =>
    unwrap<Publication[]>(
      apiClient.get("/search/publications", {
        params: compactQueryParams(params),
      }),
    ).then(withPagination),
  suggestions: (q: string) =>
    unwrap<Record<string, unknown>>(
      apiClient.get("/search/suggestions", { params: { q, limit: 8 } }),
    ).catch(() => ({ data: {}, message: "", success: true as const })),
  filters: () =>
    unwrap<{
      years: { _id: number; count: number }[];
      types: { _id: string; count: number }[];
      departments: (Department & { count: number })[];
      interests: { tag: string; followerCount: number }[];
    }>(apiClient.get("/search/filters")),
  advanced: (body: Record<string, unknown>) => {
    const cleaned = compactQueryParams(body as Record<string, unknown>);
    return unwrap<Publication[]>(
      apiClient.post("/search/advanced", cleaned),
    ).then(withPagination);
  },
};
export const departmentApi = {
  list: (params: Record<string, unknown> = {}) =>
    unwrap<Department[]>(apiClient.get("/departments", { params })).then(
      withPagination,
    ),
  get: (id: string) => unwrap<Department>(apiClient.get(`/departments/${id}`)),
  create: (body: unknown) =>
    unwrap<Department>(apiClient.post("/admin/departments", body)),
  update: (id: string, body: unknown) =>
    unwrap<Department>(apiClient.patch(`/admin/departments/${id}`, body)),
  remove: (id: string) => unwrap(apiClient.delete(`/admin/departments/${id}`)),
  stats: (id: string) =>
    unwrap<Record<string, unknown>>(
      apiClient.get(`/admin/departments/${id}/stats`),
    ),
};
export const profileApi = {
  me: () => unwrap<AuthorProfile>(apiClient.get("/author-profile/me")),
  update: (body: unknown) =>
    unwrap<AuthorProfile>(apiClient.patch("/author-profile/me", body)),
  uploadPhoto: (file: File) => {
    const form = new FormData();
    form.append("photo", file);
    return unwrap<{ photoUrl: string }>(
      apiClient.post("/author-profile/me/photo", form, {
        headers: { "Content-Type": "multipart/form-data" },
      }),
    );
  },
  deletePhoto: () => unwrap(apiClient.delete("/author-profile/me/photo")),
  profile: (id: string) =>
    unwrap<AuthorProfile>(apiClient.get(`/author-profile/${id}`)),
  metrics: (id = "me") =>
    unwrap<Record<string, unknown>>(
      apiClient.get(`/author-profile/${id}/metrics-summary`),
    ),
  recomputeMetrics: (id = "me") =>
    unwrap<Record<string, unknown>>(
      apiClient.post(`/author-profile/${id}/recompute-metrics`),
    ),
  coAuthors: (id = "me") =>
    unwrap<unknown[]>(apiClient.get(`/author-profile/${id}/co-authors`)),
  network: (id = "me") =>
    unwrap<{ nodes: unknown[]; edges: unknown[] }>(
      apiClient.get(`/author-profile/${id}/network`),
    ),
};
export const adminApi = {
  pendingUsers: (params: Record<string, unknown>) =>
    unwrap<User[]>(apiClient.get("/admin/users/pending", { params })).then(
      withPagination,
    ),
  users: (params: Record<string, unknown>) =>
    unwrap<User[]>(apiClient.get("/admin/users", { params })).then(
      withPagination,
    ),
  approveUser: (id: string, body: { departmentId: string; role: string }) =>
    unwrap(apiClient.patch(`/admin/users/${id}/approve`, body)),
  rejectUser: (id: string, remarks?: string) =>
    unwrap(apiClient.patch(`/admin/users/${id}/reject`, { remarks })),
  updateUser: (id: string, body: unknown) =>
    unwrap<User>(apiClient.patch(`/admin/users/${id}`, body)),
  removeUser: (id: string) => unwrap(apiClient.delete(`/admin/users/${id}`)),
  assignHod: (departmentId: string, userId: string) =>
    unwrap<Department>(
      apiClient.patch(`/admin/users/departments/${departmentId}/assign-hod`, {
        userId,
      }),
    ),
};
export const analyticsApi = {
  institution: () => unwrap<Dashboard>(apiClient.get("/analytics/institution")),
  department: () =>
    unwrap<Dashboard | null>(apiClient.get("/analytics/department")),
  hodQueue: (params: Record<string, unknown>) =>
    unwrap<Publication[]>(
      apiClient.get("/analytics/moderation/stage1", { params }),
    ).then(withPagination),
  oricQueue: (params: Record<string, unknown>) =>
    unwrap<Publication[]>(
      apiClient.get("/analytics/moderation/stage2", { params }),
    ).then(withPagination),
  interests: () =>
    unwrap<unknown[]>(apiClient.get("/analytics/research-interests")),
  collaborations: (params: Record<string, unknown> = {}) =>
    unwrap<unknown[]>(apiClient.get("/analytics/collaborations", { params })),
};
export const citationApi = {
  graph: (id: string) =>
    unwrap<unknown>(apiClient.get(`/publications/${id}/citations`)),
  incoming: (id: string, params: Record<string, unknown>) =>
    unwrap<unknown[]>(
      apiClient.get(`/publications/${id}/citations/incoming`, { params }),
    ).then(withPagination),
  outgoing: (id: string, params: Record<string, unknown>) =>
    unwrap<unknown[]>(
      apiClient.get(`/publications/${id}/citations/outgoing`, { params }),
    ).then(withPagination),
  top: (params: Record<string, unknown> = {}) =>
    unwrap<Publication[]>(apiClient.get("/citations/top", { params })),
};