type Cue={word:string;start:number;end:number};
export function captionsCoverText(text:string,timings:Cue[]):boolean;
export function reconcileCaptionSpellings(text:string,timings:Cue[]):Cue[];
export function nextCaption(timings:Cue[],previousIndex:number,now:number):{index:number;word:string|null};
