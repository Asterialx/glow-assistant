import type { UiWidget } from "../../lib/types";
import {
  ChecklistWidget,
  FlashcardDeckWidget,
  FlashcardWidget,
  ProgressWidget,
} from "./ChecklistWidget";
import { BiomarkerTableWidget } from "./BiomarkerTableWidget";

interface Props {
  widgets: UiWidget[];
  onChange?: (widget: UiWidget) => void;
}

/** Inline UI only — never routed to the Artifacts panel. */
export function InlineWidgets({ widgets, onChange }: Props) {
  if (!widgets.length) return null;

  return (
    <div className="space-y-0" data-inline-ui-root>
      {widgets.map((w) => {
        switch (w.widget_type) {
          case "checklist":
            return <ChecklistWidget key={w.id} widget={w} onChange={onChange} />;
          case "progress":
            return <ProgressWidget key={w.id} widget={w} />;
          case "flashcards":
            return <FlashcardDeckWidget key={w.id} widget={w} onChange={onChange} />;
          case "flashcard":
            return <FlashcardWidget key={w.id} widget={w} onChange={onChange} />;
          case "biomarker_table":
            return <BiomarkerTableWidget key={w.id} widget={w} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
