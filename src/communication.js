export const CHAT_COOLDOWN_MS=10000;
export function chatKey(text){return String(text).normalize('NFKC').toLowerCase().replace(/−/g,'-').replace(/[\p{P}\p{Z}\s]/gu,c=>c==='-'||c==='.'?c:'');}
export function duplicateChat(s,role,text){const key=chatKey(text);return s.messages.filter(m=>m.role===role&&m.phase===s.phase&&m.level===s.level).slice(-12).some(m=>chatKey(m.text)===key);}
export function completedRole(s,role){return s.phase==='practice'&&s.practiceIndex[role]===4||s.phase==='playing'&&s.ready[role];}
export function conversationTrigger(s,role){
 const last=s.messages.filter(m=>m.role!==role&&m.phase===s.phase&&m.level===s.level).at(-1);
 return [s.phase,s.level,s.boardRevision||0,last?.time||0,last?.text||''].join(':');
}
