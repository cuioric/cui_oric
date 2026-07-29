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
          <h2 className="font-sans text-lg font-bold text-slate-900">
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
          <h2 className="font-sans text-lg font-bold text-slate-900">
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
                <h2 className="font-sans text-lg font-bold text-slate-900">
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
          className="mt-2 block font-sans text-base font-bold text-slate-900 hover:text-brand-700"
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
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string[]>([]);
  const [duration, setDuration] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");

  // Applied filters (only update on Apply click)
  const [appliedDepartments, setAppliedDepartments] = useState<string[]>([]);
  const [appliedStatus, setAppliedStatus] = useState<string[]>([]);
  const [appliedType, setAppliedType] = useState<string[]>([]);
  const [appliedDuration, setAppliedDuration] = useState("all");
  const [appliedDateFrom, setAppliedDateFrom] = useState("");
  const [appliedDateTo, setAppliedDateTo] = useState("");
  const [appliedYearFrom, setAppliedYearFrom] = useState("");
  const [appliedYearTo, setAppliedYearTo] = useState("");

  const departmentsQuery = useQuery({
    queryKey: ["departments", "all"],
    queryFn: () => departmentApi.list({ limit: 100 }),
  });

  const data = useQuery({
    queryKey: ["analytics", user?.role, appliedDuration, appliedDateFrom, appliedDateTo, appliedDepartments.join(","), appliedStatus.join(","), appliedType.join(","), appliedYearFrom, appliedYearTo],
    queryFn: () => {
      const params: Record<string, unknown> = {};
      if (appliedDuration && appliedDuration !== "all") params.duration = appliedDuration;
      if (appliedDateFrom) params.dateFrom = appliedDateFrom;
      if (appliedDateTo) params.dateTo = appliedDateTo;
      if (appliedDepartments.length) params.departmentId = appliedDepartments.join(",");
      if (appliedStatus.length) params.status = appliedStatus.join(",");
      if (appliedType.length) params.publicationType = appliedType.join(",");
      if (appliedYearFrom) params.yearFrom = appliedYearFrom;
      if (appliedYearTo) params.yearTo = appliedYearTo;
      return user?.role === "oric_admin"
        ? analyticsApi.institution(params)
        : analyticsApi.department();
    },
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

  const maxYear = Math.max(
    ...(dashboard.publicationsByYear || []).map((x: { count: number }) => x.count),
    1,
  );
  const maxDept = Math.max(
    ...(dashboard.publicationsByDepartment || []).map((x: { count: number }) => x.count),
    1,
  );
  const maxType = Math.max(
    ...(dashboard.publicationsByType || []).map((x: { count: number }) => x.count),
    1,
  );

  const deptOptions = (departmentsQuery.data?.items || []).map((d) => ({
    value: d._id,
    label: `${d.name} (${d.campus})`,
  }));

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

      {/* Beautiful multi-select filters */}
      <section className="panel panel-pad mt-6">
        <h2 className="font-sans text-base font-bold text-slate-900 mb-4">Filters</h2>
        <div className="space-y-5">
          <div>
            <label className="label">Duration</label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "all", label: "All time" },
                { value: "3m", label: "3 months" },
                { value: "6m", label: "6 months" },
                { value: "12m", label: "12 months" },
                { value: "24m", label: "24 months" },
                { value: "custom", label: "Custom" },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setDuration(opt.value)}
                  className={`min-h-9 rounded-md border px-3 text-sm font-medium ${duration === opt.value ? "border-brand-700 bg-brand-700 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {duration === "custom" && (
              <div className="mt-3 flex gap-3">
                <input type="date" className="field w-44" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <input type="date" className="field w-44" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            )}
          </div>

          <MultiCheckGroup
            label="Department"
            options={deptOptions}
            selected={selectedDepartments}
            onChange={setSelectedDepartments}
          />

          <MultiCheckGroup
            label="Status"
            options={statusOptions.map((o) => ({ value: o.value, label: o.label }))}
            selected={selectedStatus}
            onChange={setSelectedStatus}
          />

          <MultiCheckGroup
            label="Publication type"
            options={publicationTypeOptions.map((t) => ({ value: t, label: t.replaceAll("_", " ") }))}
            selected={selectedType}
            onChange={setSelectedType}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Year from</label>
              <input type="number" className="field" placeholder="e.g. 2020" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">Year to</label>
              <input type="number" className="field" placeholder="e.g. 2026" value={yearTo} onChange={(e) => setYearTo(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setAppliedDuration(duration);
              setAppliedDateFrom(dateFrom);
              setAppliedDateTo(dateTo);
              setAppliedDepartments([...selectedDepartments]);
              setAppliedStatus([...selectedStatus]);
              setAppliedType([...selectedType]);
              setAppliedYearFrom(yearFrom);
              setAppliedYearTo(yearTo);
            }}
          >
            Apply Filters
          </button>
        </div>
      </section>

      {/* Overview cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Active users", value: overview.activeUsers || 0, color: "bg-brand-700" },
          { label: "Total publications", value: overview.totalPublications || 0, color: "bg-brand-600" },
          { label: "Verified publications", value: overview.verifiedPublications || 0, color: "bg-brand-500" },
          { label: "Total citations", value: overview.totalCitations || 0, color: "bg-brand-800" },
        ].map((card) => (
          <section className="panel panel-pad" key={card.label}>
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-2 text-3xl font-extrabold text-slate-900">{card.value}</p>
            <div className="mt-3 h-1 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full rounded-full ${card.color}`} style={{ width: `${Math.min(100, (Number(card.value) / Math.max(Number(card.value) || 1, 50)) * 100)}%` }} />
            </div>
          </section>
        ))}
        {Object.entries(overview)
          .filter(([k]) => !["activeUsers", "totalPublications", "verifiedPublications", "totalCitations"].includes(k))
          .slice(0, 4)
          .map(([key, value]) => (
            <section className="panel panel-pad" key={key}>
              <p className="text-sm text-slate-500">{key.replace(/([A-Z])/g, " $1")}</p>
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

      {/* Main charts */}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="panel panel-pad xl:col-span-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-brand-700" />
            <h2 className="font-sans text-xl font-bold text-slate-900">Verified publications by year</h2>
          </div>
          {dashboard.publicationsByYear?.length ? (
            <div className="mt-6 space-y-5">
              {dashboard.publicationsByYear.map((item) => (
                <div key={item._id} className="group">
                  <div className="mb-2 flex justify-between text-sm font-medium">
                    <span className="text-slate-700">{item._id}</span>
                    <span className="text-brand-700">{item.count} publications</span>
                  </div>
                  <div className="relative h-8 overflow-hidden rounded-lg bg-slate-100">
                    <div
                      className="absolute left-0 top-0 h-full rounded-lg bg-gradient-to-r from-brand-600 to-brand-800 transition-all duration-500"
                      style={{ width: `${(item.count / maxYear) * 100}%` }}
                    />
                    <div className="absolute inset-0 flex items-center px-3">
                      <span className="text-xs font-bold text-white drop-shadow">{item.citations ? `${item.citations} citations` : `${item.count}`}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyBlock title="No verified publication data" />
          )}
        </section>

        <section className="panel panel-pad">
          <h2 className="font-sans text-xl font-bold text-slate-900">Publication status</h2>
          {dashboard.publicationsByStatus?.length ? (
            <>
              <div className="mt-6 flex flex-wrap gap-3 justify-center">
                {dashboard.publicationsByStatus.map((item) => (
                  <div key={item._id} className="flex flex-col items-center">
                    <div className="h-20 w-20 rounded-full bg-brand-50 border-4 border-brand-200 flex items-center justify-center">
                      <span className="text-2xl font-extrabold text-brand-700">{item.count}</span>
                    </div>
                    <span className="mt-2 text-xs font-semibold text-slate-600">{(item._id as string).replaceAll("_", " ")}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 space-y-3">
                {dashboard.publicationsByStatus.map((item) => (
                  <div key={item._id} className="flex items-center gap-3">
                    <StatusBadge status={item._id} />
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${(item.count / Math.max(...(dashboard.publicationsByStatus || []).map((i: { count: number }) => i.count))) * 100}%` }} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 w-6 text-right">{item.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyBlock title="No publication data" />
          )}
        </section>
      </div>

      <section className="panel panel-pad mt-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-brand-700" />
          <h2 className="font-sans text-xl font-bold text-slate-900">Publications by department</h2>
        </div>
        {dashboard.publicationsByDepartment?.length ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {dashboard.publicationsByDepartment.map((item: { _id?: string; department?: string; campus?: string; count: number; citations?: number }) => (
              <div key={item.department || item._id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <h3 className="font-sans text-base font-bold text-slate-900">{item.department || "Unknown"}</h3>
                <p className="text-xs text-slate-500">{item.campus} campus</p>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-white shadow-inner">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700" style={{ width: `${(item.count / maxDept) * 100}%` }} />
                </div>
                <div className="mt-2 flex justify-between text-sm font-bold text-slate-800">
                  <span>{item.count} verified</span>
                  <span className="text-brand-700">{item.citations || 0} citations</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyBlock title="No department-level publication data" />
        )}
      </section>

      <section className="panel panel-pad mt-6">
        <h2 className="font-sans text-xl font-bold text-slate-900">Publications by type</h2>
        {dashboard.publicationsByType?.length ? (
          <div className="mt-6 space-y-4">
            {dashboard.publicationsByType.map((item) => (
              <div key={item._id} className="flex items-center gap-4">
                <span className="w-32 text-sm font-medium text-slate-700">{(item._id as string).replaceAll("_", " ")}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${(item.count / maxType) * 100}%` }} />
                </div>
                <span className="w-8 text-right text-sm font-bold text-slate-800">{item.count}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyBlock title="No publication type data" />
        )}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="panel panel-pad">
          <h2 className="font-sans text-xl font-bold text-slate-900">Review workload</h2>
          <div className="mt-5 space-y-4">
            <div>
              <div className="flex justify-between text-sm font-medium text-slate-600">
                <span>Pending HOD reviews</span>
                <span>{dashboard.reviewWorkload?.pendingHodReviews || 0}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, ((dashboard.reviewWorkload?.pendingHodReviews || 0) / Math.max(1, (dashboard.reviewWorkload?.pendingHodReviews || 0) + (dashboard.reviewWorkload?.pendingOricReviews || 0))) * 100)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm font-medium text-slate-600">
                <span>Pending ORIC reviews</span>
                <span>{dashboard.reviewWorkload?.pendingOricReviews || 0}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-700" style={{ width: `${Math.min(100, ((dashboard.reviewWorkload?.pendingOricReviews || 0) / Math.max(1, (dashboard.reviewWorkload?.pendingOricReviews || 0) + (dashboard.reviewWorkload?.pendingHodReviews || 0))) * 100)}%` }} />
              </div>
            </div>
          </div>
        </section>

        <section className="panel panel-pad">
          <h2 className="font-sans text-xl font-bold text-slate-900">Citation statistics</h2>
          {dashboard.citationStats ? (
            <div className="mt-5 space-y-4">
              {[
                { label: "Total citation links", value: dashboard.citationStats.totalLinks || 0 },
                { label: "External citations", value: dashboard.citationStats.externalCitations || 0 },
                { label: "Internal citations", value: dashboard.citationStats.internalCitations || 0 },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-sm font-medium text-slate-600">
                    <span>{item.label}</span>
                    <span className="font-bold text-slate-900">{item.value}</span>
                  </div>
                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-700" style={{ width: `${Math.min(100, (item.value / Math.max(1, (dashboard.citationStats?.totalLinks || 1))) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyBlock title="No citation data" />
          )}
        </section>

        <section className="panel panel-pad xl:col-span-2">
          <h2 className="font-sans text-xl font-bold text-slate-900">User role distribution</h2>
          {dashboard.usersByRole?.length ? (
            <div className="mt-5 space-y-4">
              {dashboard.usersByRole.map((item: { _id: string; count: number }) => (
                <div key={item._id} className="flex items-center gap-4">
                  <span className="w-32 text-sm font-medium text-slate-700 capitalize">{String(item._id).replaceAll("_", " ")}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, (item.count / Math.max(...(dashboard.usersByRole || []).map((i: { count: number }) => i.count))) * 100)}%` }} />
                  </div>
                  <span className="w-8 text-right text-sm font-bold text-slate-800">{item.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyBlock title="No user role data" />
          )}
        </section>

        <section className="panel panel-pad">
          <h2 className="font-sans text-xl font-bold text-slate-900">Recent verified publications</h2>
          {dashboard.recentActivity?.length ? (
            <div className="mt-4 divide-y">
              {dashboard.recentActivity.map((pub: Publication) => (
                <Link to={`/publications/${pub._id}`} key={pub._id} className="block py-3 hover:bg-slate-50 -mx-2 px-2 rounded-lg transition-colors">
                  <h3 className="font-sans text-sm font-bold text-slate-900 hover:text-brand-700 line-clamp-1">{pub.title}</h3>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span>{pub.year}</span>
                    <span>·</span>
                    <span>{pub.publicationType?.replaceAll("_", " ")}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyBlock title="No recent activity" />
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
