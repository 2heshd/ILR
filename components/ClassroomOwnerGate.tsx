'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {getSupabaseClient} from '@/lib/supabase';
import {canManageClasses} from '@/lib/classroom-access';
export default function ClassroomOwnerGate({children}:{children:ReactNode}){
 const [allowed,setAllowed]=useState(false),[checked,setChecked]=useState(false);
 useEffect(()=>{const client=getSupabaseClient();let active=true;if(!client){setChecked(true);return;}
 const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{if(active){setAllowed(canManageClasses(session?.user));setChecked(true);}});
 void client.auth.getUser().then(({data})=>{if(active){setAllowed(canManageClasses(data.user));setChecked(true);}}).catch(()=>{if(active){setAllowed(false);setChecked(true);}});
 return()=>{active=false;subscription.unsubscribe();};},[]);
 if(!allowed)return <main className="classroom-app"><a href="/#account">Back to Cursos</a><p>{checked?'Classroom is only available to the designated teacher account.':'Checking classroom access…'}</p></main>;
 return children;
}
