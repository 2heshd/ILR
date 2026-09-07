"use client";

import { useEffect, useState, type ReactNode } from 'react';

export default function InspectSelection({children,disabled=false}:{children:ReactNode;disabled?:boolean}) {
  const [menu,setMenu]=useState<{text:string;x:number;y:number}|null>(null);
  useEffect(()=>{
    const close=()=>setMenu(null);
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')close();};
    window.addEventListener('click',close);window.addEventListener('scroll',close,true);window.addEventListener('keydown',escape);
    return()=>{window.removeEventListener('click',close);window.removeEventListener('scroll',close,true);window.removeEventListener('keydown',escape);};
  },[]);
  const single=menu && !/\s/.test(menu.text);
  const base=process.env.NEXT_PUBLIC_SYNAPTX_URL??(process.env.NODE_ENV==='production'?'https://synapt-x.app':'http://localhost:3002');
  return <div onContextMenu={event=>{
    if(disabled)return;
    const selection=window.getSelection();
    const selected=selection && event.currentTarget.contains(selection.anchorNode) && event.currentTarget.contains(selection.focusNode)?selection.toString().trim():'';
    const word=(event.target as HTMLElement).closest<HTMLElement>('[data-inspect-word]')?.dataset.inspectWord;
    const text=selected||word||'';
    if(!text || /[•█]/.test(text))return;
    event.preventDefault();setMenu({text,x:Math.max(8,Math.min(event.clientX,window.innerWidth-260)),y:Math.max(8,Math.min(event.clientY,window.innerHeight-80))});
  }}>
    {children}
    {menu&&!disabled&&<div className="selection-inspect-menu" role="menu" style={{left:menu.x,top:menu.y}}>
      <a role="menuitem" href={`${base}/${single?'morphology':'syntax'}.html?${new URLSearchParams({[single?'word':'sentence']:menu.text,language:'fa'})}`} target="_blank" rel="noreferrer">Inspect {single?'morphology':'syntax'} ↗</a>
    </div>}
  </div>;
}
