"use client";

import { useEffect, useState } from "react";

type Props = {
  onFinish: () => void;
};

const RESPONSES = [
  {
    title: "The system trains recall, not recognition.",
    body: "It starts at your current level and places most practice just above it. That keeps the work challenging enough to create growth without making every session overwhelming. Your level can move from 1 through 4 as your comprehension becomes consistently strong.",
  },
  {
    title: "Vocabulary appears when memory needs it.",
    body: "The course begins directly with Unit 1 and is organized into 35 weeks. Starting a week activates only its words, and no more than 25 new items arrive on the first day; the rest are released gradually. Repeated spellings are skipped. A spaced-repetition scheduler then changes each word’s next review using accuracy and recall speed: fast, correct recall earns a longer interval, while errors and slow recall bring the word back sooner. You can still add personal words or exchange cards and review history with Anki.",
  },
  {
    title: "Reading and listening are memory-first.",
    body: "Reading is timed, then the passage is locked before you answer. Listening records repeat count and whether you revealed the transcript. Answers are scored for main idea, detail, inference, and discourse—not just exact wording. Practice difficulty and study time shift toward the weaker skill while vocabulary and speaking keep a protected minimum.",
  },
  {
    title: "Real material stays connected to its source.",
    body: "You can add short Persian news, government, economics, policy, or security excerpts. The app keeps the title, publisher, date, link, topic, genre, register, source status, estimated level, and extracted target vocabulary. Only a short copyright-safe excerpt is stored; the original source remains linked.",
  },
  {
    title: "Speaking practice measures what text can support.",
    body: "Three-minute connected responses train organization, task completion, grammar, vocabulary, and transcript-based fluency. Browser speech recognition can capture Persian, and you can correct its transcript before grading. The app does not pretend a transcript can measure pronunciation.",
  },
  {
    title: "Progress is evidence, not a streak.",
    body: "The app tracks reviews, accuracy, recall time, lapses, difficult words, comprehension scores, listening behavior, and speaking attempts across the full 35-week course. Reading, listening, and speaking each begin at Level 1, and you can change any one of them whenever you want. It also compares performance by source, genre, and register. History saves locally, can sync across devices, and can exchange words and review history with Anki without replacing either scheduler.",
  },
] as const;

export default function Onboarding({ onFinish }: Props) {
  const [step, setStep] = useState(0);
  const [started, setStarted] = useState(false);
  const [question, setQuestion] = useState("How do I use this program?");
  const [typedText, setTypedText] = useState("");
  const current = RESPONSES[step];
  const phrase = started ? `${current.title}\n\n${current.body}` : "Want Persian to finally feel natural?";

  useEffect(() => {
    setTypedText("");
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setTypedText(phrase.slice(0, index));
      if (index >= phrase.length) window.clearInterval(timer);
    }, started ? 10 : 34);
    return () => window.clearInterval(timer);
  }, [phrase, started]);

  function askGuide() {
    if (!question.trim()) return;
    setStarted(true);
  }

  return <main className="onboarding-shell">
    <section className="onboarding-window">
      <div className="onboarding-top"><span className="window-dots">● ● ●</span><span>Getting started</span><button onClick={onFinish}>Skip</button></div>
      <div className={`onboarding-stage ${started ? "chat" : "intro"}`}>
        {!started ? <section className="onboarding-copy"><h1 aria-label={phrase}>{typedText}<i className="typing-cursor" /></h1></section> : <div className="guide-conversation">
          <div className="user-chat-message"><span>You</span><p>{question}</p></div>
          {RESPONSES.slice(0, step).map((response) => <article className="guide-message" key={response.title}><h2>{response.title}</h2><p>{response.body}</p></article>)}
          <article className="guide-message current"><p className="typing-response" aria-label={phrase}>{typedText}<i className="typing-cursor" /></p></article>
        </div>}
      </div>
      <div className="onboarding-bottom">
        {!started ? <label className="onboarding-composer"><span className="composer-label">You</span><input autoFocus value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") askGuide(); }} aria-label="Message to guide"/><button onClick={askGuide} aria-label="Send message">Send <kbd>↵</kbd></button></label> : <>
          <span className="guide-count">{step + 1} / {RESPONSES.length}</span>
          <div className="onboarding-actions">
            {step > 0 && <button onClick={() => setStep((value) => value - 1)}>Back</button>}
            <button className="chat-send" onClick={() => step === RESPONSES.length - 1 ? onFinish() : setStep((value) => value + 1)}><span>{step === RESPONSES.length - 1 ? "Enter app" : "Continue"}</span><kbd>↵</kbd></button>
          </div>
        </>}
      </div>
    </section>
  </main>;
}
