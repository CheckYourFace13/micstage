import { revalidatePath } from "next/cache";

/** After admin edits to instances, slots, or bookings, refresh public venue page and common admin lists. */
export function revalidateVenueSlugAndAdminLists(slug: string | null | undefined): void {
  revalidatePath("/internal/admin/events");
  revalidatePath("/internal/admin/bookings");
  revalidatePath("/internal/admin/performer-history");
  if (slug) {
    revalidatePath(`/venues/${slug}`);
  }
}
