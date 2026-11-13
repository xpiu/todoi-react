import { useNavigate } from "@tanstack/react-router";

/** Go to a project as it opens by default: no filters, saved view or open item carried over. */
export function useOpenProject() {
  const navigate = useNavigate();
  return (projectId: string) => void navigate({ to: "/p/$projectId", params: { projectId }, search: {} });
}
