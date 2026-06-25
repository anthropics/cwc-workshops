import { handle, rejectCrossSite } from "@/app/api/api-route";
import { runDeployment } from "@/lib/preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const { id } = await params;
  return handle("deployments.run", () => runDeployment(id));
}
