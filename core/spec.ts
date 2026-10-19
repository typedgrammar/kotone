// The annotation spec handed to agents: the guide (docs/annotation-guide.md) plus generated
// appendices for classes, steps and grammar ids. `kotone spec` and the in-app agent share it.

import { CLASS_INFO, STEP_IDS, STEP_INFO } from "./conjugate.ts";
import { CATEGORIES, GRAMMAR } from "./grammar.ts";

export function specText(guide: string): string {
  const steps = STEP_IDS.map((s) => `| \`${s}\` | ${STEP_INFO[s].label} | ${STEP_INFO[s].zh} |`).join("\n");
  const classes = Object.entries(CLASS_INFO)
    .map(([k, v]) => `\`${k}\` ${v}`)
    .join(" · ");
  const grammar = CATEGORIES.map(
    (cat) =>
      `### ${cat.zh}\n` +
      GRAMMAR.filter((g) => g.category === cat.id)
        .map((g) => `- \`${g.id}\` ${g.level} ${g.title} — ${g.zh}`)
        .join("\n"),
  ).join("\n\n");
  return `${guide.trim()}\n\n---\n\n## 附录 A：lemma.class\n\n${classes}\n\n## 附录 B：steps（按顺序链式应用）\n\n| step | 名称 | 含义 |\n|---|---|---|\n${steps}\n\n## 附录 C：语法点 id\n\n${grammar}\n`;
}
