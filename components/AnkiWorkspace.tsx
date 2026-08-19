"use client";

import { useState } from "react";
import { easeToRating, exportAnkiTsv, invokeAnki, orderedFieldValues, parseAnkiText, type AnkiCardInfo, type AnkiNoteInfo, type AnkiReviewInfo, type AnkiReviewRow, type AnkiVocabularyRow } from "@/lib/anki";
import type { AnkiSettings, LexicalItem } from "@/lib/types";

type Props = {
  settings: AnkiSettings;
  words: LexicalItem[];
  onSettings: (settings: AnkiSettings) => void;
  onWords: (rows: AnkiVocabularyRow[]) => number;
  onReviews: (rows: AnkiReviewRow[]) => number;
};

function stripHtml(value: string) {
  const element = document.createElement("div");
  element.innerHTML = value;
  return (element.textContent || "").trim();
}

function fieldValue(fields: AnkiNoteInfo["fields"] | AnkiCardInfo["fields"], preferred: string[], fallbackIndex: number) {
  for (const name of preferred) if (fields[name]?.value) return stripHtml(fields[name].value);
  return stripHtml(orderedFieldValues(fields)[fallbackIndex]?.value ?? "");
}

export default function AnkiWorkspace({ settings, words, onSettings, onWords, onReviews }: Props) {
  const [mode, setMode] = useState<"connect" | "files" | null>(null);
  const [endpoint, setEndpoint] = useState(settings.endpoint);
  const [deckName, setDeckName] = useState(settings.deckName);
  const [apiKey, setApiKey] = useState("");
  const [decks, setDecks] = useState<string[]>([]);
  const [status, setStatus] = useState("Not connected");
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true);
    try {
      const version = await invokeAnki<number>(endpoint, "version", {}, apiKey);
      const availableDecks = await invokeAnki<string[]>(endpoint, "deckNames", {}, apiKey);
      setDecks(availableDecks);
      const selected = availableDecks.includes(deckName) ? deckName : (availableDecks[0] ?? deckName);
      setDeckName(selected);
      onSettings({ endpoint, deckName: selected, lastSyncAt: settings.lastSyncAt });
      setStatus(`Connected · AnkiConnect v${version} · ${availableDecks.length} decks`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not reach AnkiConnect.");
    } finally {
      setBusy(false);
    }
  }

  async function pullDeck() {
    if (!deckName) return;
    setBusy(true);
    try {
      const notes = await invokeAnki<number[]>(endpoint, "findNotes", { query: `deck:\"${deckName.replaceAll('"', '\\"')}\"` }, apiKey);
      const details = notes.length ? await invokeAnki<AnkiNoteInfo[]>(endpoint, "notesInfo", { notes }, apiKey) : [];
      const rows = details.map((note) => ({
        displayForm: fieldValue(note.fields, ["Front", "Persian", "Word", "Expression"], 0),
        definition: fieldValue(note.fields, ["Back", "English", "Definition", "Meaning"], 1) || undefined,
        romanization: fieldValue(note.fields, ["Romanization", "Transliteration", "Pronunciation"], 2) || undefined,
      })).filter((row) => row.displayForm);
      const added = onWords(rows);
      const lastSyncAt = new Date().toISOString();
      onSettings({ endpoint, deckName, lastSyncAt });
      setStatus(`Pulled ${details.length} notes · added ${added} new words`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Deck pull failed.");
    } finally {
      setBusy(false);
    }
  }

  async function pushWords() {
    if (!deckName || !words.length) return;
    setBusy(true);
    try {
      const notes = words.map((word) => ({
        deckName,
        modelName: "Basic",
        fields: { Front: word.displayForm, Back: [word.definition, word.romanization].filter(Boolean).join("<br>") },
        options: { allowDuplicate: false, duplicateScope: "deck" },
        tags: ["ilr-persian", `week-${word.sourceWeek}`],
      }));
      const result = await invokeAnki<Array<number | null>>(endpoint, "addNotes", { notes }, apiKey);
      const added = result.filter(Boolean).length;
      const lastSyncAt = new Date().toISOString();
      onSettings({ endpoint, deckName, lastSyncAt });
      setStatus(`Pushed ${added} missing notes · ${result.length - added} duplicates skipped`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Push failed. Confirm the Basic note type exists.");
    } finally {
      setBusy(false);
    }
  }

  async function pullReviews() {
    if (!deckName) return;
    setBusy(true);
    try {
      const cards = await invokeAnki<number[]>(endpoint, "findCards", { query: `deck:\"${deckName.replaceAll('"', '\\"')}\"` }, apiKey);
      const details = cards.length ? await invokeAnki<AnkiCardInfo[]>(endpoint, "cardsInfo", { cards }, apiKey) : [];
      const reviewMap = cards.length ? await invokeAnki<Record<string, AnkiReviewInfo[]>>(endpoint, "getReviewsOfCards", { cards: cards.map(String) }, apiKey) : {};
      const rows: AnkiReviewRow[] = [];
      details.forEach((card) => {
        const displayForm = fieldValue(card.fields, ["Front", "Persian", "Word", "Expression"], 0);
        (reviewMap[String(card.cardId)] ?? []).forEach((review) => rows.push({
          displayForm,
          externalId: `${card.cardId}-${review.id}`,
          reviewedAt: new Date(review.id).toISOString(),
          correct: review.ease > 1,
          responseMs: Math.max(0, review.time || 0),
          rating: easeToRating(review.ease),
        }));
      });
      const added = onReviews(rows);
      const lastSyncAt = new Date().toISOString();
      onSettings({ endpoint, deckName, lastSyncAt });
      setStatus(`Read ${rows.length} Anki reviews · imported ${added} new events`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Review sync failed.");
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    const rows = parseAnkiText(await file.text());
    const added = onWords(rows);
    setStatus(`Imported ${added} new words from ${file.name}`);
  }

  function exportFile() {
    const text = exportAnkiTsv(words.map((word) => ({ displayForm: word.displayForm, definition: word.definition, romanization: word.romanization })));
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "text/tab-separated-values;charset=utf-8" }));
    link.download = `ilr-persian-${new Date().toISOString().slice(0, 10)}.tsv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <section className="anki-workspace">
    {!mode && <div className="anki-overview">
      <span className="next-number">01</span>
      <h2>Keep your Anki deck.</h2>
      <p>Anki and this app work side by side. Your cards can move between them, and completed Anki reviews can count toward your progress here.</p>
      <div className="anki-capabilities">
        <div><span>Pull</span><p>Bring Persian cards from an Anki deck into your course vocabulary.</p></div>
        <div><span>Push</span><p>Send missing course words to Anki without creating duplicate notes.</p></div>
        <div><span>Track</span><p>Copy Anki review history into recall analytics, including accuracy and response time.</p></div>
        <div><span>Protect</span><p>Each app keeps its own scheduler. Sync never rewrites Anki scheduling data.</p></div>
      </div>
      <div className="row anki-paths"><button className="primary" onClick={() => setMode("connect")}>Connect Anki Desktop</button><button className="secondary" onClick={() => setMode("files")}>Use a file instead</button></div>
    </div>}

    {mode === "connect" && <div className="anki-connect-flow">
      <button className="back-link" onClick={() => setMode(null)}>← Back</button>
      <h2>Connect Anki Desktop</h2>
      <p className="muted">Install AnkiConnect once, keep Anki open, then test the local connection. Your API key stays on this screen and is not saved.</p>
      <ol className="anki-steps"><li>Install the AnkiConnect add-on in Anki Desktop.</li><li>Keep Anki open while using this page.</li><li>If blocked, add <code>http://localhost:3001</code> to <code>webCorsOriginList</code>.</li></ol>
      <div className="anki-connection-fields"><label>Endpoint<input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} /></label><label>API key (optional)<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" /></label></div>
      <div className="row"><button className="primary" onClick={connect} disabled={busy}>Test connection</button><span className="muted">{status}</span></div>
      {!!decks.length && <><label className="anki-deck-field">Deck<select value={deckName} onChange={(event) => { setDeckName(event.target.value); onSettings({ ...settings, endpoint, deckName: event.target.value }); }}><option value="">Choose a deck</option>{decks.map((deck) => <option key={deck}>{deck}</option>)}</select></label><div className="anki-actions"><button onClick={pullDeck} disabled={busy || !deckName}>Pull cards</button><button onClick={pushWords} disabled={busy || !deckName || !words.length}>Push missing words</button><button onClick={pullReviews} disabled={busy || !deckName}>Pull review history</button></div></>}
      {settings.lastSyncAt && <p className="muted">Last successful operation: {new Date(settings.lastSyncAt).toLocaleString()}</p>}
    </div>}

    {mode === "files" && <div className="anki-file-flow">
      <button className="back-link" onClick={() => setMode(null)}>← Back</button>
      <h2>Exchange a file</h2>
      <p>No add-on is needed. Import or export a CSV/TSV file with Front, Back, and Romanization columns. Headerless files use the same order.</p>
      <div className="row"><label className="file-button">Import CSV / TSV<input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={(event) => void importFile(event.target.files?.[0])} /></label><button className="secondary" onClick={exportFile} disabled={!words.length}>Export {words.length} words</button></div>
      <p className="muted">{status}</p>
    </div>}
  </section>;
}
