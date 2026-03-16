import { queryClient } from "./queryClient";
import type { Project, InsertProject, Booking, InsertBooking, Inquiry, InsertInquiry } from "@shared/schema";

async function apiRequest(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message || "Request failed");
  }
  return res.json();
}

export const projectsApi = {
  getAll: (): Promise<Project[]> => apiRequest("/api/projects"),
  getOne: (id: string): Promise<Project> => apiRequest(`/api/projects/${id}`),
  create: (data: InsertProject): Promise<Project> =>
    apiRequest("/api/projects", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<InsertProject>): Promise<Project> =>
    apiRequest(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string): Promise<void> =>
    apiRequest(`/api/projects/${id}`, { method: "DELETE" }),
};

export const bookingsApi = {
  getAll: (): Promise<Booking[]> => apiRequest("/api/bookings"),
  create: (data: InsertBooking): Promise<Booking> =>
    apiRequest("/api/bookings", { method: "POST", body: JSON.stringify(data) }),
};

export const inquiriesApi = {
  getAll: (): Promise<Inquiry[]> => apiRequest("/api/inquiries"),
  create: (data: InsertInquiry): Promise<Inquiry> =>
    apiRequest("/api/inquiries", { method: "POST", body: JSON.stringify(data) }),
};