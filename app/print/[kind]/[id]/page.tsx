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

  return <>
    <PrintActions />
    <article className={styles.sheet} lang="fa" dir="rtl">
      <header className={styles.header}>
        <div className={styles.meta}>GetCursos · {label} · ILR 1+ · {item.topic} · {item.genre}</div>
        <h1 className={styles.title}>{item.title}</h1>
        <div className={styles.student}><span>Name</span><span>Date</span></div>
      </header>
      <main>
        <section className={styles.persianText}>{text}</section>
        <h2 className={styles.heading}>واژه‌های هدف</h2>
        <div className={styles.targets}>{item.targetWords.map((word) => <span key={word}>{word}</span>)}</div>
        <h2 className={styles.heading}>پرسش‌های درک مطلب</h2>
        {item.questions.map((question, index) => <section className={styles.question} key={question.question}>
          <p><strong>{index + 1}.</strong> {question.question}</p>
          <div className={styles.line} /><div className={styles.line} />
        </section>)}
        <section className={styles.notes}>
          <h2 className={styles.heading}>یادداشت‌ها</h2>
          {Array.from({ length: 10 }, (_, index) => <div className={styles.line} key={index} />)}
        </section>
        <p className={styles.footer}>Generated practice material · GetCursos two-week DLI/news cycle</p>
      </main>
    </article>
  </>;
}
