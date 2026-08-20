"use client";

import { useEffect, useState } from "react";
import type { ComprehensionGrade, PassageQuestion } from "@/lib/types";

type Completion = {
  answers: string[];
  grade: ComprehensionGrade;
  gradingMode: "ai" | "self";
};

type Props = {
  kind: "reading" | "listening";
  sourceText: string;
  questions: PassageQuestion[];
  ilrEstimate: number;
  listensCount?: number;
  transcriptRevealed?: boolean;
  disabled?: boolean;
  onComplete: (result: Completion) => void;
};

function emptyGrade(score: number): ComprehensionGrade {
  return {
    overallScore: score,
    detailScore: score,
    inferenceScore: score,
    discourseScore: score,
    mainIdeaScore: score,
    answers: [],
    summary: "Self-scored because automatic grading was unavailable.",
    failureTypes: [],
  };
}

export default function ComprehensionGrader({
  kind,
  sourceText,
  questions,
  ilrEstimate,
  listensCount,
  transcriptRevealed,
  disabled,
  onComplete,
}: Props) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));
  const [grade, setGrade] = useState<ComprehensionGrade | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selfScore, setSelfScore] = useState(70);

  useEffect(() => {
    setAnswers(questions.map(() => ""));
    setGrade(null);
    setError("");
  }, [questions]);

  async function submit() {
    if (disabled || busy || !questions.length) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          sourceText,
          questions,
          answers,
          ilrEstimate,
          listensCount,
          transcriptRevealed,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Automatic grading failed.");
      const result = data as ComprehensionGrade;
      setGrade(result);
      onComplete({ answers, grade: result, gradingMode: "ai" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Automatic grading failed.");
    } finally {
      setBusy(false);
    }
  }

  function saveSelfScore() {
    const result = emptyGrade(selfScore);
    setGrade(result);
    onComplete({ answers, grade: result, gradingMode: "self" });
  }

  return <div className="grader">
    <h2>Comprehension check</h2>
    <p className="muted">Answer from memory. Meaning matters more than wording. Submit once when finished.</p>

    <div className="answer-list">
      {questions.map((question, index) => <label className="answer-question" key={`${question.type}-${index}`}>
        <span className="muted">{index + 1} · {question.type}</span>
        <strong>{question.question}</strong>
        <textarea
          className="answer-textarea"
          rows={3}
          value={answers[index] ?? ""}
          onChange={(event) => setAnswers((current) => current.map((answer, i) => i === index ? event.target.value : answer))}
          disabled={Boolean(grade)}
          placeholder="Type your answer in English…"
        />
        {grade?.answers?.find((item) => item.questionIndex === index) && <div className="answer-feedback">
          <strong>{grade.answers.find((item) => item.questionIndex === index)!.score}%</strong>
          <span>{grade.answers.find((item) => item.questionIndex === index)!.feedback}</span>
        </div>}
      </label>)}
    </div>

    {!grade && <div className="row">
      <button className="primary" onClick={submit} disabled={busy || disabled || answers.some((answer) => !answer.trim())}>
        {busy ? "Grading…" : "Submit for automatic grading"}
      </button>
      {answers.some((answer) => !answer.trim()) && <span className="muted">Answer every question first.</span>}
    </div>}

    {error && !grade && <div className="fallback-box">
      <strong>Automatic grading unavailable</strong>
      <span className="muted">{error}</span>
      <label className="score">
        <div className="row spread"><span>Quick self-score</span><strong>{selfScore}%</strong></div>
        <input type="range" min="0" max="100" step="5" value={selfScore} onChange={(event) => setSelfScore(Number(event.target.value))}/>
      </label>
      <button className="secondary" onClick={saveSelfScore}>Save self-score instead</button>
    </div>}

    {grade && <div className="grade-summary">
      <div className="grade-metrics">
        <span><small>overall</small><strong>{grade.overallScore}%</strong></span>
        <span><small>detail</small><strong>{grade.detailScore}%</strong></span>
        <span><small>inference</small><strong>{grade.inferenceScore}%</strong></span>
        <span><small>discourse</small><strong>{grade.discourseScore}%</strong></span>
      </div>
      <p>{grade.summary}</p>
      {!!grade.failureTypes?.length && <p className="muted">Detected: {grade.failureTypes.map((item) => item.replace("_", " / ")).join(" · ")}</p>}
      {grade.recommendedRepair && <p><strong>Next repair:</strong> {grade.recommendedRepair}</p>}
    </div>}
  </div>;
}
