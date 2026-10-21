import { useCallback, type CSSProperties } from "react";
import { useBbNavigate, useRealtime } from "@bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAsync, useLinearRpc } from "./rpc.js";
import { StateGlyph } from "./StateGlyph.js";
import { toneClass } from "../src/select/tone.js";
import { chrome, usePanelChrome } from "../src/panel-chrome.js";

/**
 * The thread header's Linear controls.
 *
 * The header row is 48px chrome with 28px controls and the host clamps
 * anything taller, so each state draws a single compact control:
 *
 *  - **Bound** — state-toned dot + identifier. Click opens the issue panel.
 *  - **Suggested** — the fuzzy rung's candidate, drawn as a question
 *    ("LIN-3?") in muted chrome. Click accepts, which *is* a manual binding
 *    and records itself as one.
 *  - **Nothing to say** — the project filter selector, so the top bar is
 *    always a working entry point to the Linear panel.
 */
export function HeaderChip({ threadId, isCompactViewport }: { threadId: string; projectId: string | null; isCompactViewport: boolean }) {
  const rpc = useLinearRpc();
  const navigate = useBbNavigate();

  const state = useAsync(
    useCallback(async () => rpc.call("threadIssue", { threadId }), [rpc, threadId]),
    [threadId],
  );
  useRealtime("linear:data", state.reload);

  if (state.status !== "ready") return null;
  const { binding, suggestion, activeCount, historyCount, alternates } = state.value;

  if (binding !== null) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className={`${toneClass(binding.tone)} h-7 gap-1.5 px-2 text-xs font-medium`}
        style={binding.glyph.color === null ? undefined : ({ "--bbl": binding.glyph.color } as CSSProperties)}
        aria-label={`${activeCount} active Linear issues. Current issue ${binding.identifier} · ${binding.title} — ${binding.stateName}, bound via ${binding.origin}${binding.provenance === null ? "" : ` — ${binding.provenance}`}`}
        onClick={() => {
          navigate.openThreadPanel({ actionId: "issue", title: binding.identifier });
        }}
      >
        {/* The same shaped glyph the panel's rows draw — one state language
            everywhere, so "half-filled ring" means started in the header
            exactly as it does in the list. */}
        <StateGlyph tone={binding.tone} glyph={binding.glyph} />
        <span className="bbl-text">{binding.identifier}</span>
        {activeCount > 1 && <span className="text-muted-foreground">+{activeCount - 1}</span>}
      </Button>
    );
  }

  if (suggestion !== null || alternates.length > 0 || historyCount > 0) {
    return (
      <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
        aria-label={historyCount > 0 ? `Linear: no current issue, ${historyCount} previous issues` : "Review suggested Linear issues"}
        onClick={() => navigate.openThreadPanel({ actionId: "issue", title: "Linear work" })}>
        {historyCount > 0 ? `Linear · ${historyCount} previous` : `${suggestion?.identifier ?? alternates[0]?.identifier}?`}
      </Button>
    );
  }

  return <ProjectSelect compact={isCompactViewport} />;
}

/**
 * The top bar's Linear project filter.
 *
 * Shared with the panel through the panel-chrome store: choosing a project
 * here narrows the panel's issue list and opens it, and choosing projects in
 * the panel's filter menu updates this trigger live — both surfaces read and
 * write the same module store.
 */
function ProjectSelect({ compact }: { compact: boolean }) {
  const rpc = useLinearRpc();
  const navigate = useBbNavigate();
  const panelState = usePanelChrome();

  const facets = useAsync(
    useCallback(async () => rpc.call("facets", { team: null }), [rpc]),
    [],
  );

  const projects = facets.status === "ready" ? facets.value.projects : [];
  const selected = panelState.filters.projectIds;

  // The mirror has no projects yet (first sync in flight): a plain entry
  // point is all a selector with nothing to choose could be.
  if (projects.length === 0) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="bbl-header-panel h-7 w-7 justify-center px-0 text-muted-foreground"
        aria-label="Open the Linear panel"
        onClick={() => {
          navigate.toPluginPanel("linear", { subPath: "" });
        }}
      >
        <Icon name="Layers" className="size-4" aria-hidden />
      </Button>
    );
  }

  return (
    <Select
      value={selected.length === 1 ? selected[0] : "all"}
      onValueChange={(value) => {
        chrome.setFilters({
          ...panelState.filters,
          projectIds: value === "all" ? [] : [value],
        });
        navigate.toPluginPanel("linear", { subPath: "" });
      }}
    >
      <SelectTrigger
        aria-label="Linear project filter"
        className={`h-7 w-auto gap-1 border-none bg-transparent px-2 text-xs shadow-none ${compact ? "max-w-40" : "max-w-60 md:max-w-72"}`}
      >
        <Icon name="Layers" className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <SelectValue placeholder="Linear project" />
      </SelectTrigger>
      <SelectContent>
        {/* Names the multi-select state honestly: the trigger shows "N
            projects" when the panel's filter menu holds more than one, and
            this row is where that state is read. */}
        <SelectItem value="all">
          {selected.length > 1 ? `${selected.length} projects` : "All projects"}
        </SelectItem>
        {projects.map((project) => (
          <SelectItem key={project.id} value={project.id}>
            {project.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
