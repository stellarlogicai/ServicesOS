import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../firebase',()=>({auth:{currentUser:null}}));
vi.mock('../services/ownerOnboardingService',()=>({resolveOwnerOnboardingGatewayUrl:()=> 'http://local/employeeTeamGateway'}));
import { EmployeeTeamServiceError, listCanonicalEmployees, provisionEmployee, resendEmployeeActivation } from '../services/employeeTeamService';

const user={getIdToken:vi.fn(async()=> 'token')};
const reply=(payload,ok=true)=>vi.fn(async()=>({ok,json:async()=>payload}));

describe('employeeTeamService',()=>{
  beforeEach(()=>user.getIdToken.mockClear());
  it('requires authentication',async()=>{await expect(listCanonicalEmployees({user:null,fetchImpl:vi.fn()})).rejects.toMatchObject({code:'unauthenticated'});});
  it('lists only allowlisted employee fields and sends no tenant authority',async()=>{const fetchImpl=reply({workforceMode:'employees',employees:[{uid:'employee-a',name:'Avery',email:'A@EXAMPLE.TEST',phone:'1',status:'active',activationStatus:'email_sent',setupUrl:'secret',role:'admin',tenantId:'tenant-b'}]});const result=await listCanonicalEmployees({user,fetchImpl});expect(result.employees[0]).toEqual({uid:'employee-a',name:'Avery',email:'a@example.test',phone:'1',status:'active',activationStatus:'email_sent'});const [,request]=fetchImpl.mock.calls[0];expect(JSON.parse(request.body)).toEqual({action:'owner_list'});expect(request.headers.Authorization).toBe('Bearer token');});
  it('provisions with exact owner-safe fields and strips activation secrets',async()=>{const fetchImpl=reply({success:true,reused:false,employee:{uid:'employee-a',name:'Avery',email:'a@example.test',phone:'',status:'active',activationStatus:'email_sent',actionLink:'secret'}});const result=await provisionEmployee({name:'Avery',email:'a@example.test',phone:''},{user,fetchImpl});expect(result.employee.actionLink).toBeUndefined();expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({action:'owner_provision',name:'Avery',email:'a@example.test',phone:''});});
  it('resends by canonical email only and normalizes server errors',async()=>{const fetchImpl=reply({success:true,reused:true,employee:{uid:'employee-a',name:'Avery',email:'a@example.test',phone:'',status:'active',activationStatus:'email_sent'}});await resendEmployeeActivation('a@example.test',{user,fetchImpl});expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({action:'owner_resend_activation',email:'a@example.test'});const denied=reply({code:'forbidden'},false);await expect(listCanonicalEmployees({user,fetchImpl:denied})).rejects.toBeInstanceOf(EmployeeTeamServiceError);});
  it('fails closed on malformed employee responses',async()=>{await expect(listCanonicalEmployees({user,fetchImpl:reply({workforceMode:'employees',employees:[{uid:'x',setupUrl:'secret'}]})})).rejects.toMatchObject({code:'invalid_response'});});
});
