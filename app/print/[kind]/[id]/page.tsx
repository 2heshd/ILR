import { notFound } from "next/navigation";
import cycle from "@/data/curated-cycle.json";
import PrintActions from "./PrintActions";
import styles from "./page.module.css";

export function generateStaticParams() {
  return [
    ...cycle.passages.map((item) => ({ kind: "reading", id: item.id })),
    ...cycle.listeningItems.map((item) => ({ kind: "listening", id: item.id })),
  ];
}

export default async function PrintableWorksheet({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  const item = kind === "reading"
    ? cycle.passages.find((entry) => entry.id === id)
    : kind === "listening"
      ? cycle.listeningItems.find((entry) => entry.id === id)
      : undefined;
  if (!item) notFound();

  const text = "textFa" in item ? item.textFa : item.transcriptFa;
  const label = kind === "reading" ? "Reading report" : "Listening transcript";
  const sentences = text.split(/(?<=[.!؟!])\s+/).filter(Boolean);
  const englishQuestions: Record<string, string> = {
    main_idea: "What is the main idea of this report?",
    detail: "What important detail does the report give about the event?",
    inference: "What can you reasonably infer from the information in the report?",
    discourse: "How is the report organized?",
  };

  return <>
    <PrintActions />
    <article className={styles.sheet} lang="fa" dir="rtl">
      <header className={styles.header}>
        <div className={styles.meta}>GetCursos · {label} · ILR 1+ · {item.topic} · {item.genre}</div>
        <h1 className={styles.title}>{item.title}</h1>
      </header>
      <main>
        <section className={styles.persianText}>{sentences.map((sentence, index) => <p className={styles.sentence} key={index}>{sentence}</p>)}</section>
        <section className={styles.questions}>
          <h2 className={styles.heading}>Questions</h2>
          {item.questions.map((question, index) => <section className={styles.question} key={question.question}>
            <p><strong>{index + 1}.</strong> {englishQuestions[question.type]}</p>
          </section>)}
        </section>
        <section className={styles.notes}>
          <h2 className={styles.heading}>Notes</h2>
          <div className={styles.notesSpace} />
        </section>
      </main>
    </article>
  </>;
}
