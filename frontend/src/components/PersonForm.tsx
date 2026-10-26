import { useState } from "react";
import { BrokerCard } from "./BrokerCard";
import { ManualStepCard } from "./ManualStepCard";
import { MANUAL_DISCOVERY_BROKERS, MANUAL_OPTOUT_BROKERS, type BrokerName, type Person } from "../types";

const ALL_BROKERS: BrokerName[] = ["spokeo", "whitepages", "beenverified"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = Partial<Record<"fullName" | "city" | "state" | "email", string>>;

interface Props {
  onSubmit: (person: Person, brokers: BrokerName[]) => void;
  submitting: boolean;
}

export function PersonForm({ onSubmit, submitting }: Props) {
  const [fullName, setFullName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [knownUrls, setKnownUrls] = useState<Partial<Record<BrokerName, string[]>>>({});
  const [selectedBrokers, setSelectedBrokers] = useState<BrokerName[]>(ALL_BROKERS);
  const [errors, setErrors] = useState<FieldErrors>({});

  // Email is only ever used as the contact address for an automated opt-out
  // submission (Spokeo/Whitepages) — a run targeting only brokers whose
  // opt-out is entirely manual (currently just BeenVerified) never reads
  // it at all, so don't force the user to supply one for that case.
  const needsEmail = selectedBrokers.some((b) => !MANUAL_OPTOUT_BROKERS.includes(b));

  const toggleBroker = (broker: BrokerName) => {
    setSelectedBrokers((prev) =>
      prev.includes(broker) ? prev.filter((b) => b !== broker) : [...prev, broker]
    );
  };

  const validate = (brokers: BrokerName[]): FieldErrors => {
    const next: FieldErrors = {};
    if (!fullName.trim()) next.fullName = "Enter your full name.";
    if (!city.trim()) next.city = "Enter your city.";
    if (!state.trim()) next.state = "Enter your state.";
    if (brokers.some((b) => !MANUAL_OPTOUT_BROKERS.includes(b))) {
      if (!email.trim()) {
        next.email = "Email is required for Spokeo/Whitepages.";
      } else if (!EMAIL_RE.test(email.trim())) {
        next.email = "That doesn't look like a valid email address.";
      }
    }
    return next;
  };

  const buildPerson = (urls: Partial<Record<BrokerName, string[]>>): Person => ({
    full_name: fullName,
    city,
    state,
    phone: phone || undefined,
    email: email.trim() || undefined,
    known_listing_urls: urls,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate(selectedBrokers);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    onSubmit(buildPerson(knownUrls), selectedBrokers);
  };

  /** Saving a manual-step listing URL starts the run immediately rather
   * than making the user also fill in every other broker's manual step
   * (if they selected several) before anything happens — if they picked
   * multiple vendors and only pasted in one link, hitting Save there is
   * enough to kick things off. Brokers whose manual URL is still missing
   * just won't have anything to discover yet; the user can paste theirs
   * in later and it'll run again.
   *
   * Appends rather than replaces — if the user finds more than one
   * listing that might be them on a given broker, every URL they save
   * gets its own candidate in the review list, instead of the second
   * paste silently overwriting the first. */
  const handleManualUrlSaved = (broker: BrokerName, url: string) => {
    const nextUrls = { ...knownUrls, [broker]: [...(knownUrls[broker] ?? []), url] };
    setKnownUrls(nextUrls);
    if (submitting) return;

    const validationErrors = validate(selectedBrokers);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    onSubmit(buildPerson(nextUrls), selectedBrokers);
  };

  return (
    <form className="person-form" onSubmit={handleSubmit} noValidate>
      <h2>Find &amp; remove your listings</h2>
      <p className="person-form__intro">
        Enter your own information — this tool only ever acts on your own behalf.
        <span className="person-form__required-note"> * required</span>
      </p>

      <div className="person-form__grid">
        <label>
          Full name *
          <input
            className={errors.fullName ? "has-error" : ""}
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: undefined }));
            }}
          />
          {errors.fullName && <span className="field-error">{errors.fullName}</span>}
        </label>
        <label>
          City *
          <input
            className={errors.city ? "has-error" : ""}
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              if (errors.city) setErrors((prev) => ({ ...prev, city: undefined }));
            }}
          />
          {errors.city && <span className="field-error">{errors.city}</span>}
        </label>
        <label>
          State *
          <input
            className={errors.state ? "has-error" : ""}
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              if (errors.state) setErrors((prev) => ({ ...prev, state: undefined }));
            }}
            maxLength={2}
          />
          {errors.state && <span className="field-error">{errors.state}</span>}
        </label>
        <label>
          Phone
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label>
          Email {needsEmail && "*"}
          <input
            type="email"
            className={errors.email ? "has-error" : ""}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
            }}
          />
          {!needsEmail && <span className="person-form__field-note">Not needed for BeenVerified-only</span>}
          {errors.email && <span className="field-error">{errors.email}</span>}
        </label>
      </div>

      <div className="person-form__brokers">
        <span className="mono-label">Which brokers to run</span>
        <div className="broker-card-grid">
          {ALL_BROKERS.map((broker) => (
            <BrokerCard
              key={broker}
              broker={broker}
              selected={selectedBrokers.includes(broker)}
              onToggle={() => toggleBroker(broker)}
            />
          ))}
        </div>
      </div>

      {selectedBrokers
        .filter((broker) => MANUAL_DISCOVERY_BROKERS.includes(broker))
        .map((broker) => (
          <ManualStepCard
            key={broker}
            broker={broker}
            kind="discovery"
            savedUrls={knownUrls[broker]}
            saving={submitting}
            onUrlSaved={(url) => handleManualUrlSaved(broker, url)}
          />
        ))}

      {Object.keys(errors).length > 0 && (
        <p className="field-error field-error--summary">
          Please fix the highlighted field{Object.keys(errors).length > 1 ? "s" : ""} above before continuing.
        </p>
      )}

      <button type="submit" className="btn btn--red" disabled={submitting}>
        {submitting ? "Searching..." : "Find my listings"}
      </button>
    </form>
  );
}
