const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function harness(){
 const calls={renders:0,toasts:[],navigation:[]};
 const c={console,Date,Blob,atob,num:n=>String(n),money:n=>String(n),escapeHtml:v=>String(v),
   render:()=>calls.renders++,toast:s=>calls.toasts.push(s),goto:s=>calls.navigation.push(s),
   addLog:(t,message)=>{c.state.logs.push({tx:t.id,text:message})},
   makeTx:(id,ref,status,extra)=>({id,ref,status,events:[],...extra}),
   sampleLines:()=>[{product:'PET',qty:6500,unitPrice:5000,po:true}]};
 vm.createContext(c);
 for(const file of ['import-image.js','import.js','master.js','audit.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),c,{filename:file});
 const api=vm.runInContext('({parseImportCsv,analyzeImport,importSampleRows,importEmpty,auditInitialState,auditImportEntry,readImportFile,commitImport,auditSeedEntries,auditSyncPO,simulateOdooMasterUpdate,receiveOdooMasterEvent,masterInitialState,recordAudit})',c);
 c.state={transactions:[],logs:[],seq:5,import:api.importEmpty(),master:api.masterInitialState(),audit:api.auditInitialState(),page:'import',search:'',filter:'all'};
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
test('Odoo product event updates only the read-only mirror and records all results',()=>{
 const {c,api}=harness();
 const count=c.state.audit.entries.length;
 api.simulateOdooMasterUpdate('product');
 assert.equal(c.state.audit.entries.length,count+1);
 assert.equal(c.state.audit.entries[0].source,'Odoo 16 → Middleware (demo)');
 assert.equal(c.state.audit.entries[0].success,2);
 assert.equal(c.state.audit.entries[0].failed,1);
 assert.equal(c.state.audit.entries[0].items.length,3);
 assert.equal(c.state.master.products.length,5);
 assert.equal(c.state.master.products.find(x=>x.code==='PET').name,'PET Clear — updated in Odoo');
 assert.ok(c.state.audit.entries[0].items.at(-1).errors.length);
});
test('Odoo warehouse event also updates only the mirror and logs failed source records',()=>{
 const {c,api}=harness();
 api.simulateOdooMasterUpdate('warehouse');
 assert.equal(c.state.audit.entries[0].kind,'warehouse_sync');
 assert.equal(c.state.audit.entries[0].source,'Odoo 16 → Middleware (demo)');
 assert.equal(c.state.audit.entries[0].success,2);
 assert.equal(c.state.audit.entries[0].failed,1);
 assert.equal(c.state.master.warehouses.length,3);
 assert.equal(c.state.master.warehouses.find(x=>x.id===12).name,'PWP Secondary — updated in Odoo');
});
test('Master events cannot be submitted as middleware user writes',()=>{
 const {c,api}=harness();
 const prior=JSON.stringify(c.state.master);
 const count=c.state.audit.entries.length;
 assert.throws(()=>api.receiveOdooMasterEvent('product',[{id:500,code:'FAKE',name:'Fake',uom:'kg'}],{source:'Middleware'}),/hanya boleh diterima dari Odoo/);
 assert.equal(JSON.stringify(c.state.master),prior);
 assert.equal(c.state.audit.entries.length,count);
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
test('successful photo CSV preserves image in transaction and drill-down audit without copying it into audit CSV',()=>{
 const {c,api}=harness();
 const csv=api.importSampleRows(false,true).map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
 const parsed=api.parseImportCsv(csv),analysis=api.analyzeImport(parsed,[]);
 assert.equal(analysis.canCommit,true);
 c.state.import={...api.importEmpty(),filename:'foto.csv',parsed,analysis};
 api.commitImport();
 const tx=c.state.transactions.find(t=>t.ref==='VABC-IMP-001');
 const audit=c.state.audit.entries[0];
 assert.equal(tx.evidenceImage.mimeType,'image/png');
 assert.equal(audit.kind,'po_import');
 assert.equal(audit.items[0].evidenceImage.base64,tx.evidenceImage.base64);
 assert.equal(audit.items[1].evidenceImage,null);
});
test('corrupt image is logged as a failed batch and no image bytes are stored in audit',async()=>{
 const {c,api}=harness();
 const csv=api.importSampleRows(false,true,true).map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
 await api.readImportFile({name:'bad-photo.csv',size:csv.length,text:async()=>csv});
 assert.equal(c.state.audit.entries[0].outcome,'failed');
 assert.equal(c.state.audit.entries[0].failed,1);
 assert.equal(c.state.audit.entries[0].blocked,1);
 assert.equal(c.state.audit.entries[0].items[0].evidenceImage,null);
 assert.equal(c.state.transactions.length,0);
});
