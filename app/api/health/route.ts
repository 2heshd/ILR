import {NextResponse} from 'next/server';
export const dynamic='force-dynamic';
export function GET(){return NextResponse.json({ok:true,product:'cursos',release:process.env.VERCEL_GIT_COMMIT_SHA??process.env.SUITE_RELEASE_SHA??'local',schemaVersion:'014',contentVersion:'course-v1',checkedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});}
