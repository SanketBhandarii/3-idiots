"use client";
import { useParams } from "next/navigation";
import { AuthGate } from "@/components/shell/AuthGate";
import { WorkspaceScreen } from "@/features/workspace/WorkspaceScreen";

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  return (
    <AuthGate>
      <WorkspaceScreen key={workspaceId} workspaceId={workspaceId} />
    </AuthGate>
  );
}
