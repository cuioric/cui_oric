export type Role =
  | "oric_admin"
  | "hod"
  | "faculty"
  | "ms_student"
  | "phd_student";
export type UserStatus =
  | "pending_email_verification"
  | "pending_oric_approval"
  | "active"
  | "suspended"
  | "alumni";
export type PublicationStatus =
  | "draft"
  | "submitted_to_hod"
  | "hod_rejected"
  | "sent_to_oric"
  | "oric_verified"
  | "oric_rejected";
export type PublicationType =
  | "journal_article"
  | "conference_paper"
  | "book"
  | "book_chapter"
  | "thesis"
  | "preprint"
  | "patent";

export interface ApiResponse<T> {
  success: true;
  message: string;
  data: T;
  meta?: { pagination?: PaginationMeta };
}
export interface ApiErrorBody {
  success: false;
  message: string;
  code?: string;
  details?: { field: string; message: string; value?: unknown }[];
}
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext?: boolean;
  hasPrev?: boolean;
}
export interface User {
  id?: string;
  _id?: string;
  name: string;
  email: string;
  role: Role;
  departmentId?: string | Department | null;
  campus: string;
  status: UserStatus;
  createdAt?: string;
  lastLoginAt?: string;
}
export interface Department {
  _id: string;
  name: string;
  campus: string;
  hodId?: Pick<User, "_id" | "name" | "email"> | string | null;
  facultyCount?: number;
}
export interface Author {
  authorId?: Pick<User, "_id" | "name" | "email"> | string | null;
  externalName?: string;
  order: number;
  isCorresponding?: boolean;
}
export interface Venue {
  name: string;
  type: "journal" | "conference" | "book_publisher";
  volume?: string;
  issue?: string;
  pages?: string;
  impactFactor?: number | null;
}
export interface Publication {
  _id: string;
  title: string;
  abstract?: string;
  publicationType: PublicationType;
  authors: Author[];
  venue: Venue;
  year: number;
  publicationDate?: string;
  doi?: string;
  url?: string;
  pdfFile?: string | null;
  citationCount: number;
  keywords: string[];
  status: PublicationStatus;
  submittedBy: Pick<User, "_id" | "name" | "email"> | string;
  departmentId: Pick<Department, "_id" | "name" | "campus"> | string;
  createdBy?: Pick<User, "_id" | "name" | "email"> | string;
  lastRemarks?: string;
  createdAt: string;
  updatedAt?: string;
  aiReview?: {
    virusScanStatus?: string;
    readabilityScore?: number | null;
    plagiarismScore?: number | null;
    grammarIssuesCount?: number | null;
    passiveVoicePercentage?: number | null;
    checkedAt?: string | null;
  };
  reviews?: Review[];
  qualitativeSuggestions?: unknown;
}
export interface Review {
  _id: string;
  stage: "hod_review" | "oric_review";
  reviewedBy: Pick<User, "_id" | "name" | "email" | "role"> | string;
  decision: "submitted" | "approved" | "rejected" | "returned_for_correction";
  remarks: string;
  previousStatus: PublicationStatus;
  newStatus: PublicationStatus;
  reviewedAt: string;
}
export interface AuthorProfile {
  _id: string;
  userId: User;
  departmentId: Department;
  photoUrl?: string;
  designation?: string;
  affiliation?: string;
  researchInterests?: string[];
  homepageUrl?: string;
  orcidId?: string;
  googleScholarId?: string;
  metrics?: Metrics;
  coAuthors?: { authorId: string; sharedPublications: number }[];
}
export interface Metrics {
  totalCitations: number;
  hIndex: number;
  i10Index: number;
  citationsSince5Years: number;
  hIndexSince5Years: number;
  i10IndexSince5Years: number;
  lastCalculatedAt?: string | null;
}
export interface Dashboard {
  overview: Record<string, number>;
  usersByRole?: { _id: string; count: number }[];
  publicationsByStatus?: { _id: string; count: number }[];
  publicationsByYear?: { _id: number; count: number; citations?: number }[];
  publicationsByType?: { _id: string; count: number }[];
  publicationsByDepartment?: {
    _id?: string;
    department?: string;
    campus?: string;
    count: number;
    citations?: number;
  }[];
  recentActivity?: Publication[];
  reviewWorkload?: { pendingHodReviews: number; pendingOricReviews: number };
  topAuthors?: AuthorProfile[];
  aiReviewStats?: {
    _id?: string;
    count: number;
    avgReadability?: number;
    avgGrammarIssues?: number;
    avgPassiveVoice?: number;
  }[];
  citationStats?: {
    totalLinks?: number;
    externalCitations?: number;
    internalCitations?: number;
  };
  department?: Department;
}
