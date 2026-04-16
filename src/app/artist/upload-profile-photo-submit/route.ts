import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePrisma } from "@/lib/prisma";
import { ARTIST_DASHBOARD_HREF } from "@/lib/safeRedirect";
import { storeProfileImage } from "@/lib/profileAssetStorage";
import { absoluteServerRedirectUrl } from "@/lib/publicSeo";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

function redirectTo(path: string) {
  return NextResponse.redirect(absoluteServerRedirectUrl(path));
}

async function readNamedImageFile(
  formData: FormData,
  fieldName: string,
): Promise<{ buf: Buffer; type: string } | { error: string }> {
  const file = formData.get(fieldName);
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return { error: "missing_file" };
  }
  const blob = file as File;
  const type = (blob.type || "").split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
  const buf = Buffer.from(await blob.arrayBuffer());
  return { buf, type };
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectTo(`${ARTIST_DASHBOARD_HREF}?profileError=uploadMissing`);
  }

  const session = await getSession();
  if (!session || session.kind !== "musician") {
    return redirectTo("/login/musician?next=%2Fartist");
  }
  const musicianId = session.musicianId;

  const read = await readNamedImageFile(formData, "artistUploadProfile");
  if ("error" in read) {
    return redirectTo(`${ARTIST_DASHBOARD_HREF}?profileError=uploadMissing`);
  }

  const stored = await storeProfileImage(read.buf, read.type, `artist/${musicianId}/profile-${Date.now()}`);
  if (!stored.ok) {
    return redirectTo(`${ARTIST_DASHBOARD_HREF}?profileError=upload_${stored.error}`);
  }

  await requirePrisma().musicianUser.update({
    where: { id: musicianId },
    data: { imageUrl: stored.publicUrl },
  });
  revalidatePath(ARTIST_DASHBOARD_HREF);
  return redirectTo(`${ARTIST_DASHBOARD_HREF}?profile=imageUploaded`);
}
