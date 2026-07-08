// ============================================================================
// API Service Layer
// ----------------------------------------------------------------------------
// The UI talks ONLY to this module. Today it hits our own mock FastAPI-style
// routes (`/api/*`) backed by Lovable Cloud. Tomorrow, point the same
// functions at the real Python FastAPI backend by changing `API_BASE` (via
// `VITE_API_BASE_URL`) and, if the real endpoints already return the shapes
// declared below, the frontend requires no other changes.
//
// Contract:
//   POST   /api/process              -> ProcessResponse
//   GET    /api/reports              -> Report[]
//   GET    /api/reports/:id          -> Report
//   GET    /api/reports/:id/pdf      -> application/pdf (or JSON fallback)
// ============================================================================

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

function url(path: string) {
  return `${API_BASE}${path}`;
}

// ---------- Types ----------

export type IntakePayload = {
  patient_name: string;
  dob?: string;
  sex?: string;
  clinician?: string;
  input_text: string;
};

export type AgentStage = {
  name: "Intake Agent" | "Normalisation Agent" | "PDF Report Agent";
  status: "pending" | "running" | "complete" | "error";
  detail?: string;
  duration_ms?: number;
};

export type StructuredReport = {
  patient_summary: string;
  key_findings: string[];
  risk_indicators: string[];
  recommendations: string[];
  follow_up_actions: string[];
  clinical_terms: string[];
  /**
   * SOCRATES pain/symptom assessment. Any field may be null if the
   * intake text did not describe it.
   */
  socrates: {
    site: string | null;
    onset: string | null;
    character: string | null;
    radiation: string | null;
    associations: string | null;
    time_course: string | null;
    exacerbating_relieving: string | null;
    severity: string | null;
  };
  generated_at: string;
  patient: {
    name: string;
    dob?: string;
    sex?: string;
    clinician?: string;
  };
};

export type Report = {
  id: string;
  patient_id: string;
  status: "pending" | "processing" | "complete" | "error";
  structured_data: StructuredReport | null;
  pdf_url: string | null;
  created_at: string;
};

export type ProcessResponse = {
  job_id: string;
  status: "complete" | "error";
  stages: AgentStage[];
  report_id: string;
};

// ---------- Helpers ----------

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status);
  }
  return (await res.json()) as T;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// ---------- Public API ----------

/**
 * Kick off the three-agent pipeline. Today this call resolves once the mock
 * pipeline completes; the real FastAPI backend may return early with a
 * `job_id` — the service consumer should be ready for both by reading
 * `status` and, when needed, polling `getReport(report_id)`.
 */
export function processPatientIntake(payload: IntakePayload): Promise<ProcessResponse> {
  return request<ProcessResponse>("/api/process", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getReport(reportId: string): Promise<Report> {
  return request<Report>(`/api/reports/${encodeURIComponent(reportId)}`);
}

export function getReports(limit = 50): Promise<Report[]> {
  return request<Report[]>(`/api/reports?limit=${limit}`);
}

/**
 * Trigger a PDF download in the browser. Today the mock backend serves a
 * PDF rendered from the structured report; when the real FastAPI backend is
 * connected the same URL streams the fpdf2 output — no UI change required.
 */
export function downloadReport(reportId: string): void {
  const href = url(`/api/reports/${encodeURIComponent(reportId)}/pdf`);
  // Use a hidden anchor so the browser respects the Content-Disposition header.
  const a = document.createElement("a");
  a.href = href;
  a.rel = "noopener";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function deleteReport(reportId: string): Promise<void> {
  return request<void>(`/api/reports/${encodeURIComponent(reportId)}`, {
    method: "DELETE",
  });
}