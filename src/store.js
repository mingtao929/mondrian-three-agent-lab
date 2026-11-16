import {DatabaseSync} from 'node:sqlite';import {mkdirSync} from 'node:fs';import {dirname} from 'node:path';
export class Store{
 constructor(path){if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});this.db=new DatabaseSync(path);this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,state TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,session TEXT NOT NULL,at INTEGER NOT NULL,role TEXT NOT NULL,type TEXT NOT NULL,payload TEXT NOT NULL,snapshot TEXT NOT NULL); CREATE INDEX IF NOT EXISTS events_session_seq ON events(session,seq);');}
 save(s){this.db.prepare('INSERT INTO sessions VALUES(?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state').run(s.id,JSON.stringify(s));}
 load(id){const r=this.db.prepare('SELECT state FROM sessions WHERE id=?').get(id);return r?JSON.parse(r.state):null;}
 listSessions(){return this.db.prepare('SELECT state FROM sessions ORDER BY rowid DESC').all().map(r=>JSON.parse(r.state));}
 historyStats(){return new Map(this.db.prepare("SELECT session,COUNT(*) AS eventCount,MAX(at) AS lastEventAt,MAX(CASE WHEN type IN ('stop','timeout') THEN at ELSE NULL END) AS stoppedAt,SUM(CASE WHEN type='service_interruption' THEN 1 ELSE 0 END) AS interruptionCount FROM events GROUP BY session").all().map(r=>[r.session,r]));}
 record(s,role,type,payload){const {tokens,ownerId,processed,events,...full}=s;full.messages=s.messages.slice(-100);let snapshot=full;
  if(['mcp_input','mcp_output','mcp_rejected','agent_turn_input','agent_turn_result'].includes(type)){
   const previous=this.db.prepare('SELECT seq,snapshot FROM events WHERE session=? ORDER BY seq DESC LIMIT 1').get(s.id);
   if(previous){const prior=JSON.parse(previous.snapshot),ref=prior.$ref??previous.seq,base=prior.$ref?JSON.parse(this.db.prepare('SELECT snapshot FROM events WHERE session=? AND seq=?').get(s.id,ref).snapshot):prior;
    if(['levels','practices','messages'].every(k=>JSON.stringify(full[k])===JSON.stringify(base[k]))){const {levels,practices,messages,...metadata}=full;snapshot={$ref:ref,...metadata};}
   }
  }
  this.db.exec('BEGIN');try{this.save(s);this.db.prepare('INSERT INTO events(session,at,role,type,payload,snapshot) VALUES(?,?,?,?,?,?)').run(s.id,Date.now(),role,type,JSON.stringify(payload),JSON.stringify(snapshot));this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}}
 events(id){return this.db.prepare('SELECT seq,at,role,type,payload FROM events WHERE session=? ORDER BY seq').all(id).map(e=>({...e,payload:JSON.parse(e.payload)}));}
 snapshot(id,seq){const r=this.db.prepare('SELECT snapshot,at FROM events WHERE session=? AND seq=?').get(id,seq);if(!r)return null;const {$ref,...metadata}=JSON.parse(r.snapshot);if(!$ref)return {...metadata,recordedAt:r.at};const base=this.db.prepare('SELECT snapshot FROM events WHERE session=? AND seq=?').get(id,$ref);if(!base)throw Error('回放快照引用缺失');return {...JSON.parse(base.snapshot),...metadata,recordedAt:r.at};}
 researchEvents(id){return this.db.prepare("SELECT seq,at,role,type,payload,json_extract(snapshot,'$.phase') AS phase,json_extract(snapshot,'$.level') AS level,json_extract(snapshot,'$.practiceIndex') AS practiceIndex FROM events WHERE session=? ORDER BY seq").all(id).map(e=>({...e,payload:JSON.parse(e.payload),practiceIndex:e.practiceIndex?JSON.parse(e.practiceIndex):null}));}
 deleteSession(id){this.db.exec('BEGIN');try{this.db.prepare('DELETE FROM events WHERE session=?').run(id);const result=this.db.prepare('DELETE FROM sessions WHERE id=?').run(id);this.db.exec('COMMIT');return result.changes===1;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 close(){this.db.close();}
}
