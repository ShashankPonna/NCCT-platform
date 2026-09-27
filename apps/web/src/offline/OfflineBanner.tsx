import { useLocale } from "../i18n/LocaleContext.js";
import { useOnlineStatus } from "./network.js";

const MESSAGES = {
  en: "You're offline — showing saved content. Changes will sync when you reconnect.",
  hi: "आप ऑफ़लाइन हैं — सहेजी गई सामग्री दिख रही है। दोबारा जुड़ने पर बदलाव सिंक होंगे।",
};

export function OfflineBanner() {
  const online = useOnlineStatus();
  const { locale } = useLocale();
  if (online) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-[#b45309] px-4 py-1.5 text-center text-xs font-semibold text-white"
    >
      <span className="material-symbols-outlined text-base" aria-hidden="true">
        cloud_off
      </span>
      {MESSAGES[locale]}
    </div>
  );
}
