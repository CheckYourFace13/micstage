"use client";

import { useMemo, useState } from "react";

type Props = {
  formId: string;
  label: string;
  className?: string;
};

export default function OnPremiseReserveButton({ formId, label, className }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const disabled = status === "loading";
  const buttonClassName = useMemo(() => {
    return (
      className ??
      `h-9 rounded-md px-3 text-sm font-semibold text-black hover:brightness-110 bg-[rgb(var(--om-neon))] disabled:opacity-60`
    );
  }, [className]);

  async function fillAndSubmit() {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) {
      setStatus("error");
      setErrorMessage("Could not find reservation form.");
      return;
    }

    const latInput = form.querySelector<HTMLInputElement>('input[name="clientLat"]');
    const lngInput = form.querySelector<HTMLInputElement>('input[name="clientLng"]');
    if (!latInput || !lngInput) {
      setStatus("error");
      setErrorMessage("Missing location fields.");
      return;
    }

    if (!navigator.geolocation) {
      setStatus("error");
      setErrorMessage("Geolocation is not supported by this browser.");
      return;
    }

    setStatus("loading");
    setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        latInput.value = String(pos.coords.latitude);
        lngInput.value = String(pos.coords.longitude);
        setStatus("idle");
        setErrorMessage(null);
        form.requestSubmit();
      },
      (err) => {
        setStatus("error");
        if (err.code === err.PERMISSION_DENIED) {
          setErrorMessage("Location access was blocked. Allow location for this site in your browser settings, then try again.");
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setErrorMessage("Could not read your position. Try again outdoors or with Wi‑Fi/cell enabled.");
        } else if (err.code === err.TIMEOUT) {
          setErrorMessage("Location request timed out. Move closer to a window or try again.");
        } else {
          setErrorMessage("Could not verify your location for this reservation.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60_000 }
    );
  }

  return (
    <div className="flex flex-col items-start">
      <button type="button" className={buttonClassName} onClick={fillAndSubmit} disabled={disabled}>
        {status === "loading" ? "Getting location..." : label}
      </button>
      {status === "error" && errorMessage ? (
        <div className="mt-1 text-[11px] text-amber-200/90">{errorMessage}</div>
      ) : null}
    </div>
  );
}

