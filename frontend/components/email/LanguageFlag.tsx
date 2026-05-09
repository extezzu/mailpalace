const FLAGS: Record<string, string> = {
  en: "🇬🇧",
  ru: "🇷🇺",
  uk: "🇺🇦",
  da: "🇩🇰",
  de: "🇩🇪",
  fr: "🇫🇷",
  es: "🇪🇸",
  pl: "🇵🇱",
  zh: "🇨🇳",
  ja: "🇯🇵",
  ko: "🇰🇷",
  pt: "🇵🇹",
  it: "🇮🇹",
  nl: "🇳🇱",
  sv: "🇸🇪",
  no: "🇳🇴",
};

interface Props {
  lang: string | null;
  hideFor?: string;
}

export function LanguageFlag({ lang, hideFor = "en" }: Props) {
  if (!lang || lang === hideFor) return null;
  const flag = FLAGS[lang.toLowerCase()];
  if (!flag) return null;
  return (
    <span className="inline-block text-small leading-none" title={`Language: ${lang}`}>
      {flag}
    </span>
  );
}
