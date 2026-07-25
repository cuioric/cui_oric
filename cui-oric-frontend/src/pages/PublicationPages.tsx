import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Download,
  FilePenLine,
  FileUp,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { z } from "zod";
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  Pagination,
  StatusBadge,
  displayName,
  objectId,
} from "../components/Common";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  PdfNotice,
  PublicationCard,
  PublicationStatusPath,
  ReviewTimeline,
} from "../components/PublicationComponents";
import { useAuth } from "../contexts/AuthContext";
import {
  applyServerFieldErrors,
  citationApi,
  getErrorMessage,
  publicationApi,
} from "../lib/api";
import type { Publication, PublicationStatus, PublicationType } from "../types";

const statuses: { value: PublicationStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "submitted_to_hod", label: "With HOD" },
  { value: "hod_rejected", label: "HOD returned" },
  { value: "sent_to_oric", label: "With ORIC" },
  { value: "oric_rejected", label: "ORIC returned" },
  { value: "oric_verified", label: "Verified" },
];

const draftVisibleRoles = ["faculty", "ms_student", "phd_student"] as const;

function canSeeDrafts(role?: string) {
  return draftVisibleRoles.includes(role as (typeof draftVisibleRoles)[number]);
}

export function PublicationsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") || 1);
  const visibleStatuses = canSeeDrafts(user?.role)
    ? statuses
    : statuses.filter((status) => status.value !== "draft");
  const active = (params.get("status") || "all") as PublicationStatus | "all";
  const selectedStatus =
    !canSeeDrafts(user?.role) && active === "draft" ? "all" : active;
  const search = params.get("search") || "";

  useEffect(() => {
    if (!canSeeDrafts(user?.role) && active === "draft") {
      const next = new URLSearchParams(params);
      next.delete("status");
      setParams(next, { replace: true });
    }
  }, [active, params, setParams, user?.role]);

  const query = useQuery({
    queryKey: ["publications", { page, active: selectedStatus, search }],
    queryFn: () =>
      publicationApi.list({
        page,
        limit: 12,
        ...(selectedStatus !== "all" ? { status: selectedStatus } : {}),
        ...(search ? { search } : {}),
      }),
    placeholderData: (prev) => prev,
  });

  const update = (values: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    if (!("page" in values)) next.set("page", "1");
    setParams(next);
  };

  return (
    <div className="page-shell">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="page-title">
            {user?.role === "oric_admin"
              ? "All publications"
              : user?.role === "hod"
                ? "Department publications"
                : "My publications"}
          </h1>
          <p className="page-subtitle">
            {user?.role === "oric_admin"
              ? "Publications move through department and ORIC review here. Drafts remain private to their authors until submitted."
              : user?.role === "hod"
                ? "Publications move through department and ORIC review here. Drafts remain private to their authors until submitted."
                : "Manage drafts and follow each publication through review."}
          </p>
        </div>
        {["faculty", "ms_student", "phd_student"].includes(
          user?.role || "",
        ) && (
          <Link to="/publications/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New publication
          </Link>
        )}
      </div>

      <div className="mt-6 panel overflow-hidden">
        <div className="border-b p-4">
          <input
            value={search}
            onChange={(e) => update({ search: e.target.value })}
            className="field"
            placeholder="Search your publications"
            aria-label="Search publications"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto border-b px-4 py-3">
          {visibleStatuses.map((item) => (
            <button
              key={item.value}
              onClick={() =>
                update({ status: item.value === "all" ? "" : item.value })
              }
              className={`min-h-10 shrink-0 rounded-md px-3 text-sm font-semibold ${selectedStatus === item.value ? "bg-brand-700 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {query.isLoading ? (
          <LoadingBlock />
        ) : query.isError ? (
          <div className="p-4">
            <ErrorBlock message={getErrorMessage(query.error)} />
          </div>
        ) : !query.data?.items.length ? (
          <EmptyBlock
            title="No matching publications"
            text="Your drafts and review activity will appear here."
          />
        ) : (
          <>
            <div className="grid gap-4 p-4 lg:grid-cols-2">
              {query.data.items.map((publication) => (
                <PublicationCard
                  key={publication._id}
                  publication={publication}
                  showDepartment
                />
              ))}
            </div>
            <Pagination
              meta={query.data.pagination}
              onPageChange={(next) => update({ page: String(next) })}
            />
          </>
        )}
      </div>
    </div>
  );
}

function RemarksAction({
  title,
  submit,
  approveLabel,
  rejectLabel,
}: {
  title: string;
  submit: (decision: string, remarks: string) => Promise<void>;
  approveLabel: string;
  rejectLabel: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ remarks: string }>();

  const action = (decision: string) =>
    handleSubmit(
      async ({ remarks }) => {
        if (!remarks || !remarks.trim()) {
          throw new Error("Please enter your remarks before proceeding.");
        }
        if (remarks.trim().length < 10) {
          throw new Error(
            "Remarks must be at least 10 characters — provide constructive feedback.",
          );
        }
        await submit(decision, remarks);
      },
      () => {
        // handleSubmit onInvalid already sets errors, but we want specific toast for empty
      },
    )();

  return (
    <div className="panel panel-pad">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">
        Remarks are required and will appear in the publication audit trail.
      </p>
      <label className="label mt-4">Review remarks *</label>
      <textarea
        className="field min-h-28"
        placeholder="Provide clear, constructive feedback for the author... (min 10 chars)"
        {...register("remarks", {
          required: "Please enter your remarks before proceeding.",
          minLength: {
            value: 10,
            message:
              "Remarks must be at least 10 characters — provide constructive feedback.",
          },
          maxLength: {
            value: 1000,
            message: "Remarks cannot exceed 1000 characters",
          },
        })}
      />
      <p className="error">{errors.remarks?.message}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          className="btn-primary"
          disabled={isSubmitting}
          onClick={() => action("approved")}
        >
          {isSubmitting ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : null}
          {approveLabel}
        </button>
        <button
          type="button"
          className="btn-danger"
          disabled={isSubmitting}
          onClick={() => action("rejected")}
        >
          {rejectLabel}
        </button>
      </div>
    </div>
  );
}

// Helper to safely extract title handling multiple possible backend shapes
function extractTitle(pub: any): string {
  if (!pub) return "";
  return (
    pub.title || pub.name || pub.publicationTitle || pub?.metadata?.title || ""
  );
}
function extractVenueName(pub: Publication | any): string {
  if (!pub?.venue) return "";
  if (typeof pub.venue === "string") return pub.venue;
  return pub.venue.name || (pub.venue as any).title || "";
}
function extractYear(pub: any): string {
  return String(
    pub?.year || pub?.publicationYear || pub?.createdAt?.slice(0, 4) || "",
  );
}

function extractVenueLabel(paper: any): string {
  const venue = paper?.venue;
  if (!venue) return "Unknown venue";
  if (typeof venue === "string") return venue;
  return venue.name || venue.title || "Unknown venue";
}

function CitationPaperRow({
  paper,
  isInternal,
}: {
  paper: any;
  isInternal?: boolean;
}) {
  const title = paper?.title || "Untitled paper";
  const year = paper?.year || "—";
  const venue = extractVenueLabel(paper);

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="text-sm font-semibold text-slate-900">
        {isInternal && paper?._id ? (
          <Link
            to={`/publications/${paper._id}`}
            className="hover:text-brand-700 hover:underline"
          >
            {title}
          </Link>
        ) : (
          <span>{title}</span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {year} · {venue}
      </p>
    </li>
  );
}

export function PublicationDetailPage() {
  const { id = "" } = useParams();
  const { user, initializing } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const detail = useQuery({
    queryKey: ["publication", id],
    queryFn: () => publicationApi.get(id),
    enabled: !!id,
    retry: false,
  });

  const citations = useQuery({
    queryKey: ["citations", id],
    queryFn: () => citationApi.graph(id),
    enabled: !!user && !!id && detail.isSuccess,
  });

  const invalidate = () =>
    client.invalidateQueries({ queryKey: ["publication", id] });

  if (initializing)
    return (
      <div className="page-shell">
        <LoadingBlock label="Restoring your secure session…" />
      </div>
    );
  if (detail.isLoading)
    return (
      <div className="page-shell">
        <LoadingBlock label="Loading publication…" />
      </div>
    );
  if (detail.isError || !detail.data?.data) {
    return (
      <div className="page-shell">
        <div className="mb-4">
          <Link to={user ? "/publications" : "/"} className="btn-secondary">
            Back to {user ? "publications" : "home"}
          </Link>
        </div>
        <ErrorBlock
          message={
            getErrorMessage(detail.error) ||
            "Publication not found or you do not have access. It may not be verified yet."
          }
        />
      </div>
    );
  }

  const publication = detail.data.data as Publication;
  if (!publication) {
    return (
      <div className="page-shell">
        <ErrorBlock message="Publication data is missing. Please try again." />
      </div>
    );
  }

  const isPublicView = !user;
  const isOwner = (() => {
    try {
      const subId = objectId(publication.submittedBy);
      const uid = user ? user.id || user._id || "" : "";
      return subId && uid && subId === uid;
    } catch {
      return false;
    }
  })();

  const canEdit =
    publication.status === "draft" && (isOwner || user?.role === "oric_admin");
  const canHodReview =
    (user?.role === "hod" || user?.role === "oric_admin") &&
    publication.status === "submitted_to_hod";
  const canOricReview =
    user?.role === "oric_admin" && publication.status === "sent_to_oric";

  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setLocalError("");
    try {
      await operation();
      await invalidate();
    } catch (e) {
      const msg = getErrorMessage(e);
      setLocalError(msg);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("message", msg);
        return next;
      });
    } finally {
      setBusy(false);
    }
  };

  const message = searchParams.get("message") || localError;

  // Fix #2: robust extraction to avoid Untitled for all
  const rawTitle = extractTitle(publication);
  const displayTitle = rawTitle || "Untitled publication";
  const venueName = extractVenueName(publication) || "Unknown venue";
  const venueType = (publication.venue as any)?.type || "journal";
  const yearText = extractYear(publication) || "—";
  const pubTypeText =
    (publication.publicationType || "").replaceAll("_", " ") || "Publication";

  const sortedAuthors = (() => {
    try {
      return [...(publication.authors || [])].sort(
        (a, b) => (a.order || 0) - (b.order || 0),
      );
    } catch {
      return publication.authors || [];
    }
  })();

  const citationData = citations.data?.data as
    | {
        paper?: {
          _id: string;
          title?: string;
          year?: number;
          authors?: unknown[];
          venue?: unknown;
        };
        incoming?: Array<{
          citationId: string;
          paper: any;
          isInternal?: boolean;
          addedAt?: string;
        }>;
        outgoing?: Array<{
          citationId: string;
          paper: any;
          isInternal?: boolean;
          addedAt?: string;
        }>;
      }
    | undefined;
  const incoming = citationData?.incoming || [];
  const outgoing = citationData?.outgoing || [];
  const hasCitationLinks = incoming.length > 0 || outgoing.length > 0;

  return (
    <div className="page-shell">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {!isPublicView && (
            <div className="mb-3">
              <StatusBadge status={publication.status || "draft"} />
            </div>
          )}
          <h1 className="page-title max-w-4xl break-words">{displayTitle}</h1>
          <p className="page-subtitle">
            {pubTypeText} · {venueName} · {yearText}
          </p>
          {isPublicView && (
            <p className="mt-2 text-xs text-brand-700 font-semibold">
              CUI ORIC — Public verified record
            </p>
          )}
        </div>
        <Link
          to={user ? "/publications" : "/"}
          className="btn-secondary shrink-0"
        >
          Back
        </Link>
      </div>

      {message && (
        <div className="mt-5">
          <ErrorBlock message={message} />
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {(!isPublicView || publication.pdfFile) && (
            <section className="panel panel-pad">
              {!isPublicView && (
                <PublicationStatusPath status={publication.status} />
              )}
              {!isPublicView && (
                <div className="mt-6">
                  <PdfNotice hasPdf={!!publication.pdfFile} />
                </div>
              )}

              {/* Public view: do NOT show lastRemarks from internal review */}
              {!isPublicView && publication.lastRemarks && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
                    Latest remarks
                  </p>
                  <p className="mt-1 text-sm text-amber-950">
                    {publication.lastRemarks}
                  </p>
                </div>
              )}

              {isOwner &&
                (publication.status === "draft" ||
                  publication.status === "hod_rejected" ||
                  publication.status === "oric_rejected") && (
                  <div className="mt-5">
                    <PdfUploader publication={publication} />
                  </div>
                )}

              <div className="mt-5 flex flex-wrap gap-2">
                {canEdit && (
                  <Link
                    to={`/publications/${id}/edit`}
                    className="btn-secondary"
                  >
                    <FilePenLine className="h-4 w-4" />
                    Edit draft
                  </Link>
                )}
                {isOwner &&
                  ["hod_rejected", "oric_rejected"].includes(
                    publication.status,
                  ) && (
                    <button
                      className="btn-primary"
                      disabled={busy}
                      onClick={() => run(() => publicationApi.resubmit(id))}
                    >
                      {busy && (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      )}
                      Return to draft
                    </button>
                  )}
                {isOwner && publication.status === "draft" && (
                  <button
                    className="btn-primary"
                    disabled={busy || !publication.pdfFile}
                    title={
                      !publication.pdfFile
                        ? "Upload a PDF before submitting"
                        : undefined
                    }
                    onClick={() => run(() => publicationApi.submit(id))}
                  >
                    {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
                    Submit to HOD
                  </button>
                )}
                {publication.pdfFile && (
                  <button
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const response = await publicationApi.download(id);
                        const url = response.data.downloadUrl;
                        if (url)
                          window.open(url, "_blank", "noopener,noreferrer");
                        else throw new Error("Download URL missing");
                      })
                    }
                  >
                    <Download className="h-4 w-4" />
                    Download PDF
                  </button>
                )}
                {user?.role === "oric_admin" && (
                  <button
                    className="btn-danger"
                    disabled={busy}
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                )}
              </div>

              {isOwner &&
                publication.status === "draft" &&
                !publication.pdfFile && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-amber-800">
                    <AlertTriangle className="h-4 w-4" />
                    Upload a PDF before submitting this draft.
                  </p>
                )}
            </section>
          )}

          {/*public should NOT see review actions/history - only details with pdf */}
          {!isPublicView && canHodReview && (
            <RemarksAction
              title="HOD review"
              approveLabel="Approve & send to ORIC"
              rejectLabel="Return to author"
              submit={async (decision, remarks) => {
                await publicationApi.hodReview(id, {
                  decision: decision as "approved" | "rejected",
                  remarks,
                });
                await invalidate();
              }}
            />
          )}
          {!isPublicView && canOricReview && (
            <RemarksAction
              title="ORIC review"
              approveLabel="Verify publication"
              rejectLabel="Return to author"
              submit={async (decision, remarks) => {
                await publicationApi.oricReview(id, {
                  decision: decision === "approved" ? "verified" : "rejected",
                  remarks,
                });
                await invalidate();
              }}
            />
          )}

          <section className="panel panel-pad">
            <h2 className="font-serif text-xl font-bold text-slate-900">
              Abstract
            </h2>
            <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-700">
              {publication.abstract || "No abstract provided."}
            </p>

            <h2 className="mt-7 font-serif text-xl font-bold text-slate-900">
              Publication details
            </h2>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-slate-500">DOI</dt>
                <dd className="mt-1 break-all text-slate-800">
                  {publication.doi || "—"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Citation count</dt>
                <dd className="mt-1 text-slate-800">
                  {publication.citationCount || 0}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Venue</dt>
                <dd className="mt-1 text-slate-800">
                  {venueName} ({venueType})
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Keywords</dt>
                <dd className="mt-1 text-slate-800">
                  {publication.keywords?.join(", ") || "—"}
                </dd>
              </div>
              {(publication.venue as any)?.volume && (
                <div>
                  <dt className="font-semibold text-slate-500">Volume</dt>
                  <dd className="mt-1 text-slate-800">
                    {(publication.venue as any).volume}
                  </dd>
                </div>
              )}
              {(publication.venue as any)?.issue && (
                <div>
                  <dt className="font-semibold text-slate-500">Issue</dt>
                  <dd className="mt-1 text-slate-800">
                    {(publication.venue as any).issue}
                  </dd>
                </div>
              )}
              {(publication.venue as any)?.pages && (
                <div>
                  <dt className="font-semibold text-slate-500">Pages</dt>
                  <dd className="mt-1 text-slate-800">
                    {(publication.venue as any).pages}
                  </dd>
                </div>
              )}
            </dl>
            {publication.url && (
              <a
                className="mt-4 inline-block text-sm font-semibold text-brand-700 hover:underline"
                href={publication.url}
                target="_blank"
                rel="noreferrer"
              >
                View publication URL
              </a>
            )}
          </section>

          {!isPublicView && user && (
            <section className="panel panel-pad">
              <h2 className="font-serif text-xl font-bold text-slate-900">
                Citation network
              </h2>
              {citations.isLoading ? (
                <LoadingBlock label="Loading citation network…" />
              ) : citations.isError ? (
                <p className="mt-3 text-sm text-slate-500">
                  Citation network is unavailable.
                </p>
              ) : !hasCitationLinks ? (
                <div className="mt-4">
                  <EmptyBlock
                    title="No citation links recorded yet"
                    text="Incoming and outgoing citation links will appear here once they are recorded."
                  />
                </div>
              ) : (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <section className="panel panel-pad">
                    <h3 className="font-serif text-lg font-bold text-slate-900">
                      Cited by ({incoming.length})
                    </h3>
                    <ul className="mt-4 space-y-3">
                      {incoming.map((item) => (
                        <CitationPaperRow
                          key={item.citationId}
                          paper={item.paper}
                          isInternal={item.isInternal}
                        />
                      ))}
                    </ul>
                  </section>
                  <section className="panel panel-pad">
                    <h3 className="font-serif text-lg font-bold text-slate-900">
                      References ({outgoing.length})
                    </h3>
                    <ul className="mt-4 space-y-3">
                      {outgoing.map((item) => (
                        <CitationPaperRow
                          key={item.citationId}
                          paper={item.paper}
                          isInternal={item.isInternal}
                        />
                      ))}
                    </ul>
                  </section>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="panel panel-pad">
            <h2 className="font-serif text-lg font-bold text-slate-900">
              Authors
            </h2>
            <ol className="mt-4 space-y-3">
              {sortedAuthors.map((author) => (
                <li
                  key={`${author.order}-${author.externalName || objectId(author.authorId)}`}
                  className="flex gap-3"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                    {author.order || "?"}
                  </span>
                  <span className="text-sm text-slate-700">
                    {author.externalName ||
                      displayName(author.authorId) ||
                      "Unknown author"}{" "}
                    {author.isCorresponding && (
                      <span className="text-xs text-slate-500">
                        (corresponding)
                      </span>
                    )}
                  </span>
                </li>
              ))}
              {sortedAuthors.length === 0 && (
                <p className="text-sm text-slate-500">No authors listed.</p>
              )}
            </ol>
          </section>

          {/* {hide review history for public */}
          {!isPublicView && (
            <section className="panel panel-pad">
              <h2 className="font-serif text-lg font-bold text-slate-900">
                Review history
              </h2>
              <div className="mt-5">
                <ReviewTimeline reviews={publication.reviews} />
              </div>
            </section>
          )}

          {isPublicView && (
            <section className="panel panel-pad bg-brand-50 border-brand-200">
              <h2 className="font-serif text-lg font-bold text-brand-900">
                ORIC-Verified Record
              </h2>
              <p className="mt-2 text-sm text-brand-800">
                This publication has been reviewed and verified by ORIC. Sign in
                with an institutional account for additional details.
              </p>
            </section>
          )}
        </aside>
      </div>

      {/* Stylish branded delete*/}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete publication?"
        message="This publication will be permanently deleted from the CUI ORIC repository. This action cannot be undone and will remove all associated reviews."
        confirmLabel="Delete permanently"
        cancelLabel="Cancel"
        variant="danger"
        loading={busy}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          run(async () => {
            await publicationApi.remove(id);
            navigate("/publications");
          });
        }}
      />
    </div>
  );
}

const types: PublicationType[] = [
  "journal_article",
  "conference_paper",
  "book",
  "book_chapter",
  "thesis",
  "preprint",
  "patent",
];

const formSchema = z.object({
  title: z
    .string()
    .min(5, "Title must be at least 5 characters")
    .max(500, "Title must be at most 500 characters"),
  abstract: z
    .string()
    .min(20, "Abstract must be at least 20 characters")
    .max(5000, "Abstract cannot exceed 5000 characters"),
  publicationType: z.enum(types as [PublicationType, ...PublicationType[]]),
  year: z.coerce
    .number()
    .int()
    .min(1900, "Year must be after 1900")
    .max(new Date().getFullYear() + 1, "Year cannot be in distant future"),
  publicationDate: z.string().optional(),
  doi: z
    .string()
    .optional()
    .refine((val) => !val || /^10\.\d{4,9}\/[-._;()/:A-Z0-9a-z]+$/.test(val), {
      message: "Enter a valid DOI e.g. 10.1234/example.doi",
    }),
  url: z
    .string()
    .url("Enter a valid URL https://...")
    .or(z.literal(""))
    .optional(),
  keywordsText: z.string().max(300, "Keywords too long").optional(),
  venue: z.object({
    name: z
      .string()
      .min(2, "Venue name is required")
      .max(200, "Venue name too long"),
    type: z.enum(["journal", "conference", "book_publisher"]),
    volume: z
      .string()
      .max(20, "Volume too long")
      .regex(/^[a-zA-Z0-9-]*$/, "Volume must be alphanumeric")
      .optional()
      .or(z.literal("")),
    issue: z
      .string()
      .max(20, "Issue too long")
      .regex(/^[a-zA-Z0-9-]*$/, "Issue must be alphanumeric")
      .optional()
      .or(z.literal("")),
    pages: z
      .string()
      .max(50, "Pages too long")
      .regex(
        /^[0-9,\-\s]*$/,
        "Pages must be numbers, hyphen or comma only, e.g. 12-20 or 1, 2, 3",
      )
      .optional()
      .or(z.literal("")),
    impactFactor: z
      .string()
      .optional()
      .refine(
        (val) =>
          !val ||
          (!isNaN(Number(val)) && Number(val) >= 0 && Number(val) <= 100),
        { message: "Impact factor must be a number between 0 and 100" },
      )
      .or(z.literal("")),
  }),
  authors: z
    .array(
      z.object({
        externalName: z
          .string()
          .min(2, "Author name must be at least 2 characters")
          .max(100)
          .regex(
            /^[A-Za-z\s.'-]+$/,
            "Author name can only contain letters, spaces, dots and hyphens",
          ),
        isCorresponding: z.boolean().optional(),
      }),
    )
    .max(20, "Too many authors"),
});

type FormValues = z.infer<typeof formSchema>;

const emptyForm: FormValues = {
  title: "",
  abstract: "",
  publicationType: "journal_article",
  year: new Date().getFullYear(),
  publicationDate: "",
  doi: "",
  url: "",
  keywordsText: "",
  venue: {
    name: "",
    type: "journal",
    volume: "",
    issue: "",
    pages: "",
    impactFactor: "",
  },
  authors: [],
};

const toForm = (publication?: Publication): FormValues => {
  if (!publication) return emptyForm;
  return {
    title: (publication as any).title || "",
    abstract: (publication as any).abstract || "",
    publicationType: publication.publicationType || "journal_article",
    year: publication.year || new Date().getFullYear(),
    publicationDate: publication.publicationDate?.slice(0, 10) || "",
    doi: publication.doi || "",
    url: publication.url || "",
    keywordsText: publication.keywords?.join(", ") || "",
    venue: {
      name: (publication.venue as any)?.name || "",
      type: (publication.venue as any)?.type || "journal",
      volume: (publication.venue as any)?.volume || "",
      issue: (publication.venue as any)?.issue || "",
      pages: (publication.venue as any)?.pages || "",
      impactFactor: (publication.venue as any)?.impactFactor?.toString() || "",
    },
    authors:
      publication.authors
        ?.filter((a) => !!a.externalName)
        .map((a) => ({
          externalName: a.externalName || "",
          isCorresponding: !!a.isCorresponding,
        })) || [],
  };
};

export function PdfUploader({ publication }: { publication: Publication }) {
  const client = useQueryClient();
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: (file: File) => publicationApi.uploadPdf(publication._id, file),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["publication", publication._id] }),
  });

  return (
    <section className="rounded-lg border border-dashed border-brand-200 bg-brand-50 p-4">
      <div className="flex items-start gap-3">
        <FileUp className="mt-0.5 h-5 w-5 text-brand-700" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-slate-900">Publication PDF</h3>
          <p className="mt-1 text-sm text-slate-600">
            PDF only, up to 20 MB. The server verifies the file before it is
            stored.
          </p>
          <input
            id={`pdf-upload-${publication._id}`}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              setError("");
              if (!file) return;
              if (
                file.type !== "application/pdf" ||
                !file.name.toLowerCase().endsWith(".pdf")
              ) {
                setError("Choose a PDF file.");
                return;
              }
              if (file.size > 20 * 1024 * 1024) {
                setError("The PDF must be 20 MB or smaller.");
                return;
              }
              mutation.mutate(file, {
                onError: (e) => setError(getErrorMessage(e)),
              });
            }}
          />
          <label
            htmlFor={`pdf-upload-${publication._id}`}
            className="btn-primary mt-3 cursor-pointer"
          >
            {mutation.isPending ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <FileUp className="h-4 w-4" />
                {publication.pdfFile ? "Replace PDF" : "Upload PDF"}
              </>
            )}
          </label>
          {error && <p className="error mt-2">{error}</p>}
          {mutation.isSuccess && (
            <p className="mt-2 text-sm font-medium text-emerald-800">
              PDF uploaded. AI review has started in the background.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function PublicationEditorPage() {
  const { id } = useParams();
  const editing = !!id;
  const { user } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const source = useQuery({
    queryKey: ["publication", id],
    queryFn: () => publicationApi.get(id || ""),
    enabled: editing,
  });
  const [serverError, setServerError] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: emptyForm,
  });
  useEffect(() => {
    if (source.data?.data) {
      form.reset(toForm(source.data.data));
    }
  }, [source.data?.data, form]);

  const authors = useFieldArray({ control: form.control, name: "authors" });

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const cleanedKeywords = values.keywordsText
        ? values.keywordsText
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
      const body = {
        title: values.title.trim(),
        abstract: values.abstract.trim(),
        publicationType: values.publicationType,
        year: values.year,
        publicationDate: values.publicationDate || undefined,
        doi: values.doi?.trim() || undefined,
        url: values.url?.trim() || undefined,
        keywords: cleanedKeywords,
        authors: values.authors.map((author, index) => ({
          externalName: author.externalName.trim(),
          order: index + 1,
          isCorresponding: author.isCorresponding || false,
        })),
        venue: {
          name: values.venue.name.trim(),
          type: values.venue.type,
          volume: values.venue.volume?.trim() || undefined,
          issue: values.venue.issue?.trim() || undefined,
          pages: values.venue.pages?.trim() || undefined,
          impactFactor: values.venue.impactFactor
            ? Number(values.venue.impactFactor)
            : undefined,
        },
      };
      const metadataBody = {
        title: body.title,
        abstract: body.abstract,
        publicationType: body.publicationType,
        year: body.year,
        publicationDate: body.publicationDate,
        doi: body.doi,
        url: body.url,
        keywords: body.keywords,
        venue: body.venue,
      };
      if (!editing) return publicationApi.create(body);
      const current = source.data?.data;
      return user?.role === "oric_admin" && current?.status !== "draft"
        ? publicationApi.updateMetadata(id!, metadataBody)
        : publicationApi.update(id!, body);
    },
    onSuccess: (response) => {
      const pub = response.data;
      client.invalidateQueries({ queryKey: ["publications"] });
      client.invalidateQueries({ queryKey: ["publication", pub._id] });
      if (!editing) {
        navigate(`/publications/${pub._id}/edit`);
      } else {
        navigate(`/publications/${pub._id}`);
      }
    },
    onError: (error) => {
      applyServerFieldErrors(error, (field, issue) => {
        try {
          form.setError(field as never, issue);
        } catch {}
      });
      setServerError(getErrorMessage(error));
    },
  });

  if (editing && source.isLoading)
    return (
      <div className="page-shell">
        <LoadingBlock />
      </div>
    );
  if (editing && source.isError)
    return (
      <div className="page-shell">
        <ErrorBlock message={getErrorMessage(source.error)} />
      </div>
    );

  const publication = source.data?.data;

  return (
    <div className="page-shell">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="page-title">
            {editing
              ? user?.role === "oric_admin" && publication?.status !== "draft"
                ? "Correct publication metadata"
                : "Edit publication"
              : "New publication"}
          </h1>
          <p className="page-subtitle">
            {editing
              ? "Update the record and save your changes."
              : "Create a draft first. You will be taken to PDF upload next."}
          </p>
        </div>
        <Link
          to={editing ? `/publications/${id}` : "/publications"}
          className="btn-secondary"
        >
          Cancel
        </Link>
      </div>

      {serverError && (
        <div className="mt-5">
          <ErrorBlock message={serverError} />
        </div>
      )}

      <form
        className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"
        onSubmit={form.handleSubmit((values) => {
          setServerError("");
          save.mutate(values);
        })}
      >
        <div className="space-y-6">
          <section className="panel panel-pad">
            <h2 className="font-serif text-xl font-bold text-slate-900">
              Publication record
            </h2>
            <div className="mt-5 space-y-4">
              <div>
                <label className="label">Title *</label>
                <input
                  className="field"
                  placeholder="Enter publication title"
                  {...form.register("title")}
                />
                <p className="error">{form.formState.errors.title?.message}</p>
              </div>
              <div>
                <label className="label">Abstract *</label>
                <textarea
                  className="field min-h-40"
                  placeholder="Comprehensive abstract"
                  {...form.register("abstract")}
                />
                <p className="error">
                  {form.formState.errors.abstract?.message}
                </p>
                <p className="help">
                  {form.watch("abstract")?.length || 0}/5000
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Publication type *</label>
                  <select
                    className="field"
                    {...form.register("publicationType")}
                  >
                    {types.map((type) => (
                      <option key={type} value={type}>
                        {type.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Year *</label>
                  <input
                    className="field"
                    type="number"
                    min={1900}
                    max={new Date().getFullYear() + 1}
                    {...form.register("year")}
                  />
                  <p className="error">{form.formState.errors.year?.message}</p>
                </div>
                <div>
                  <label className="label">
                    Publication date{" "}
                    <span className="font-normal text-slate-400">
                      (optional)
                    </span>
                  </label>
                  <input
                    className="field"
                    type="date"
                    {...form.register("publicationDate")}
                  />
                </div>
                <div>
                  <label className="label">
                    DOI{" "}
                    <span className="font-normal text-slate-400">
                      (optional)
                    </span>
                  </label>
                  <input
                    className="field"
                    placeholder="10.1234/example"
                    {...form.register("doi")}
                  />
                  <p className="error">{form.formState.errors.doi?.message}</p>
                </div>
              </div>
              <div>
                <label className="label">
                  Publication URL{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  className="field"
                  placeholder="https://…"
                  {...form.register("url")}
                />
                <p className="error">{form.formState.errors.url?.message}</p>
              </div>
              <div>
                <label className="label">Keywords</label>
                <input
                  className="field"
                  placeholder="e.g. machine learning"
                  {...form.register("keywordsText")}
                />
                <p className="help">Comma separated</p>
              </div>
            </div>
          </section>

          <section className="panel panel-pad">
            <h2 className="font-serif text-xl font-bold text-slate-900">
              Venue
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">Venue name *</label>
                <input
                  className="field"
                  placeholder="Journal / Conference name"
                  {...form.register("venue.name")}
                />
                <p className="error">
                  {form.formState.errors.venue?.name?.message}
                </p>
              </div>
              <div>
                <label className="label">Venue type</label>
                <select className="field" {...form.register("venue.type")}>
                  <option value="journal">Journal</option>
                  <option value="conference">Conference</option>
                  <option value="book_publisher">Book publisher</option>
                </select>
              </div>
              <div>
                <label className="label">
                  Impact factor{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input
                  className="field"
                  type="number"
                  step="0.01"
                  min="0"
                  max={100}
                  {...form.register("venue.impactFactor")}
                />
                <p className="error">
                  {form.formState.errors.venue?.impactFactor?.message}
                </p>
              </div>
              <div>
                <label className="label">Volume</label>
                <input
                  className="field"
                  placeholder="12"
                  {...form.register("venue.volume")}
                />
                <p className="error">
                  {form.formState.errors.venue?.volume?.message}
                </p>
              </div>
              <div>
                <label className="label">Issue</label>
                <input
                  className="field"
                  placeholder="3"
                  {...form.register("venue.issue")}
                />
                <p className="error">
                  {form.formState.errors.venue?.issue?.message}
                </p>
              </div>
              <div>
                <label className="label">Pages</label>
                <input
                  className="field"
                  placeholder="10-20"
                  {...form.register("venue.pages")}
                />
                <p className="error">
                  {form.formState.errors.venue?.pages?.message}
                </p>
              </div>
            </div>
          </section>

          <section className="panel panel-pad">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-serif text-xl font-bold text-slate-900">
                  External co-authors
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  You are automatically added as internal author.
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  authors.append({ externalName: "", isCorresponding: false })
                }
              >
                <Plus className="h-4 w-4" />
                Add author
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {authors.fields.length === 0 && (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                  No external co-authors.
                </p>
              )}
              {authors.fields.map((field, index) => (
                <div
                  key={field.id}
                  className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto]"
                >
                  <div>
                    <label className="label">Author name *</label>
                    <input
                      className="field"
                      placeholder="Full name"
                      {...form.register(`authors.${index}.externalName`)}
                    />
                    <p className="error">
                      {
                        form.formState.errors.authors?.[index]?.externalName
                          ?.message
                      }
                    </p>
                  </div>
                  <label className="flex min-h-11 items-center gap-2 pt-5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-700"
                      {...form.register(`authors.${index}.isCorresponding`)}
                    />
                    Corresponding
                  </label>
                  <button
                    type="button"
                    className="btn-quiet self-end text-red-700 hover:bg-red-50"
                    onClick={() => authors.remove(index)}
                  >
                    <X className="h-4 w-4" />
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          {publication &&
            ["draft", "hod_rejected", "oric_rejected"].includes(
              publication.status,
            ) && <PdfUploader publication={publication} />}
          <section className="panel panel-pad">
            <h2 className="font-serif text-lg font-bold text-slate-900">
              Before submission
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Drafts can be saved without PDF. You must upload PDF before
              submitting.
            </p>
            <button
              className="btn-primary mt-5 w-full"
              type="submit"
              disabled={save.isPending}
            >
              {save.isPending ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save {editing ? "changes" : "draft"}
                </>
              )}
            </button>
          </section>
        </aside>
      </form>
    </div>
  );
}
