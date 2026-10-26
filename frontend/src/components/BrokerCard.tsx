import { AUTOMATION_LEVEL_COLOR, BROKER_AUTOMATION, BROKER_LABELS, type BrokerName } from "../types";

interface Props {
  broker: BrokerName;
  selected: boolean;
  onToggle: () => void;
}

export function BrokerCard({ broker, selected, onToggle }: Props) {
  const automation = BROKER_AUTOMATION[broker];

  return (
    <button
      type="button"
      className={`broker-card ${selected ? "broker-card--selected" : ""}`}
      onClick={onToggle}
      aria-pressed={selected}
    >
      <div className="broker-card__top">
        <span className="broker-card__name">{BROKER_LABELS[broker]}</span>
        <span className="broker-card__check">{selected ? "✓" : ""}</span>
      </div>
      <span
        className="broker-card__badge"
        style={{ background: AUTOMATION_LEVEL_COLOR[automation.level], color: "#06140c" }}
      >
        {automation.label}
      </span>
      <p className="broker-card__detail">{automation.detail}</p>
    </button>
  );
}
