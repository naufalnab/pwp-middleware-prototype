'use strict';
// Demo-only mirror. Odoo 16 owns both master datasets. Middleware has no
// UI, API, or code path for user-authored product/warehouse CRUD operations.
const ODOO_MASTER_OWNER='Odoo 16';
const ODOO_INITIAL_PRODUCTS=[
  {id:101,code:'PET',name:'PET Clear',uom:'kg',active:true,writeDate:'2026-09-23T08:00:00+07:00'},
  {id:102,code:'HDPE',name:'HDPE Mixed',uom:'kg',active:true,writeDate:'2026-09-23T08:01:00+07:00'},
  {id:103,code:'PET-BLU',name:'PET Blue',uom:'kg',active:true,writeDate:'2026-09-23T08:02:00+07:00'},
  {id:104,code:'RES',name:'Residu sortir',uom:'kg',active:true,writeDate:'2026-09-23T08:03:00+07:00'}
];
const ODOO_INITIAL_WAREHOUSES=[
  {id:11,code:'PWP',name:'PWP Main Warehouse',company:'PWP (demo)',active:true,writeDate:'2026-09-23T08:04:00+07:00'},
  {id:12,code:'PWP-2',name:'PWP Secondary Warehouse',company:'PWP (demo)',active:true,writeDate:'2026-09-23T08:05:00+07:00'}
];
const ODOO_PRODUCT_EVENT=[
  {id:101,code:'PET',name:'PET Clear — updated in Odoo',uom:'kg',active:true,writeDate:'2026-09-23T10:00:00+07:00'},
  {id:105,code:'PET-GRN',name:'PET Green (new in Odoo)',uom:'kg',active:true,writeDate:'2026-09-23T10:01:00+07:00'},
  {id:106,code:'',name:'Invalid from Odoo',uom:'kg',active:true,writeDate:'2026-09-23T10:02:00+07:00'}
];
const ODOO_WAREHOUSE_EVENT=[
  {id:12,code:'PWP-2',name:'PWP Secondary — updated in Odoo',company:'PWP (demo)',active:true,writeDate:'2026-09-23T10:03:00+07:00'},
  {id:13,code:'PWP-3',name:'PWP Receiving Warehouse (new in Odoo)',company:'PWP (demo)',active:true,writeDate:'2026-09-23T10:04:00+07:00'},
  {id:null,code:'INVALID',name:'Warehouse without Odoo ID',company:'PWP (demo)',active:true,writeDate:'2026-09-23T10:05:00+07:00'}
];
function masterInitialState(){return {
  products:ODOO_INITIAL_PRODUCTS.map(x=>({...x})),
  warehouses:ODOO_INITIAL_WAREHOUSES.map(x=>({...x})),
  activeTab:'products',lastReceived:'2026-09-23T08:20:00+07:00',
  productEventCount:0,warehouseEventCount:0
}}
function masterResource(kind){if(kind==='product')return {key:'products',model:'product.product',label:'Master Product'};
  if(kind==='warehouse')return {key:'warehouses',model:'stock.warehouse',label:'Master Warehouse'};
  throw Error('Jenis master tidak dikenal.');}
function validateOdooMaster(kind,entry){
  const errors=[];
  if(!Number.isInteger(entry?.id)||entry.id<=0)errors.push('Odoo record ID wajib angka positif.');
  if(!entry?.code||!String(entry.code).trim())errors.push('Kode dari Odoo kosong.');
  if(!entry?.name||!String(entry.name).trim())errors.push('Nama dari Odoo kosong.');
  if(kind==='product'&&(!entry?.uom||!String(entry.uom).trim()))errors.push('Satuan produk dari Odoo kosong.');
  if(kind==='warehouse'&&(!entry?.company||!String(entry.company).trim()))errors.push('Perusahaan warehouse dari Odoo kosong.');
  return errors;
}
function buildOdooMirrorUpdate(current,kind,entries){
  const resource=masterResource(kind),proposed=current.map(x=>({...x})),items=[];
  const ids=new Set(),codes=new Set();
  for(const row of entries){
    const errors=validateOdooMaster(kind,row);
    const key=String(row.code||'').trim().toLowerCase();
    if(ids.has(row.id))errors.push('Odoo ID duplikat pada payload yang sama.');
    if(key&&codes.has(key))errors.push('Kode master duplikat pada payload yang sama.');
    ids.add(row.id);if(key)codes.add(key);
    const index=proposed.findIndex(x=>x.id===row.id);
    const codeOwner=proposed.find(x=>x.code.toLowerCase()===key&&x.id!==row.id);
    if(index>=0 && row.writeDate && proposed[index].writeDate && new Date(row.writeDate)<new Date(proposed[index].writeDate))
      errors.push('Update Odoo lebih lama dari data mirror; perubahan diabaikan.');
    if(key&&codeOwner)errors.push('Kode telah digunakan oleh Odoo ID lain pada mirror.');
    const action=index>=0?'updated':'new';
    const item={kind,code:row.code||'—',name:row.name||'—',uom:row.uom||'—',company:row.company||'—',
      odoo:`${resource.model} / ${row.id??'—'}`,odooId:row.id,action,
      disposition:errors.length?'failed':'synced',errors};
    items.push(item);
    if(errors.length)continue;
    const clean={...row,code:String(row.code).trim(),name:String(row.name).trim()};
    if(index>=0)proposed[index]=clean;
    else proposed.push(clean);
  }
  return {proposed,items,success:items.filter(x=>x.disposition==='synced').length,
    failed:items.filter(x=>x.disposition==='failed').length};
}
function receiveOdooMasterEvent(kind,entries,{source}={}){
  const resource=masterResource(kind);
  // Not a user-facing write path. Only Odoo's inbound update handler can refresh a mirror.
  if(source!==ODOO_MASTER_OWNER)throw Error('Ditolak: master data hanya boleh diterima dari Odoo.');
  if(!Array.isArray(entries)||!entries.length)throw Error('Payload update Odoo kosong.');
  const result=buildOdooMirrorUpdate(state.master[resource.key],kind,entries);
  state.master[resource.key]=result.proposed;
  state.master.lastReceived=new Date().toISOString();
  const event=recordAudit({kind:kind==='product'?'product_sync':'warehouse_sync',
    title:'Pembaruan '+resource.label,source:'Odoo 16 → Middleware (demo)',
    at:new Date().toISOString(),outcome:result.failed?(result.success?'partial':'failed'):'success',
    total:result.items.length,success:result.success,failed:result.failed,blocked:0,
    issues:[],message:`Mirror read-only diperbarui dari event Odoo: ${result.success} diterima, ${result.failed} bermasalah. Tidak ada master dibuat, diedit, atau dihapus di Odoo.`,
    items:result.items});
  return event;
}
function simulateOdooMasterUpdate(kind){
  const data=kind==='product'?ODOO_PRODUCT_EVENT:ODOO_WAREHOUSE_EVENT;
  const event=receiveOdooMasterEvent(kind,data.map(x=>({...x})),{source:ODOO_MASTER_OWNER});
  if(kind==='product')state.master.productEventCount++;
  else state.master.warehouseEventCount++;
  state.audit.selected=event.id;state.audit.itemIndex=null;goto('audit');
  toast('Event '+masterResource(kind).label+' dari Odoo diterima (simulasi). Lihat detail Audit Log.');
}
