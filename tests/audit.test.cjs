const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function harness(){
 const calls={renders:0,toasts:[],navigation:[]};
 const c={console,Date,Blob,num:n=>String(n),money:n=>String(n),escapeHtml:v=>String(v),
   render:()=>calls.renders++,toast:s=>calls.toasts.push(s),goto:s=>calls.navigation.push(s),
   addLog:(t,message)=>{c.state.logs.push({tx:t.id,text:message})},
   makeTx:(id,ref,status,extra)=>({id,ref,status,events:[],...extra}),
   sampleLines:()=>[{product:'PET',qty:6500,unitPrice:5000,po:true}]};
 vm.createContext(c);
 for(const file of ['import.js','audit.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),c,{filename:file});
 const api=vm.runInContext('({parseImportCsv,analyzeImport,importSampleRows,importEmpty,auditInitialState,auditImportEntry,readImportFile,commitImport,auditSeedEntries,auditSyncPO,simulateMasterProductSync,recordAudit})',c);
 c.state={transactions:[],logs:[],seq:5,import:api.importEmpty(),audit:api.auditInitialState(),page:'import',search:'',filter:'all'};
 return {c,api,calls};
}
test('failed import creates one parent entry with invalid and blocked PO detail',()=>{
 const {api}=harness();
 const rows=api.importSampleRows();rows[2][10]='100';
 const parsed=api.parseImportCsv(rows.map(r=>r.join(',')).join('\n'));
 const analysis=api.analyzeImport(parsed,[]);
 const e=api.auditImportEntry('bad.csv',analysis);
 assert.equal(e.total,2);assert.equal(e.success,0);assert.equal(e.failed,1);assert.equal(e.blocked,1);
 assert.equal(e.items[0].disposition,'blocked');assert.equal(e.items[1].disposition,'invalid');
 assert.equal(e.items[1].row,3);assert.ok(e.items[1].errors.some(x=>x.includes('Total sortir')));
});
test('one valid multi-PO batch creates exactly one top-level audit entry',()=>{
 const {c,api}=harness();
 const parsed=api.parseImportCsv(api.importSampleRows().map(r=>r.join(',')).join('\n'));
 c.state.import={...api.importEmpty(),filename:'two.csv',parsed,analysis:api.analyzeImport(parsed,[])};
 const initial=c.state.audit.entries.length;
 api.commitImport();
 assert.equal(c.state.transactions.length,2);assert.equal(c.state.audit.entries.length,initial+1);
 assert.equal(c.state.audit.entries[0].kind,'po_import');
 assert.equal(c.state.audit.entries[0].success,2);assert.equal(c.state.audit.entries[0].items.length,2);
 assert.equal(c.state.audit.entries[0].items[0].txId,'TRX-005');
 assert.equal(c.state.audit.entries[0].items[0].po,undefined);
 assert.equal(c.state.logs.length,2); // Per-PO timeline retained; Audit Log is batch level.
});
test('invalid upload logs a failed attempt without inserting any valid rows',async()=>{
 const {c,api}=harness();
 const rows=api.importSampleRows();rows[2][10]='100';
 const raw=rows.map(r=>r.join(',')).join('\n');
 const file={name:'bad.csv',size:raw.length,text:async()=>raw};
 const count=c.state.audit.entries.length;
 await api.readImportFile(file);
 assert.equal(c.state.audit.entries.length,count+1);
 assert.equal(c.state.audit.entries[0].outcome,'failed');
 assert.equal(c.state.transactions.length,0);
});
test('master-product sync records success and failure counts at parent level',()=>{
 const {c,api}=harness();
 const count=c.state.audit.entries.length;
 api.simulateMasterProductSync();
 assert.equal(c.state.audit.entries.length,count+1);
 assert.equal(c.state.audit.entries[0].success,4);
 assert.equal(c.state.audit.entries[0].failed,1);
 assert.equal(c.state.audit.entries[0].items.length,5);
 assert.ok(c.state.audit.entries[0].items.at(-1).errors.length);
});
test('each PO sync attempt adds an auditable success/failure operation',()=>{
 const {c,api}=harness();
 const t={id:'TRX-005',ref:'REF',vendor:'PT Test',date:'2026-09-23',lot:'LOT',gross:10,tare:5,
  lines:[{product:'PET',qty:5,unitPrice:2,po:true}],po:null};
 const before=c.state.audit.entries.length;
 api.auditSyncPO(t,false,'HTTP 503');
 t.po='PO-DEMO-0043';api.auditSyncPO(t,true,'Retry berhasil');
 assert.equal(c.state.audit.entries.length,before+2);
 assert.equal(c.state.audit.entries[0].success,1);
 assert.equal(c.state.audit.entries[1].failed,1);
 assert.equal(c.state.audit.entries[0].items[0].po,'PO-DEMO-0043');
});
