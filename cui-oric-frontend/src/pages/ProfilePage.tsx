import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  displayName,
} from "../components/Common";
import {
  applyServerFieldErrors,
  profileApi,
  getErrorMessage,
} from "../lib/api";
import type { AuthorProfile } from "../types";

const schema = z.object({
  designation: z.string().max(100).optional(),
  affiliation: z.string().max(200).optional(),
  interests: z.string().optional(),
  homepageUrl: z.string().url("Enter a valid URL").or(z.literal("")),
  orcidId: z
    .string()
    .regex(/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/, "Use XXXX-XXXX-XXXX-XXXX")
    .or(z.literal("")),
  googleScholarId: z.string().optional(),
});
type Values = z.infer<typeof schema>;
export function ProfilePage() {
  const client = useQueryClient();
  const profile = useQuery({
    queryKey: ["my-profile"],
    queryFn: profileApi.me,
  });
  const metrics = useQuery({
    queryKey: ["profile-metrics"],
    queryFn: () => profileApi.metrics("me"),
  });
  const network = useQuery({
    queryKey: ["profile-network"],
    queryFn: () => profileApi.network("me"),
  });
  const [photoError, setPhotoError] = useState("");
  const [serverError, setServerError] = useState("");
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: profile.data?.data
      ? {
          designation: profile.data.data.designation || "",
          affiliation: profile.data.data.affiliation || "",
          interests: profile.data.data.researchInterests?.join(", ") || "",
          homepageUrl: profile.data.data.homepageUrl || "",
          orcidId: profile.data.data.orcidId || "",
          googleScholarId: profile.data.data.googleScholarId || "",
        }
      : undefined,
  });
  const update = useMutation({
    mutationFn: (values: Values) =>
      profileApi.update({
        designation: values.designation,
        affiliation: values.affiliation,
        researchInterests: values.interests
          ?.split(",")
          .map((i) => i.trim())
          .filter(Boolean),
        homepageUrl: values.homepageUrl || undefined,
        orcidId: values.orcidId || undefined,
        googleScholarId: values.googleScholarId || undefined,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["my-profile"] }),
    onError: (error) => {
      applyServerFieldErrors(error, (field, issue) =>
        form.setError(field as never, issue),
      );
      setServerError(getErrorMessage(error));
    },
  });
  const photo = useMutation({
    mutationFn: profileApi.uploadPhoto,
    onSuccess: () => client.invalidateQueries({ queryKey: ["my-profile"] }),
    onError: (error) => setPhotoError(getErrorMessage(error)),
  });
  const removePhoto = useMutation({
    mutationFn: profileApi.deletePhoto,
    onSuccess: () => client.invalidateQueries({ queryKey: ["my-profile"] }),
  });
  const recompute = useMutation({
    mutationFn: () => profileApi.recomputeMetrics(),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["profile-metrics"] }),
  });
  if (profile.isLoading)
    return (
      <div className="page-shell">
        <LoadingBlock label="Loading profile…" />
      </div>
    );
  if (profile.isError || !profile.data?.data)
    return (
      <div className="page-shell">
        <ErrorBlock message={getErrorMessage(profile.error)} />
      </div>
    );
  const data = profile.data.data as AuthorProfile;
  const summary = metrics.data?.data as
    | {
        metrics?: { totalCitations: number; hIndex: number; i10Index: number };
        coAuthorCount?: number;
        researchInterests?: string[];
      }
    | undefined;
  return (
    <div className="page-shell">
      <div>
        <h1 className="page-title">My researcher profile</h1>
        <p className="page-subtitle">
          Maintain your public academic profile and research interests.
        </p>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <section className="panel panel-pad text-center">
            <div className="relative mx-auto grid h-28 w-28 place-items-center overflow-hidden rounded-full bg-brand-100 text-3xl font-bold text-brand-700">
              {data.photoUrl ? (
                <img
                  src={data.photoUrl}
                  alt="Profile"
                  className="h-full w-full object-cover"
                />
              ) : (
                data.userId.name.slice(0, 1)
              )}
              <label className="absolute bottom-0 right-0 grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-brand-700 text-white shadow-md hover:bg-brand-800">
                <Camera className="h-4 w-4" />
                <input
                  type="file"
                  className="sr-only"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    setPhotoError("");
                    if (!file) return;
                    if (
                      !["image/jpeg", "image/png", "image/webp"].includes(
                        file.type,
                      )
                    ) {
                      setPhotoError("Choose a JPEG, PNG, or WEBP image.");
                      return;
                    }
                    if (file.size > 5 * 1024 * 1024) {
                      setPhotoError("The photo must be 5 MB or smaller.");
                      return;
                    }
                    photo.mutate(file);
                  }}
                />
              </label>
            </div>
            {photo.isPending && (
              <p className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-600">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Scanning and uploading photo…
              </p>
            )}
            {photoError && <p className="error">{photoError}</p>}
            {data.photoUrl && (
              <button
                className="btn-quiet mt-3 text-red-700 hover:bg-red-50"
                disabled={removePhoto.isPending}
                onClick={() => removePhoto.mutate()}
              >
                <Trash2 className="h-4 w-4" />
                Remove photo
              </button>
            )}
            <h2 className="mt-4 font-serif text-xl font-bold text-slate-900">
              {data.userId.name}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {data.designation || data.userId.role.replace("_", " ")}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {displayName(data.departmentId)}
            </p>
          </section>
          <section className="panel panel-pad">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-serif text-lg font-bold text-slate-900">
                Research metrics
              </h2>
              <button
                className="btn-quiet text-xs"
                disabled={recompute.isPending}
                onClick={() => recompute.mutate()}
                title="Recalculate from your current verified publications and citations"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${recompute.isPending ? "animate-spin" : ""}`}
                />
                Recompute
              </button>
            </div>
            {recompute.isSuccess && (
              <p className="mt-1 text-xs font-medium text-emerald-600">
                Metrics updated.
              </p>
            )}
            {metrics.isLoading ? (
              <LoadingBlock />
            ) : (
              <dl className="mt-4 grid grid-cols-2 gap-3">
                {[
                  {
                    label: "Citations",
                    value: summary?.metrics?.totalCitations || 0,
                  },
                  { label: "h-index", value: summary?.metrics?.hIndex || 0 },
                  {
                    label: "i10-index",
                    value: summary?.metrics?.i10Index || 0,
                  },
                  { label: "Co-authors", value: summary?.coAuthorCount || 0 },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-slate-50 p-3">
                    <dt className="text-xs font-medium text-slate-500">
                      {item.label}
                    </dt>
                    <dd className="mt-1 text-xl font-bold text-slate-900">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
          <section className="panel panel-pad">
            <h2 className="font-serif text-lg font-bold text-slate-900">
              Co-author network
            </h2>
            {network.isLoading ? (
              <LoadingBlock />
            ) : network.data?.data?.nodes.length ? (
              <div className="mt-4 rounded-lg bg-cui-pale p-4 text-sm text-cui-blue">
                <p className="font-semibold">
                  {network.data.data.nodes.length} researchers ·{" "}
                  {network.data.data.edges.length} collaboration links
                </p>
                <p className="mt-1 text-xs">
                  Network data is available from your verified publication
                  collaborations.
                </p>
              </div>
            ) : (
              <EmptyBlock
                title="No collaboration links yet"
                text="Connections appear once verified publications have shared internal authors."
              />
            )}
          </section>
        </aside>
        <form
          className="panel panel-pad"
          onSubmit={form.handleSubmit((values) => {
            setServerError("");
            update.mutate(values);
          })}
        >
          <h2 className="font-serif text-xl font-bold text-slate-900">
            Academic details
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            This information is visible with your researcher profile.
          </p>
          {serverError && (
            <div className="mt-4">
              <ErrorBlock message={serverError} />
            </div>
          )}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Designation</label>
              <input className="field" {...form.register("designation")} />
              <p className="error">
                {form.formState.errors.designation?.message}
              </p>
            </div>
            <div>
              <label className="label">Affiliation</label>
              <input className="field" {...form.register("affiliation")} />
              <p className="error">
                {form.formState.errors.affiliation?.message}
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Research interests</label>
              <input
                className="field"
                placeholder="e.g. data science, information security"
                {...form.register("interests")}
              />
              <p className="help">
                Comma-separated tags; duplicates are removed by the server.
              </p>
            </div>
            <div>
              <label className="label">Homepage URL</label>
              <input
                className="field"
                placeholder="https://…"
                {...form.register("homepageUrl")}
              />
              <p className="error">
                {form.formState.errors.homepageUrl?.message}
              </p>
            </div>
            <div>
              <label className="label">ORCID iD</label>
              <input
                className="field"
                placeholder="0000-0000-0000-0000"
                {...form.register("orcidId")}
              />
              <p className="error">{form.formState.errors.orcidId?.message}</p>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Google Scholar ID</label>
              <input className="field" {...form.register("googleScholarId")} />
            </div>
          </div>
          <button className="btn-primary mt-6" disabled={update.isPending}>
            {update.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save profile
          </button>
          {data.homepageUrl && (
            <a
              className="btn-quiet ml-2"
              href={data.homepageUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="h-4 w-4" />
              Visit homepage
            </a>
          )}
        </form>
      </div>
    </div>
  );
}
