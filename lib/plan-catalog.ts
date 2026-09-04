import type {CourseVocabularyEntry} from './course.ts';
export function planCatalogTree(entries:CourseVocabularyEntry[]) {
  const units=new Map<string,Map<string,Map<string,CourseVocabularyEntry[]>>>();
  for(const entry of entries){
    const parts=entry.lesson.split(' - '),unit=parts[0],chapter=parts.length>2?parts[1]:'Lessons';
    if(!units.has(unit))units.set(unit,new Map());
    const chapters=units.get(unit)!;
    if(!chapters.has(chapter))chapters.set(chapter,new Map());
    const lessons=chapters.get(chapter)!;
    if(!lessons.has(entry.lesson))lessons.set(entry.lesson,[]);
    lessons.get(entry.lesson)!.push(entry);
  }
  const sort=<T,>(items:Map<string,T>)=>[...items].sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}));
  return sort(units).map(([label,chapters])=>({label,chapters:sort(chapters).map(([label,lessons])=>({label,lessons:sort(lessons).map(([label,entries])=>({label,entries})),entries:[...lessons.values()].flat()})),entries:[...chapters.values()].flatMap(lessons=>[...lessons.values()].flat())}));
}
