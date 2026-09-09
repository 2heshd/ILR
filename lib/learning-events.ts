import type { SupabaseClient, User } from '@supabase/supabase-js';

export type SuiteProduct='cursos'|'synaptx'|'asl';
export type LearningSkill='vocabulary'|'reading'|'listening'|'speaking'|'morphology'|'syntax'|'verb'|'lexical_structure';
export type LearningEvent={
  id:string;
  occurredAt:string;
  product:SuiteProduct;
  eventType:string;
  sessionId?:string;
  sourceItemId?:string;
  targetLanguage:'fa'|'ar'|'ru';
  skill?:LearningSkill;
  linguisticConcept?:string;
  problemId?:string;
  interventionType?:string;
  interventionId?:string;
  relatedEventId?:string;
  correctness?:boolean;
  responseMs?:number;
  attemptNumber?:number;
  supportsUsed?:string[];
  sourceKind?:string;
  register?:string;
  difficulty?:number;
  courseWeek?:number;
  topic?:string;
  metadata?:Record<string,unknown>;
};

const EVENT_TYPE=/^[a-z][a-z0-9_]{1,63}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PRIVATE_METADATA_KEYS=/(answer|password|token|secret|passage|transcript|email|note|raw)/iu;
const bounded=(value:unknown,max:number)=>typeof value==='string'&&value.trim()?value.slice(0,max):undefined;
const uuid=(value:unknown)=>typeof value==='string'&&UUID.test(value)?value:undefined;

export function makeLearningEvent(input:Omit<LearningEvent,'id'|'occurredAt'> & Partial<Pick<LearningEvent,'id'|'occurredAt'>>):LearningEvent{
  if(!EVENT_TYPE.test(input.eventType))throw new Error('Invalid learning event type.');
  const candidateMetadata=Object.fromEntries(Object.entries(input.metadata??{}).filter(([key,value])=>!PRIVATE_METADATA_KEYS.test(key)&&['string','number','boolean'].includes(typeof value)).slice(0,32).map(([key,value])=>[key,typeof value==='string'?value.slice(0,500):value]));
  const metadata=JSON.stringify(candidateMetadata).length<=12000?candidateMetadata:{truncated:true};
  const parsedTime=Date.parse(input.occurredAt??'');
  const responseMs=Number.isFinite(input.responseMs)?Math.min(3600000,Math.max(0,Math.round(input.responseMs!))):undefined;
  const attemptNumber=Number.isFinite(input.attemptNumber)?Math.min(10000,Math.max(1,Math.round(input.attemptNumber!))):undefined;
  const difficulty=Number.isFinite(input.difficulty)?Math.min(1000,Math.max(-1000,Number(input.difficulty))):undefined;
  return {
    ...input,
    id:uuid(input.id)??crypto.randomUUID(),
    occurredAt:Number.isFinite(parsedTime)?new Date(parsedTime).toISOString():new Date().toISOString(),
    sessionId:uuid(input.sessionId),problemId:uuid(input.problemId),relatedEventId:uuid(input.relatedEventId),
    sourceItemId:bounded(input.sourceItemId,240),linguisticConcept:bounded(input.linguisticConcept,240),
    interventionType:bounded(input.interventionType,80),interventionId:bounded(input.interventionId,240),
    sourceKind:bounded(input.sourceKind,80),register:bounded(input.register,80),topic:bounded(input.topic,240),
    responseMs,attemptNumber,difficulty,
    supportsUsed:(input.supportsUsed??[]).filter(value=>typeof value==='string'&&value.trim()).slice(0,32).map(value=>value.slice(0,80)),
    metadata,
  };
}

export function learningEventRow(user:User,event:LearningEvent){
  return {
    id:event.id,user_id:user.id,occurred_at:event.occurredAt,product:event.product,event_type:event.eventType,
    session_id:event.sessionId??null,source_item_id:event.sourceItemId??null,target_language:event.targetLanguage,
    skill:event.skill??null,linguistic_concept:event.linguisticConcept??null,problem_id:event.problemId??null,
    intervention_type:event.interventionType??null,intervention_id:event.interventionId??null,related_event_id:event.relatedEventId??null,
    correctness:event.correctness??null,response_ms:event.responseMs??null,attempt_number:event.attemptNumber??null,
    supports_used:event.supportsUsed??[],source_kind:event.sourceKind??null,register:event.register??null,
    difficulty:event.difficulty??null,course_week:event.courseWeek??null,topic:event.topic??null,metadata:event.metadata??{},
  };
}

export async function appendLearningEvents(client:SupabaseClient,user:User,events:LearningEvent[]){
  if(!events.length)return true;
  for(let offset=0;offset<events.length;offset+=100){
    const {error}=await client.from('learning_events').upsert(events.slice(offset,offset+100).map(event=>learningEventRow(user,event)),{onConflict:'id',ignoreDuplicates:true});
    if(error?.code==='42P01'||error?.code==='PGRST205')return false;
    if(error)throw error;
  }
  return true;
}
