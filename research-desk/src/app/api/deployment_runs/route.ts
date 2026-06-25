import { handle, queryParams } from "@/app/api/api-route";
import { listDeploymentRuns } from "@/lib/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle("deployment_runs.list", () => listDeploymentRuns(queryParams(request)));
}
