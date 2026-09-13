const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createAddOnCatalogGatewayHandler, parseRequest } = require('../addOnCatalogGateway');

function fixture({ uid='owner-a', profile={}, tenant={}, catalog={} }={}) {
  const data = new Map([
    ['users/owner-a',{role:'admin',status:'active',tenantId:'tenant-a'}],
    ['users/employee-a',{role:'employee',status:'active',tenantId:'tenant-a'}],
    ['tenants/tenant-a',{adminUsers:['owner-a'],users:['owner-a','employee-a']}],
  ]);
  data.set(`users/${uid}`,{...(data.get(`users/${uid}`)||{}),...profile});
  data.set('tenants/tenant-a',{...data.get('tenants/tenant-a'),...tenant});
  Object.entries(catalog).forEach(([id,value])=>data.set(`tenants/tenant-a/addOnCatalog/${id}`,value));
  let sequence=0;
  class Ref {
    constructor(path){this.path=path;this.id=path.split('/').at(-1);}
    doc(id){return new Ref(`${this.path}/${id || `generated-${++sequence}`}`);}
    collection(name){return new Query(`${this.path}/${name}`);}
    async get(){return {exists:data.has(this.path),data:()=>data.get(this.path)};}
    async create(value){data.set(this.path,structuredClone(value));}
    async update(value){data.set(this.path,{...data.get(this.path),...structuredClone(value)});}
  }
  class Query {
    constructor(path,activeOnly=false){this.path=path;this.activeOnly=activeOnly;}
    doc(id){return new Ref(`${this.path}/${id || `generated-${++sequence}`}`);}
    where(field,op,value){assert.equal(field,'active');assert.equal(op,'==');return new Query(this.path,value===true);}
    limit(value){assert.equal(value,100);return this;}
    async get(){const prefix=`${this.path}/`;const docs=[];for(const [path,value] of data){if(path.startsWith(prefix)&&!path.slice(prefix.length).includes('/')&&(!this.activeOnly||value.active===true))docs.push({id:path.slice(prefix.length),data:()=>value});}return {docs};}
  }
  const admin={auth:()=>({verifyIdToken:async()=>({uid})}),firestore:()=>({collection:name=>new Query(name)})};
  return {admin,data};
}
function response(){return{statusCode:0,body:null,set(){return this;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;},send(body){this.body=body;return this;}};}
async function call(source,body){const res=response();await createAddOnCatalogGatewayHandler({admin:source.admin})({method:'POST',headers:{authorization:'Bearer fake'},body},res);return res;}
const valid={action:'owner_create',label:'Inside oven',description:'Interior oven cleaning',active:true,priceCents:4500,durationMinutes:45};

test('owner creates, edits, and deactivates a canonical add-on', async()=>{
  const source=fixture(); const created=await call(source,valid); assert.equal(created.statusCode,200); assert.equal(created.body.addOn.priceCents,4500);
  const id=created.body.addOn.id; const updated=await call(source,{...valid,action:'owner_update',addOnId:id,priceCents:5000,durationMinutes:60,active:false});
  assert.equal(updated.statusCode,200); assert.deepEqual(updated.body.addOn,{id,label:'Inside oven',description:'Interior oven cleaning',active:false,priceCents:5000,durationMinutes:60});
  assert.equal(source.data.get(`tenants/tenant-a/addOnCatalog/${id}`).createdByUid,'owner-a');
});

test('malformed price and duration are rejected',()=>{
  for(const patch of [{priceCents:1.5},{priceCents:-1},{durationMinutes:0},{durationMinutes:2.5}]) assert.throws(()=>parseRequest({...valid,...patch}),error=>error.code==='validation_failed');
});

test('cross-tenant or non-member owner and employee mutation are denied',async()=>{
  const cross=fixture({tenant:{adminUsers:['other-owner']}}); assert.equal((await call(cross,valid)).statusCode,403);
  const employee=fixture({uid:'employee-a'}); assert.equal((await call(employee,valid)).statusCode,403);
});

test('employee reads active safe projection only',async()=>{
  const source=fixture({uid:'employee-a',catalog:{active:{label:'Oven',description:'private management note',active:true,priceCents:4500,durationMinutes:45,createdByUid:'owner-a'},inactive:{label:'Windows',active:false,priceCents:5000,durationMinutes:60}}});
  const result=await call(source,{action:'employee_list_active'}); assert.equal(result.statusCode,200);
  assert.deepEqual(result.body,{success:true,addOns:[{id:'active',label:'Oven',priceCents:4500,durationMinutes:45}]});
});

test('request contract rejects tenant authority and legacy upsell fields',()=>{
  for(const field of ['tenantId','uid','role','upsellOfferId']) assert.throws(()=>parseRequest({...valid,[field]:'x'}));
});

test('missing and invalid authentication are denied',async()=>{
  const source=fixture(); const missing=response();
  await createAddOnCatalogGatewayHandler({admin:source.admin})({method:'POST',headers:{},body:{action:'owner_list'}},missing);
  assert.equal(missing.statusCode,401);
  source.admin.auth=()=>({verifyIdToken:async()=>{throw new Error('invalid');}});
  assert.equal((await call(source,{action:'owner_list'})).statusCode,401);
});
