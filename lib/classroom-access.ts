// Verified account ID for 2heshd. Never authorize using an editable username.
// The database independently enforces this restriction (migration 013).
export const CLASSROOM_OWNER_ID='eef89588-eab7-4543-9dad-e1b8a209553f';
export function canManageClasses(user:{id:string}|null|undefined){return user?.id===CLASSROOM_OWNER_ID;}
