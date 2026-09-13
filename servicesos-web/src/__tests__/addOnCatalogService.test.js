import { beforeEach,describe,expect,it,vi } from 'vitest';
vi.mock('../firebase',()=>({auth:{currentUser:null}}));
import { createAddOn,listEmployeeActiveAddOns,listOwnerAddOns,updateAddOn } from '../services/addOnCatalogService';

const user={getIdToken:vi.fn().mockResolvedValue('fake-token')};
describe('add-on catalog service',()=>{
  beforeEach(()=>{vi.stubEnv('VITE_FIREBASE_PROJECT_ID','demo-servicesos-v1-smoke-local');vi.stubEnv('VITE_USE_FIREBASE_EMULATORS','true');vi.stubEnv('VITE_FUNCTIONS_URL','http://127.0.0.1:5001/demo-servicesos-v1-smoke-local/us-central1');});
  it('uses exact owner contracts without client tenant authority',async()=>{
    const addOn={id:'addon-a',label:'Oven',description:'Inside',active:true,priceCents:4500,durationMinutes:45};
    const fetchImpl=vi.fn().mockResolvedValue({ok:true,json:async()=>({success:true,addOn,addOns:[addOn]})});
    await listOwnerAddOns({user,fetchImpl}); await createAddOn({...addOn,id:undefined},{user,fetchImpl}); await updateAddOn('addon-a',{label:addOn.label,description:addOn.description,active:false,priceCents:5000,durationMinutes:60},{user,fetchImpl});
    for(const call of fetchImpl.mock.calls){const body=JSON.parse(call[1].body);expect(body).not.toHaveProperty('tenantId');expect(body).not.toHaveProperty('uid');expect(body).not.toHaveProperty('role');expect(call[1].headers.Authorization).toBe('Bearer fake-token');}
  });
  it('reconstructs employee safe projection',async()=>{
    const fetchImpl=vi.fn().mockResolvedValue({ok:true,json:async()=>({success:true,addOns:[{id:'a',label:'Oven',priceCents:4500,durationMinutes:45,description:'hidden',createdByUid:'hidden'}]})});
    expect(await listEmployeeActiveAddOns({user,fetchImpl})).toEqual([{id:'a',label:'Oven',priceCents:4500,durationMinutes:45}]);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({action:'employee_list_active'});
  });
});
