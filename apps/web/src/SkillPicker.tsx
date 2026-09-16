import type { Skill } from "@ncct/shared-types";
import { useLocale, type Locale } from "./i18n/LocaleContext.js";

interface SkillPickerProps {
  skills: Skill[];
  selectedIds: Set<string>;
  onToggle: (skillId: string) => void;
}

interface SkillPickerText {
  empty: string;
  otherCategory: string;
}

const content: Record<Locale, SkillPickerText> = {
  en: {
    empty: "No skills in the taxonomy yet.",
    otherCategory: "Other",
  },
  hi: {
    empty: "अभी तक वर्गीकरण में कोई कौशल नहीं है।",
    otherCategory: "अन्य",
  },
};

// Grouped checkbox multi-select against the skills taxonomy (P1 Skill-Gap
// Analysis, docs/PRD.md §6.11) — reused wherever a caller needs to pick a
// set of skills: EmployerDashboard.tsx (job postings) and
// AdminProgrammeManager.tsx (programme-granted skills). Skills with no
// category collect under "Other" rather than being dropped or crashing the
// group-by.
export function SkillPicker({ skills, selectedIds, onToggle }: SkillPickerProps) {
  const { locale } = useLocale();
  const t = content[locale];

  if (skills.length === 0) {
    return <p className="skill-picker-empty">{t.empty}</p>;
  }

  const byCategory = new Map<string, Skill[]>();
  for (const skill of skills) {
    const key = skill.category ?? t.otherCategory;
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(skill);
  }

  return (
    <div className="skill-picker">
      {[...byCategory.entries()].map(([category, categorySkills]) => (
        <fieldset key={category} className="skill-picker-group">
          <legend>{category}</legend>
          {categorySkills.map((skill) => (
            <label key={skill.id} className="skill-checkbox">
              <input
                type="checkbox"
                checked={selectedIds.has(skill.id)}
                onChange={() => onToggle(skill.id)}
              />
              {skill.name}
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

// Read-only display of an already-tagged skill set — the "All jobs" list's
// chip row, and reusable anywhere else a tagged set just needs showing.
export function SkillChips({ skills }: { skills: Skill[] }) {
  if (skills.length === 0) return null;
  return (
    <span className="skill-chip-row">
      {skills.map((skill) => (
        <span key={skill.id} className="skill-chip">
          {skill.name}
        </span>
      ))}
    </span>
  );
}
