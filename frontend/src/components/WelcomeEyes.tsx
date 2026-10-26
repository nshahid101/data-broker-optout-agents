import { useEffect, useState } from "react";
import { Eyes3D } from "./Eyes3D";
import "./WelcomeEyes.css";

const TAGLINE = "Find it. Flag it. Make it disappear.";
const CAPTION = "Scanning the open web for what's already out there.";

type Phase = "welcome" | "tagline";

// Timeline (ms): a beat on "Welcome", a smooth fade into the tagline, then
// hand off to the parent so it can fade the whole overlay away.
const WELCOME_HOLD_MS = 2200;
const TAGLINE_HOLD_MS = 1600;

interface Props {
  onDone: () => void;
}

export function WelcomeEyes({ onDone }: Props) {
  const [phase, setPhase] = useState<Phase>("welcome");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("tagline"), WELCOME_HOLD_MS);
    const t2 = setTimeout(onDone, WELCOME_HOLD_MS + TAGLINE_HOLD_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="welcome-eyes">
      <div className="welcome-eyes__canvas-wrap">
        <Eyes3D />
      </div>

      <div className="welcome-eyes__text-stage">
        <div className={`welcome-eyes__welcome-wrap ${phase === "tagline" ? "is-gone" : ""}`}>
          <h2 className="welcome-eyes__welcome">Welcome</h2>
          <p className="welcome-eyes__caption">{CAPTION}</p>
        </div>
        <p className={`welcome-eyes__tagline ${phase === "tagline" ? "is-visible" : ""}`}>{TAGLINE}</p>
      </div>
    </div>
  );
}
