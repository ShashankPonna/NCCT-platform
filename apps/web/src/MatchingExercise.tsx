import type { MatchingExerciseConfig } from "@ncct/shared-types";
import { useMemo, useState } from "react";
import "./MatchingExercise.css";

interface MatchingExerciseProps {
  config: MatchingExerciseConfig;
}

// Deterministic shuffle so the right-hand column isn't in the same order as
// the left (which would make the exercise trivial), but also doesn't reshuffle
// on every React re-render, which would move options out from under the user.
function shuffle<T>(items: T[]): T[] {
  return items
    .map((item, i) => ({ item, key: (i * 7919 + 104729) % items.length }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item);
}

export function MatchingExercise({ config }: MatchingExerciseProps) {
  const [selectedTerm, setSelectedTerm] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);

  const matches = useMemo(() => shuffle(config.pairs.map((p) => p.match)), [config.pairs]);
  const correctFor = useMemo(
    () => Object.fromEntries(config.pairs.map((p) => [p.term, p.match])),
    [config.pairs],
  );

  const allAnswered = config.pairs.every((p) => answers[p.term]);
  const score = config.pairs.filter((p) => answers[p.term] === correctFor[p.term]).length;

  function pickMatch(match: string) {
    if (!selectedTerm) return;
    setAnswers((prev) => {
      // A match can only be used once — clear any other term holding it.
      const next: Record<string, string> = {};
      for (const [term, value] of Object.entries(prev)) {
        if (value !== match) next[term] = value;
      }
      next[selectedTerm] = match;
      return next;
    });
    setSelectedTerm(null);
    setChecked(false);
  }

  function reset() {
    setAnswers({});
    setSelectedTerm(null);
    setChecked(false);
  }

  return (
    <div className="matching-exercise">
      {config.prompt && <p className="matching-prompt">{config.prompt}</p>}

      <div className="matching-columns">
        <ul>
          {config.pairs.map((pair) => {
            const answer = answers[pair.term];
            const isCorrect = checked && answer === correctFor[pair.term];
            const isWrong = checked && answer !== undefined && !isCorrect;
            return (
              <li key={pair.term}>
                <button
                  type="button"
                  className={[
                    "matching-term",
                    selectedTerm === pair.term ? "selected" : "",
                    isCorrect ? "correct" : "",
                    isWrong ? "wrong" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelectedTerm(pair.term)}
                >
                  <strong>{pair.term}</strong>
                  <span>{answer ?? "tap, then pick a match →"}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <ul>
          {matches.map((match) => (
            <li key={match}>
              <button
                type="button"
                className="matching-option"
                disabled={!selectedTerm}
                onClick={() => pickMatch(match)}
              >
                {match}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="matching-actions">
        <button type="button" onClick={() => setChecked(true)} disabled={!allAnswered}>
          Check answers
        </button>
        <button type="button" onClick={reset}>
          Reset
        </button>
        {checked && (
          <span className="matching-score">
            {score} / {config.pairs.length} correct
          </span>
        )}
      </div>
    </div>
  );
}
