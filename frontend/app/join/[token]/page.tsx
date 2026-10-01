"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { UsersThree } from "@phosphor-icons/react";
import { sharingApi } from "@/lib/api";
import { AuthGate } from "@/components/shell/AuthGate";
import { ErrorState, LoadingBlock } from "@/components/ui/states";
import { toast } from "@/lib/toast";

function Join() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    sharingApi
      .join(token)
      .then((r) => {
        // The role may have changed (viewer → editor): drop cached workspace data so my_role comes from the server.
        void qc.invalidateQueries({ queryKey: ["graph", r.workspace_id] });
        void qc.invalidateQueries({ queryKey: ["workspaces"] });
        toast.success("You joined the workspace", { description: `Role: ${r.role}` });
        router.replace(`/w/${r.workspace_id}`);
      })
      .catch(setError);
  }, [token, router, qc]);
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <UsersThree size={48} weight="duotone" className="mx-auto text-purple" />
      {error ? <ErrorState className="mt-6" error={error} title="This invite link does not work" /> : <LoadingBlock label="Joining workspace…" />}
    </div>
  );
}

export default function JoinPage() {
  return <AuthGate><Join /></AuthGate>;
}
