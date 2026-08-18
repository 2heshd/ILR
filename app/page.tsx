"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizePersian, parseWeeklyInput } from "@/lib/persian";
import type { LexicalItem, ReviewEvent, StudyState } from "@/lib/types";

const STORAGE_KEY = "ilr-persian-v1";
const ADVANCED_POOL = [
  ["تحریم", "sanction"], ["مذاکره", "negotiation"], ["توافق", "agreement"], ["قطعنامه", "resolution"],
  ["حاکمیت", "sovereignty / governance"], ["ائتلاف", "coalition"], ["بودجه", "budget"], ["تورم", "inflation"],
  ["نرخ بهره", "interest rate"], ["صادرات", "exports"], ["واردات", "imports"], ["بازدارندگی", "deterrence"],
  ["دیپلماسی", "diplomacy"], ["سیاست‌گذاری", "policymaking"], ["قوه قضائیه", "judiciary"], ["اصلاحات", "reforms"],
  ["همه‌پرسی", "referendum"], ["انتخابات", "election"], ["نماینده", "representative"], ["منافع ملی", "national interests"],
] as const;

const emptyState: StudyState = { weekNumber: 1, words: [], reviews: [] };

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nextDue(rating: ReviewEvent["rating"], reviews: number) {
  const mins = rating === "again" ? 10 : rating === "hard" ? 60 * 8 : rating === "good" ? 60 * 24 * Math.max(1, reviews) : 60 * 24 * Math.max(3, reviews * 3);
  return new Date(Date.now() + mins * 60_000).toISOString();
}

