"use client";

import { useEffect } from "react";

export default function PrintActions() {
  useEffect(() => {
    const timer = window.setTimeout(() => window.print(), 350);
    return () => window.clearTimeout(timer);
  }, []);

  return <div className="print-actions">
    <button type="button" onClick={() => window.print()}>Print this worksheet</button>
    <button type="button" onClick={() => window.close()}>Close</button>
  </div>;
}
