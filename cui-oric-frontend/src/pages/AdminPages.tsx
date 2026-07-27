import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Check,
  CheckCircle2,
  LoaderCircle,
  Plus,
  Trash2,
  UserCog,
  X,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
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
import { useAuth } from "../contexts/AuthContext";
import {
  adminApi,
  analyticsApi,
  applyServerFieldErrors,
  departmentApi,
  getErrorMessage,
  publicationApi,
} from "../lib/api";
import type {
  Department,
  Publication,
  PublicationStatus,
  Role,
  User,
} from "../types";

const campuses = [
  "Sahiwal",
  "Islamabad",
  "Lahore",
  "Wah",
  "Attock",
  "Vehari",
  "Virtual",
];
const roleLabel = (role: string) => role.replaceAll("_", " ");

function UserApproval({
  user,
  departments,
}: {
  user: User;
  departments: Department[];
}) {
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [role, setRole] = useState<Role>(user.role);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const approve = useMutation({
    mutationFn: () =>
      adminApi.approveUser(objectId(user), { departmentId, role }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["pending-users"] });
      client.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e) => setError(getErrorMessage(e)),
  });

  const reject = useMutation({
    mutationFn: () => adminApi.rejectUser(objectId(user), rejectReason.trim()),
    onSuccess: () => client.invalidateQueries({ queryKey: ["pending-users"] }),
    onError: (e) => setError(getErrorMessage(e)),
  });

  return (
    <article className="rounded-lg border border-slate-200 p-4 transition-shadow hover:shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{user.name}</h3>
          <p className="text-sm text-slate-500">{user.email}</p>
          <p className="mt-1 text-xs text-slate-500">
            Requested: {roleLabel(user.role)} · {user.campus}
          </p>
        </div>
        <span className="badge bg-amber-100 text-amber-800">
          Pending approval
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <select
          aria-label="Department"
          className="field"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
        >
          <option value="">Assign department…</option>
          {departments.map((department) => (
            <option key={department._id} value={department._id}>
              {department.name} · {department.campus}
            </option>
          ))}
        </select>
        <select
          aria-label="Role"
          className="field"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          <option value="faculty">Faculty</option>
          <option value="ms_student">MS student</option>
          <option value="phd_student">PhD student</option>
          <option value="hod">HOD</option>
        </select>
      </div>
      {showRejectForm && (
        <div className="mt-3">
          <textarea
            aria-label="Rejection reason"
            className="field"
            rows={2}
            placeholder="Reason for rejection (sent to the applicant by email)…"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </div>
      )}
      {error && <p className="error mt-2">{error}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="btn-primary"
          disabled={!departmentId || approve.isPending}
          onClick={() => approve.mutate()}
        >
          {approve.isPending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Approve
        </button>
        {showRejectForm ? (
          <button
            className="btn-danger"
            disabled={!rejectReason.trim() || reject.isPending}
            onClick={() => reject.mutate()}
          >
            {reject.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
            Confirm reject
          </button>
        ) : (
          <button
            className="btn-danger"
            onClick={() => setShowRejectForm(true)}
          >
            <X className="h-4 w-4" />
            Reject
          </button>
        )}
      </div>
    </article>
  );
}

export function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const pending = useQuery({
    queryKey: ["pending-users", page],
    queryFn: () => adminApi.pendingUsers({ page, limit: 10 }),
  });
  const departments = useQuery({
    queryKey: ["departments", "all"],
    queryFn: () => departmentApi.list({ limit: 100 }),
  });

  return (
    <div className="page-shell">
      <div>
        <h1 className="page-title">User approvals</h1>
        <p className="page-subtitle">
          Approve verified applicants and assign their department and active
          role — CUI ORIC branded workflow.
        </p>
      </div>
      <section className="panel mt-6">
        <div className="border-b px-5 py-4">
          <h2 className="font-serif text-lg font-bold text-slate-900">
            Awaiting ORIC approval
          </h2>
        </div>
        <div className="p-4">
          {pending.isLoading || departments.isLoading ? (
            <LoadingBlock label="Loading approval queue…" />
          ) : pending.isError ? (
            <ErrorBlock message={getErrorMessage(pending.error)} />
          ) : !pending.data?.items.length ? (
            <EmptyBlock
              title="Approval queue is clear"
              text="Email-verified registrations will appear here."
            />
          ) : (
            <div className="grid gap-4">
              {pending.data.items.map((user) => (
                <UserApproval
                  key={objectId(user)}
                  user={user}
                  departments={departments.data?.items || []}
                />
              ))}
            </div>
          )}
        </div>
        <Pagination meta={pending.data?.pagination} onPageChange={setPage} />
      </section>
      <AllUsers />
    </div>
  );
}

function AllUsers() {
  const [search, setSearch] = useState("");
  const users = useQuery({
    queryKey: ["users", search],
    queryFn: () => adminApi.users({ limit: 20, ...(search ? { search } : {}) }),
  });

  return (
    <section className="panel mt-6">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-lg font-bold text-slate-900">
            User directory
          </h2>
          <p className="text-sm text-slate-500">
            All registered system accounts — managed by ORIC Admin.
          </p>
        </div>
        <input
          className="field max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email"
        />
      </div>
      {users.isLoading ? (
        <LoadingBlock />
      ) : users.isError ? (
        <div className="p-4">
          <ErrorBlock message={getErrorMessage(users.error)} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-head">User</th>
                <th className="table-head">Role</th>
                <th className="table-head">Department</th>
                <th className="table-head">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.data?.items.map((user) => (
                <tr key={objectId(user)}>
                  <td className="table-cell">
                    <p className="font-semibold text-slate-900">{user.name}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </td>
                  <td className="table-cell capitalize">
                    {roleLabel(user.role)}
                  </td>
                  <td className="table-cell">
                    {displayName(user.departmentId) || "—"}
                  </td>
                  <td className="table-cell">
                    <span className="badge bg-slate-100 text-slate-700">
                      {user.status.replaceAll("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DepartmentForm({
  department,
  onClose,
}: {
  department?: Department;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [error, setError] = useState("");
  const hods = useQuery({
    queryKey: ["active-hods"],
    queryFn: () =>
      adminApi.users({ limit: 100, role: "hod", status: "active" }),
  });

  const form = useForm<{ name: string; campus: string; hodId: string }>({
    defaultValues: {
      name: department?.name || "",
      campus: department?.campus || "Sahiwal",
      hodId: department?.hodId ? objectId(department.hodId) : "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: { name: string; campus: string; hodId: string }) => {
      const body = {
        name: data.name.trim(),
        campus: data.campus,
        ...(data.hodId ? { hodId: data.hodId } : {}),
      };
      return department
        ? departmentApi.update(department._id, body)
        : departmentApi.create(body);
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["departments"] });
      client.invalidateQueries({ queryKey: ["public-departments"] });
      onClose();
    },
    onError: (e) => {
      applyServerFieldErrors(e, (field, issue) =>
        form.setError(field as "name" | "campus" | "hodId", issue),
      );
      setError(getErrorMessage(e));
    },
  });

  const { errors } = form.formState;

  return (
    <form
      className="rounded-lg border border-brand-200 bg-brand-50 p-4 shadow-sm"
      onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
    >
      <h3 className="font-semibold text-slate-900">
        {department ? "Edit department" : "New department"}
      </h3>
      <p className="mt-1 text-xs text-slate-600">
        CUI ORIC departments are institution-wide — changes reflect across the
        repository.
      </p>
      {error && (
        <div className="mt-3">
          <ErrorBlock message={error} />
        </div>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Department name *</label>
          <input
            className="field"
            placeholder="e.g. Computer Science"
            {...form.register("name", {
              required: "Department name required",
              minLength: { value: 2, message: "At least 2 chars" },
              maxLength: { value: 100, message: "Max 100 chars" },
            })}
          />
          <p className="error">{errors.name?.message}</p>
        </div>
        <div>
          <label className="label">Campus *</label>
          <select
            className="field"
            {...form.register("campus", { required: true })}
          >
            {campuses.map((campus) => (
              <option key={campus}>{campus}</option>
            ))}
          </select>
          <p className="error">{errors.campus?.message}</p>
        </div>
        <div className="sm:col-span-2">
          <label className="label">
            Head of Department{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <select className="field" {...form.register("hodId")}>
            <option value="">No HOD assigned</option>
            {hods.data?.items.map((hod) => (
              <option value={objectId(hod)} key={objectId(hod)}>
                {hod.name} · {hod.email}
              </option>
            ))}
          </select>
          <p className="error">{errors.hodId?.message}</p>
          <p className="help">
            Only active users whose role is already HOD can be assigned.
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="btn-primary" disabled={mutation.isPending}>
          {mutation.isPending && (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          )}
          Save department
        </button>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function DepartmentsPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [editing, setEditing] = useState<Department | null | "new">(null);
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const list = useQuery({
    queryKey: ["departments"],
    queryFn: () => departmentApi.list({ limit: 100 }),
  });

  const remove = useMutation({
    mutationFn: departmentApi.remove,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["departments"] });
      setDeleteTarget(null);
      setDeleteError("");
    },
    onError: (e) => setDeleteError(getErrorMessage(e)),
  });

  return (
    <div className="page-shell">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="page-title">Departments — Admin</h1>
          <p className="page-subtitle">
            Manage CUI departments and their HOD assignments. This view is ORIC
            admin only.
          </p>
        </div>
        {user?.role === "oric_admin" && (
          <button className="btn-primary" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            New department
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-5">
          <DepartmentForm
            department={editing === "new" ? undefined : editing}
            onClose={() => setEditing(null)}
          />
        </div>
      )}
      {deleteError && (
        <div className="mt-4">
          <ErrorBlock message={deleteError} />
        </div>
      )}

      <section className="panel mt-6 overflow-hidden">
        {list.isLoading ? (
          <LoadingBlock />
        ) : list.isError ? (
          <div className="p-4">
            <ErrorBlock message={getErrorMessage(list.error)} />
          </div>
        ) : !list.data?.items.length ? (
          <EmptyBlock
            title="No departments found"
            text="Create the first department to start assigning faculty."
          />
        ) : (
          <div className="grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-3">
            {list.data.items.map((department) => (
              <article className="p-5" key={department._id}>
                <h2 className="font-serif text-lg font-bold text-slate-900">
                  {department.name}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {department.campus} campus
                </p>
                <p className="mt-4 text-sm text-slate-700">
                  HOD: {displayName(department.hodId) || "Not assigned"}
                </p>
                {user?.role === "oric_admin" && (
                  <div className="mt-4 flex gap-2">
                    <button
                      className="btn-secondary"
                      onClick={() => setEditing(department)}
                    >
                      <UserCog className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      className="btn-quiet text-red-700 hover:bg-red-50"
                      disabled={remove.isPending}
                      onClick={() => setDeleteTarget(department)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/*stylish branded confirm centered */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.name || "department"}?`}
        message="This department will be permanently removed from CUI ORIC repository. Departments with assigned users cannot be deleted — please reassign users first."
        confirmLabel="Delete department"
        cancelLabel="Cancel"
        variant="danger"
        loading={remove.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove.mutate(deleteTarget._id)}
      />
    </div>
  );
}

function ReviewItem({ publication }: { publication: Publication }) {
  const client = useQueryClient();
  const { user } = useAuth();
  const [remarks, setRemarks] = useState("");
  const [actionError, setActionError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const isHod = user?.role === "hod";
  const isOric = user?.role === "oric_admin";

  const reviewMutation = useMutation({
    mutationFn: async ({
      decision,
    }: {
      decision: "approved" | "rejected" | "verified";
    }) => {
      if (!remarks.trim())
        throw new Error("Please enter your remarks before proceeding.");
      if (remarks.trim().length < 10)
        throw new Error(
          "Remarks must be at least 10 characters — provide constructive feedback.",
        );
      if (isHod || (isOric && publication.status === "submitted_to_hod")) {
        return publicationApi.hodReview(publication._id, {
          decision: decision as "approved" | "rejected",
          remarks,
        });
      } else {
        const oricDecision = decision === "approved" ? "verified" : "rejected";
        return publicationApi.oricReview(publication._id, {
          decision: oricDecision as "verified" | "rejected",
          remarks,
        });
      }
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["review-queue"] });
      client.invalidateQueries({ queryKey: ["publication", publication._id] });
      setSuccessMsg("Decision recorded successfully in CUI ORIC workflow");
      setRemarks("");
      setActionError("");
      setTimeout(() => setSuccessMsg(""), 4000);
    },
    onError: (e) => setActionError(getErrorMessage(e)),
  });

  return (
    <div className="panel overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <StatusBadge status={publication.status} />
          <span className="text-xs text-slate-500">{publication.year}</span>
        </div>
        <Link
          to={`/publications/${publication._id}`}
          className="mt-2 block font-serif text-base font-bold text-slate-900 hover:text-brand-700"
        >
          {publication.title}
        </Link>
        <p className="mt-1 line-clamp-2 text-sm text-slate-600">
          {publication.abstract?.slice(0, 140) || "No abstract"}
        </p>
      </div>

      <div className="border-t bg-slate-50 p-4">
        <label className="label">Review remarks *</label>
        <textarea
          className="field min-h-20"
          placeholder="Required: min 10 chars, visible in audit trail"
          value={remarks}
          onChange={(e) => {
            setRemarks(e.target.value);
            setActionError("");
          }}
        />
        {actionError && <p className="error mt-1">{actionError}</p>}
        {successMsg && (
          <p className="mt-2 text-sm font-medium text-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4" />
            {successMsg}
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            className="btn-primary"
            disabled={reviewMutation.isPending}
            onClick={() => reviewMutation.mutate({ decision: "approved" })}
          >
            {reviewMutation.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {publication.status === "sent_to_oric" ? "Verify" : "Approve"}
          </button>
          <button
            className="btn-danger"
            disabled={reviewMutation.isPending}
            onClick={() => reviewMutation.mutate({ decision: "rejected" })}
          >
            <X className="h-4 w-4" />
            Reject
          </button>
        </div>
        <Link
          to={`/publications/${publication._id}`}
          className="mt-2 block text-center text-xs font-semibold text-brand-700 hover:underline"
        >
          View full detail & timeline
        </Link>
      </div>
    </div>
  );
}

export function ReviewQueuePage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);

  const queue = useQuery({
    queryKey: ["review-queue", user?.role, page],
    queryFn: () =>
      user?.role === "oric_admin"
        ? analyticsApi.oricQueue({ page, limit: 12 })
        : publicationApi.list({ page, limit: 12, status: "submitted_to_hod" }),
    enabled: !!user,
  });

  const title =
    user?.role === "oric_admin"
      ? "ORIC review queue"
      : "Department review queue";
  const description =
    user?.role === "oric_admin"
      ? "Publications approved by HOD and awaiting final verification."
      : "Submitted publications from your department awaiting a HOD decision — you can approve or return with remarks.";

  return (
    <div className="page-shell">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-1 h-6 w-6 text-brand-700" />
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{description}</p>
        </div>
      </div>

      <section className="panel mt-6 overflow-hidden">
        {queue.isLoading ? (
          <LoadingBlock label="Loading review queue…" />
        ) : queue.isError ? (
          <div className="p-4">
            <ErrorBlock message={getErrorMessage(queue.error)} />
          </div>
        ) : !queue.data?.items.length ? (
          <EmptyBlock
            title="Your review queue is clear"
            text="New submissions will be listed here when they require your review."
          />
        ) : (
          <>
            <div className="grid gap-4 p-4 lg:grid-cols-2">
              {queue.data.items.map((publication: Publication) => (
                <ReviewItem key={publication._id} publication={publication} />
              ))}
            </div>
            <Pagination meta={queue.data.pagination} onPageChange={setPage} />
          </>
        )}
      </section>
    </div>
  );
}

export function AnalyticsPage() {
  const { user } = useAuth();
  const data = useQuery({
    queryKey: ["analytics", user?.role],
    queryFn: () =>
      user?.role === "oric_admin"
        ? analyticsApi.institution()
        : analyticsApi.department(),
    enabled: user?.role === "oric_admin" || user?.role === "hod",
  });

  if (data.isLoading)
    return (
      <div className="page-shell">
        <LoadingBlock label="Loading analytics…" />
      </div>
    );
  if (data.isError || !data.data?.data)
    return (
      <div className="page-shell">
        <ErrorBlock message={getErrorMessage(data.error)} />
      </div>
    );

  const dashboard = data.data.data;
  const overview = dashboard.overview || {};
  const max = Math.max(
    ...(dashboard.publicationsByYear || []).map((x) => x.count),
    1,
  );

  return (
    <div className="page-shell">
      <div>
        <h1 className="page-title">Research analytics</h1>
        <p className="page-subtitle">
          {user?.role === "oric_admin"
            ? "Institution-wide research performance and workflow activity — CUI ORIC branded analytics."
            : `${displayName(dashboard.department)} research performance and workflow activity.`}
        </p>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Object.entries(overview)
          .slice(0, 8)
          .map(([key, value]) => (
            <section className="panel panel-pad" key={key}>
              <p className="text-sm text-slate-500">
                {key.replace(/([A-Z])/g, " $1")}
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {typeof value === "number"
                  ? Number.isInteger(value)
                    ? value
                    : value.toFixed(1)
                  : String(value)}
              </p>
            </section>
          ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="panel panel-pad">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-brand-700" />
            <h2 className="font-serif text-xl font-bold text-slate-900">
              Verified publications by year
            </h2>
          </div>
          {dashboard.publicationsByYear?.length ? (
            <div className="mt-6 space-y-4">
              {dashboard.publicationsByYear.map((item) => (
                <div key={item._id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{item._id}</span>
                    <span className="font-semibold">{item.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand-700"
                      style={{ width: `${(item.count / max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyBlock title="No verified publication data" />
          )}
        </section>
        <section className="panel panel-pad">
          <h2 className="font-serif text-xl font-bold text-slate-900">
            Publication status
          </h2>
          {dashboard.publicationsByStatus?.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {dashboard.publicationsByStatus.map((item) => (
                <div
                  key={item._id}
                  className="flex items-center justify-between rounded-lg bg-slate-50 p-3"
                >
                  <StatusBadge status={item._id} />
                  <span className="text-lg font-bold text-slate-900">
                    {item.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyBlock title="No publication data" />
          )}
        </section>
      </div>
    </div>
  );
}

const timeframeOptions = [
  { value: "all", label: "All time" },
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "12m", label: "Last 12 months" },
  { value: "24m", label: "Last 24 months" },
  { value: "custom", label: "Custom range" },
];
const statusOptions: { value: PublicationStatus; label: string }[] = [
  // 'draft' intentionally excluded — drafts are private to their authors and never exportable
  { value: "submitted_to_hod", label: "With HOD" },
  { value: "hod_rejected", label: "HOD returned" },
  { value: "sent_to_oric", label: "With ORIC" },
  { value: "oric_rejected", label: "ORIC returned" },
  { value: "oric_verified", label: "Verified" },
];
const publicationTypeOptions = [
  "journal_article",
  "conference_paper",
  "book",
  "book_chapter",
  "thesis",
  "preprint",
  "patent",
];

function MultiCheckGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (value: string) =>
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  return (
    <div>
      <label className="label">{label}</label>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            type="button"
            key={opt.value}
            onClick={() => toggle(opt.value)}
            className={`min-h-9 rounded-md border px-3 text-sm font-medium ${selected.includes(opt.value) ? "border-brand-700 bg-brand-700 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PublicationsExportPage() {
  const departments = useQuery({
    queryKey: ["departments", "all"],
    queryFn: () => departmentApi.list({ limit: 100 }),
  });
  const [timeframe, setTimeframe] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [campusValues, setCampusValues] = useState<string[]>([]);
  const [statusValues, setStatusValues] = useState<string[]>([]);
  const [typeValues, setTypeValues] = useState<string[]>([]);
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const departmentOptions = (departments.data?.items || []).map((d) => ({
    value: d._id,
    label: `${d.name} (${d.campus})`,
  }));

  const handleExport = async () => {
    setError("");
    if (timeframe === "custom") {
      if (!dateFrom || !dateTo) {
        setError(
          'Please select both a "From" and "To" date for the custom range.',
        );
        return;
      }
      if (dateFrom > dateTo) {
        setError('The "From" date must be before the "To" date.');
        return;
      }
    }
    if (yearFrom && yearTo && Number(yearFrom) > Number(yearTo)) {
      setError('"Year from" must be less than or equal to "Year to".');
      return;
    }
    setBusy(true);
    try {
      const params: Record<string, unknown> = { timeframe };
      if (timeframe === "custom") {
        if (dateFrom) params.dateFrom = dateFrom;
        if (dateTo) params.dateTo = dateTo;
      }
      if (departmentIds.length) params.departmentId = departmentIds.join(",");
      if (campusValues.length) params.campus = campusValues.join(",");
      if (statusValues.length) params.status = statusValues.join(",");
      if (typeValues.length) params.publicationType = typeValues.join(",");
      if (yearFrom) params.yearFrom = yearFrom;
      if (yearTo) params.yearTo = yearTo;
      if (search.trim()) params.search = search.trim();

      const response = await publicationApi.exportCsv(params);
      const blob = new Blob([response.data], {
        type: "text/csv;charset=utf-8",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const disposition = response.headers?.["content-disposition"] as
        | string
        | undefined;
      const match = disposition?.match(/filename="?([^"]+)"?/);
      link.download =
        match?.[1] ||
        `publications-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-shell">
      <div>
        <h1 className="page-title">Export publications</h1>
        <p className="page-subtitle">
          Download a CSV of publication records, filtered by time frame,
          department, campus, and more.
        </p>
      </div>

      <div className="mt-6 panel panel-pad space-y-6">
        <div>
          <label className="label">Time frame</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {timeframeOptions.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => setTimeframe(opt.value)}
                className={`min-h-9 rounded-md border px-3 text-sm font-medium ${timeframe === opt.value ? "border-brand-700 bg-brand-700 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {timeframe === "custom" && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">From</label>
                <input
                  type="date"
                  className="field"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="label">To</label>
                <input
                  type="date"
                  className="field"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <MultiCheckGroup
          label="Campus"
          options={campuses.map((c) => ({ value: c, label: c }))}
          selected={campusValues}
          onChange={setCampusValues}
        />

        <MultiCheckGroup
          label="Department"
          options={departmentOptions}
          selected={departmentIds}
          onChange={setDepartmentIds}
        />

        <MultiCheckGroup
          label="Status"
          options={statusOptions}
          selected={statusValues}
          onChange={setStatusValues}
        />

        <MultiCheckGroup
          label="Publication type"
          options={publicationTypeOptions.map((t) => ({
            value: t,
            label: t.replaceAll("_", " "),
          }))}
          selected={typeValues}
          onChange={setTypeValues}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Year from</label>
            <input
              type="number"
              className="field"
              placeholder="e.g. 2020"
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Year to</label>
            <input
              type="number"
              className="field"
              placeholder="e.g. 2026"
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Keyword search</label>
            <input
              className="field"
              placeholder="title, abstract, keyword…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {error && <ErrorBlock message={error} />}

        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={handleExport}
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          Export CSV
        </button>
      </div>
    </div>
  );
}