export default function Home() {
  const [state, setState] = useState<StudyState>(emptyState);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [showIntake, setShowIntake] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) setState(JSON.parse(raw));
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, loaded]);

  const now = Date.now();
  const due = useMemo(() => state.words.filter((w) => new Date(w.dueAt).getTime() <= now), [state.words, now]);
  const current = due[reviewIndex % Math.max(1, due.length)];
  const mature = state.words.filter((w) => w.reviews >= 4 && w.correct / Math.max(1, w.reviews) >= .8).length;
  const retention = state.reviews.length ? Math.round(100 * state.reviews.filter((r) => r.correct).length / state.reviews.length) : 0;
  const latencies = state.reviews.map((r) => r.responseMs).sort((a,b)=>a-b);
  const median = latencies.length ? Math.round(latencies[Math.floor(latencies.length / 2)] / 100) / 10 : 0;

  function importWeek() {
    const parsed = parseWeeklyInput(input);
    const existing = new Set(state.words.map((w) => w.normalizedForm));
    const incoming = parsed.filter((w) => !existing.has(normalizePersian(w.displayForm)));
    const advanced = ADVANCED_POOL.filter(([fa]) => !existing.has(normalizePersian(fa))).slice(0, 5);
    const makeWord = (fa: string, definition: string | undefined, romanization: string | undefined, sourceType: LexicalItem["sourceType"]): LexicalItem => ({
      id: uid("word"), displayForm: fa, normalizedForm: normalizePersian(fa), definition, romanization, sourceType,
      sourceWeek: state.weekNumber, introducedAt: new Date().toISOString(), reviews: 0, correct: 0, lapses: 0,
      dueAt: new Date().toISOString(),
    });
    const newWords = [
      ...incoming.map((w) => makeWord(w.displayForm, w.definition, w.romanization, "dli")),
      ...advanced.map(([fa, en]) => makeWord(fa, en, undefined, "system_advanced")),
    ];
    setState((s) => ({ ...s, words: [...s.words, ...newWords] }));
    setInput(""); setShowIntake(false); setReviewIndex(0);
  }

  function rate(rating: ReviewEvent["rating"]) {
    if (!current) return;
    const responseMs = Date.now() - startRef.current;
    const correct = rating !== "again";
    const event: ReviewEvent = { id: uid("review"), lexicalItemId: current.id, reviewedAt: new Date().toISOString(), correct, responseMs, rating, modality: "visual" };
    setState((s) => ({
      ...s,
      reviews: [...s.reviews, event],
      words: s.words.map((w) => w.id !== current.id ? w : {
        ...w,
        reviews: w.reviews + 1,
        correct: w.correct + (correct ? 1 : 0),
        lapses: w.lapses + (correct ? 0 : 1),
        medianResponseMs: responseMs,
        dueAt: nextDue(rating, w.reviews + 1),
      }),
    }));
    setRevealed(false); setReviewIndex((i) => i + 1); startRef.current = Date.now();
  }

  if (!loaded) return <main>Loading…</main>;

  return <main>
    <header>
      <div><div className="muted">36-week Persian adaptive system</div><h1>ILR // Today</h1></div>
      <div className="row"><span className="pill">R4</span><span className="pill">L3+</span><span className="pill">S2</span><button className="primary" onClick={() => setShowIntake(!showIntake)}>+ Weekly words</button></div>
    </header>

    {showIntake && <section className="card" style={{marginBottom:14}}>
      <h2>Week {state.weekNumber} intake</h2>
      <p className="muted">Paste one item per line. Optional format: Persian — definition — romanization. Five advanced government/politics/economics items are added automatically.</p>
      <textarea value={input} onChange={(e)=>setInput(e.target.value)} placeholder={"کارمند — employee — kārmand\nبازداشت کردن — to arrest — bāzdāsht kardan"}/>
      <div className="row" style={{marginTop:10}}><button className="primary" onClick={importWeek}>Import + add 5 advanced</button><button className="secondary" onClick={()=>setShowIntake(false)}>Cancel</button></div>
    </section>}

    <section className="grid">
      <div className="card span-3"><div className="muted">Due now</div><div className="stat">{due.length}</div></div>
      <div className="card span-3"><div className="muted">Total words</div><div className="stat">{state.words.length}</div></div>
      <div className="card span-3"><div className="muted">Retention</div><div className="stat">{retention}%</div></div>
      <div className="card span-3"><div className="muted">Median recall</div><div className="stat">{median ? `${median}s` : "—"}</div></div>

      <div className="card span-7">
        <div className="row" style={{justifyContent:"space-between"}}><h2>Timed recognition</h2><span className="pill">goal ≤ 5 sec</span></div>
        {current ? <>
          <div className="fa" style={{fontSize:44, margin:"26px 0 18px"}}>{current.displayForm}</div>
          {!revealed ? <button className="primary" onClick={()=>setRevealed(true)}>Reveal meaning</button> : <>
            <div style={{fontSize:20, marginBottom:6}}>{current.definition || "No definition yet"}</div>
            {current.romanization && <div className="muted">{current.romanization}</div>}
            <div className="row" style={{marginTop:18}}>
              <button className="secondary" onClick={()=>rate("again")}>Again</button>
              <button className="secondary" onClick={()=>rate("hard")}>Hard</button>
              <button className="primary" onClick={()=>rate("good")}>Good</button>
              <button className="secondary" onClick={()=>rate("easy")}>Easy</button>
            </div>
          </>}
        </> : <p className="muted">No vocabulary is due. Import this week's list or come back when reviews mature.</p>}
      </div>

      <div className="card span-5">
        <h2>Skill guardrail</h2>
        <p className="muted">Flashcards never consume the whole session. Context work stays mandatory.</p>
        {[['Listening',35],['Reading',35],['Lexical',20],['Speaking',10]].map(([name,val]) => <div key={name as string} style={{marginTop:16}}><div className="row" style={{justifyContent:'space-between'}}><span>{name}</span><span className="muted">{val}%</span></div><div className="progress"><div style={{width:`${val}%`}}/></div></div>)}
      </div>

      <div className="card span-8">
        <div className="row" style={{justifyContent:"space-between"}}><h2>Vocabulary memory</h2><span className="muted">{mature} mature</span></div>
        <div className="word-list">{state.words.slice(-12).reverse().map((w)=><div className="word" key={w.id}><strong>{w.displayForm}</strong><span>{w.definition || "definition pending"} · W{w.sourceWeek} · {w.reviews} reviews</span></div>)}</div>
      </div>

      <div className="card span-4">
        <h2>Today queue</h2>
        <div className="queue">
          <div className="queue-item"><span>Vocabulary retrieval</span><strong>{due.length}</strong></div>
          <div className="queue-item"><span>Reading lab</span><span className="pill">next</span></div>
          <div className="queue-item"><span>Listening lab</span><span className="pill">next</span></div>
          <div className="queue-item"><span>Speaking maintenance</span><span className="pill">10%</span></div>
        </div>
      </div>
    </section>
  </main>;
}
