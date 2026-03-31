import { venueArtistLogoutAction } from "@/app/logout/venueArtistLogoutAction";

type Props = {
  className?: string;
  label?: string;
};

export function LogoutVenueArtistButton({ className, label = "Sign out" }: Props) {
  return (
    <form action={venueArtistLogoutAction} className="inline">
      <button type="submit" className={className}>
        {label}
      </button>
    </form>
  );
}
