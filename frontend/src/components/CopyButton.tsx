import { useState } from "react";

interface Props {
  text: string;
  label?: string;
}

/** Small icon-only button that copies `text` to the clipboard — used
 * anywhere a URL is called out for the user to paste elsewhere (e.g. a
 * broker's suppression wizard) instead of having to select it by hand out
 * of a paragraph of text. */
export function CopyButton({ text, label = "Copy to clipboard" }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail (permissions, insecure context) — this is a
      // convenience feature, so fail silently rather than show an alarming
      // error; the user can still select/copy the text manually.
    }
  };

  return (
    <button
      type="button"
      className="copy-btn"
      onClick={handleCopy}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied!" : label}
    >
      {copied ? (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            d="M3 8.5 6.5 12 13 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M3 10.5V3.5A1.5 1.5 0 0 1 4.5 2h7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
