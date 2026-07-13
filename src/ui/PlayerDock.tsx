import { TempoStepper } from './TempoStepper';
import { TransportBar } from './TransportBar';
import { ControlTabs } from './ControlTabs';

// The dock is the popover's positioning context (position: relative in CSS),
// which is what lets ControlTabs overlay its panel instead of pushing rows.
export function PlayerDock() {
  return (
    <div className="dock">
      <TempoStepper />
      <TransportBar />
      <ControlTabs />
    </div>
  );
}
