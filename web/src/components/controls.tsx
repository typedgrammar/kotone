// Small controls more than one screen uses.

import { For } from "solid-js";

/** macOS-style segmented control */
export function Segmented<T extends string>(props: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div class="inline-flex rounded-lg bg-hover p-0.5">
      <For each={props.options}>
        {([v, label]) => (
          <button
            class="rounded-md px-2.5 py-0.5 text-[12px] text-fg-2"
            classList={{ "bg-elev text-fg! shadow-[0_1px_2px_rgba(0,0,0,0.14)]": props.value === v }}
            onClick={() => props.onChange(v)}
          >
            {label}
          </button>
        )}
      </For>
    </div>
  );
}
