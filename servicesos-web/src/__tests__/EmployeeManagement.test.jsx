import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
const api=vi.hoisted(()=>({listCanonicalEmployees:vi.fn(),provisionEmployee:vi.fn(),resendEmployeeActivation:vi.fn()}));
vi.mock('../services/employeeTeamService',()=>api);
import EmployeeManagement from '../components/EmployeeManagement';

describe('EmployeeManagement canonical boundary',()=>{
  beforeEach(()=>{vi.clearAllMocks();api.listCanonicalEmployees.mockResolvedValue({workforceMode:'employees',employees:[{uid:'employee-a',name:'Avery',email:'avery@example.test',phone:'',status:'active',activationStatus:'email_sent'}]});});
  it('loads canonical employees and exposes no legacy edit/delete controls',async()=>{render(<EmployeeManagement/>);expect(await screen.findByText('Avery')).toBeInTheDocument();expect(screen.queryByRole('button',{name:/edit/i})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:/delete/i})).not.toBeInTheDocument();expect(screen.queryByText(/reset\?|oobCode|setupUrl/i)).not.toBeInTheDocument();});
  it('provisions through the gateway with name email and phone',async()=>{api.provisionEmployee.mockResolvedValue({success:true,reused:false,employee:{}});render(<EmployeeManagement/>);await screen.findByText('Avery');fireEvent.click(screen.getByRole('button',{name:'Add employee'}));const dialog=screen.getByRole('dialog');fireEvent.change(within(dialog).getByLabelText('Name'),{target:{value:'Jordan'}});fireEvent.change(within(dialog).getByLabelText('Email'),{target:{value:'jordan@example.test'}});fireEvent.change(within(dialog).getByLabelText('Phone'),{target:{value:'555'}});fireEvent.click(within(dialog).getByRole('button',{name:'Add employee'}));await waitFor(()=>expect(api.provisionEmployee).toHaveBeenCalledWith({name:'Jordan',email:'jordan@example.test',phone:'555'}));});
  it('resends activation and shows safe failures',async()=>{api.resendEmployeeActivation.mockRejectedValue(new Error('secret provider detail'));render(<EmployeeManagement/>);await screen.findByText('Avery');fireEvent.click(screen.getByRole('button',{name:'Resend activation'}));expect(await screen.findByText('Activation email could not be sent. Try again later.')).toBeInTheDocument();expect(screen.queryByText('secret provider detail')).not.toBeInTheDocument();});
  it('shows safe list errors',async()=>{api.listCanonicalEmployees.mockRejectedValue(new Error('internal'));render(<EmployeeManagement/>);expect(await screen.findByText('Employees could not be loaded. Try again.')).toBeInTheDocument();});
});
