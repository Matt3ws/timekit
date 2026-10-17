import { StatusChip } from "@/components/status-chip";
import type { ProjectStatus } from "@/db/schema";

interface ProjectStatusBadgeProps {
  status: ProjectStatus;
  className?: string;
}

/** A project's status as a tinted chip (thin wrapper over {@link StatusChip}). */
export const ProjectStatusBadge = ({ status, className }: ProjectStatusBadgeProps): React.JSX.Element => (
  <StatusChip kind="project" status={status} className={className} />
);
