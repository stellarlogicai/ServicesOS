import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
const team=vi.hoisted(()=>({listCanonicalEmployees:vi.fn()}));
const scheduling=vi.hoisted(()=>({getJobsByDate:vi.fn(),createJob:vi.fn(),updateJobStatus:vi.fn()}));
vi.mock('../services/employeeTeamService',()=>team);
vi.mock('../core/scheduling/schedulingService',()=>scheduling);
vi.mock('../components/EmployeeManagement',()=>({default:()=> <div>Canonical employee management</div>}));
import StaffScheduling from '../components/StaffScheduling';

describe('StaffScheduling employee identity boundary',()=>{
  beforeEach(()=>{vi.clearAllMocks();team.listCanonicalEmployees.mockResolvedValue({employees:[{uid:'employee-a',name:'Avery'}],workforceMode:'employees'});scheduling.getJobsByDate.mockResolvedValue({success:true,data:[]});});
  it('loads canonical UID employees for scheduling choices',async()=>{render(<StaffScheduling tenantId="tenant-a"/>);const option=await screen.findByRole('option',{name:'Avery'});expect(option.value).toBe('employee-a');expect(team.listCanonicalEmployees).toHaveBeenCalledTimes(1);});
  it('routes the active Employees tab to canonical management with no legacy controls',async()=>{render(<StaffScheduling tenantId="tenant-a"/>);await screen.findByRole('option',{name:'Avery'});fireEvent.click(screen.getByRole('button',{name:'Employees'}));expect(screen.getByText('Canonical employee management')).toBeInTheDocument();expect(screen.queryByRole('button',{name:/delete employee/i})).not.toBeInTheDocument();});
  it('preserves shift creation while using the canonical UID',async()=>{scheduling.createJob.mockResolvedValue({success:true});render(<StaffScheduling tenantId="tenant-a"/>);await screen.findByRole('option',{name:'Avery'});fireEvent.change(screen.getByLabelText('Employee'),{target:{value:'employee-a'}});fireEvent.change(screen.getByLabelText('Job address'),{target:{value:'1 Main'}});fireEvent.click(screen.getByRole('button',{name:'Schedule Job'}));await waitFor(()=>expect(scheduling.createJob).toHaveBeenCalledWith('tenant-a',expect.objectContaining({employeeId:'employee-a',status:'scheduled'})));});
});
