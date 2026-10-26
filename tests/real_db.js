(function(){
function wrap(p){ return p.then(r=>r); }
window.__SUBS=0; window.__RPCLOG=[];
window.supabase={createClient(){
  const c={};
  c.rpc=async (fn,args)=>{ window.__RPCLOG.push(fn); const r=await window.__py('rpc',JSON.stringify({fn,args:args||{}})); const o=JSON.parse(r); return o.error?{data:null,error:{message:o.error,code:'P0001'}}:{data:o.data,error:null}; };
  c.from=(t)=>{ const st={}; const o={select:()=>o,order:()=>o,eq:()=>o,maybeSingle:()=>o,then:(res,rej)=>window.__py('select',t).then(r=>{const j=JSON.parse(r); return j.error?{data:null,error:{message:j.error}}:{data:j.data,error:null}}).then(res,rej)};
    ['insert','update','upsert','delete'].forEach(m=>o[m]=()=>({then:(res)=>res({data:null,error:{message:'permission denied for table '+t,code:'42501'}}), select(){return this}}));
    return o; };
  c.storage={from:()=>({
    upload:async (path,blob)=>{ const r=JSON.parse(await window.__py('upload',path)); return r.error?{error:{message:r.error}}:{data:{path},error:null}; },
    getPublicUrl:(p)=>({data:{publicUrl:'https://x.supabase.co/storage/v1/object/public/gcash-receipts/'+p}}),
    remove:async()=>({error:{message:'not allowed'}}) })};
  c.channel=()=>{const ch={on:()=>ch,subscribe:()=>{window.__SUBS++;return ch}}; return ch;};
  return c;
}};
})();
