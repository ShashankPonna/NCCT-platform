import { getProfilePhotoUrl } from "@ncct/api-client";
import { useEffect, useState } from "react";

// Profile photo (docs/DECISIONS.md #77). The header and the Settings avatar
// each call this hook; after an upload, Settings calls announceProfilePhoto
// so the header swaps to the new picture without a reload. Any failure
// (offline, no photo) just leaves the url null and callers show
// DEFAULT_AVATAR.
const PHOTO_EVENT = "edudisha:profile-photo";

// Shown wherever a user has no uploaded photo.
export const DEFAULT_AVATAR = "/assets/default_avatar.png";

export function announceProfilePhoto(url: string | null) {
  window.dispatchEvent(new CustomEvent<string | null>(PHOTO_EVENT, { detail: url }));
}

export function useProfilePhoto(accessToken: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    getProfilePhotoUrl(accessToken)
      .then((res) => {
        if (!cancelled) setUrl(res.url);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    const onPhoto = (e: Event) => setUrl((e as CustomEvent<string | null>).detail);
    window.addEventListener(PHOTO_EVENT, onPhoto);
    return () => window.removeEventListener(PHOTO_EVENT, onPhoto);
  }, []);

  return url;
}
