import test from 'node:test';import assert from 'node:assert/strict';import ExcelJS from 'exceljs';
import {createSession} from '../src/engine.js';import {researchWorkbook} from '../src/research-xlsx.js';
test('MCP engine actions and public chat retain the research Excel behavior labels',async()=>{
 const s=createSession();s.startedAt=1000;
 const events=[
  {at:2000,role:'A',type:'mcp_input',phase:'playing',level:0,payload:{tool:'submit_puzzle_turn'}},
  {at:2100,role:'A',type:'mcp_action',phase:'playing',level:0,payload:{action:{type:'move',pieceId:'A1',dx:1,dy:0},message:'我的线索'}},
  {at:2200,role:'A',type:'mcp_output',phase:'playing',level:0,payload:{result:{status:'executed'}}},
  {at:2300,role:'A',type:'mcp_action',phase:'playing',level:0,payload:{action:{type:'submit'},message:null}}
 ];
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(await researchWorkbook(s,events));const rows=wb.getWorksheet('Sheet1').getSheetValues().slice(2);
 assert.deepEqual(rows.map(r=>r[3]),['To[A]move[X]steps','[A]send[B]','Submitanswer']);assert.equal(rows[1][5],'我的线索');assert.ok(rows.every(r=>r[11]));
});
