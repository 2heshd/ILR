export function normalizeClassCode(value:string){return value.trim().replace(/\s+/g,'').toLowerCase();}
export function validClassCode(value:string){return /^[a-z0-9]{6,24}$/.test(normalizeClassCode(value));}
export function classInviteLink(origin:string,code:string){if(!validClassCode(code))throw new Error('Invalid class code');return new URL('/#join='+encodeURIComponent(normalizeClassCode(code)),origin).href;}
export function inviteCodeFromHash(hash:string){const code=new URLSearchParams(hash.replace(/^#/, '')).get('join')??'';return validClassCode(code)?normalizeClassCode(code):'';}
