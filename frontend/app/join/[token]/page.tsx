"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { UsersThree } from "@phosphor-icons/react";
import { sharingApi } from "@/lib/api";
import { AuthGate } from "@/components/shell/AuthGate";
import { ErrorState, LoadingBlock } from "@/components/ui/states";
import { toast } from "@/lib/toast";

function Join() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    sharingApi
      .join(token)
      .then((r) => {
        toast.success("You joined the workspace", { description: `Role: ${r.role}` });
        router.replace(`/w/${r.workspace_id}`);
      })
      .catch(setError);
  }, [token, router]);
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
