import {
  handleAdminGet,
  handleAdminPost,
} from "../../lib/admin-api-core";
import { requireAdminApi } from "../../lib/admin-auth";
import { rejectCrossOriginMutation } from "../../lib/request-security";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  return handleAdminGet();
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  return handleAdminPost(request);
}
