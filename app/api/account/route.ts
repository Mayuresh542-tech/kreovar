import { deleteOwnAccount } from "@/app/lib/server/accountDeletion";
import { withBoundedRequest } from "@/app/lib/server/boundedRequest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export const DELETE = withBoundedRequest(deleteOwnAccount);
