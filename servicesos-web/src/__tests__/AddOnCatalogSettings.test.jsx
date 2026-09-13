import '@testing-library/jest-dom/vitest';
import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({list:vi.fn(),create:vi.fn(),update:vi.fn()}));
vi.mock('../services/addOnCatalogService',()=>({listOwnerAddOns:mocks.list,createAddOn:mocks.create,updateAddOn:mocks.update}));
import AddOnCatalogSettings from '../components/AddOnCatalogSettings';

describe('AddOnCatalogSettings',()=>{
  beforeEach(()=>{mocks.list.mockReset().mockResolvedValue([{id:'oven',label:'Oven',description:'Inside',active:true,priceCents:4500,durationMinutes:45}]);mocks.create.mockReset().mockImplementation(async value=>({id:'new',...value}));mocks.update.mockReset().mockImplementation(async(id,value)=>({id,...value}));});
  it('renders authoritative price/duration and deactivates without deleting',async()=>{render(<AddOnCatalogSettings/>);expect(await screen.findByText('$45.00 · 45 minutes · Active')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Deactivate'}));await waitFor(()=>expect(mocks.update).toHaveBeenCalledWith('oven',expect.objectContaining({active:false,priceCents:4500,durationMinutes:45})));});
  it('creates integer-cent and minute records',async()=>{render(<AddOnCatalogSettings/>);await screen.findByText('Oven');fireEvent.change(screen.getByLabelText('Add-on name'),{target:{value:'Inside fridge'}});fireEvent.change(screen.getByLabelText('Add-on price'),{target:{value:'35.25'}});fireEvent.change(screen.getByLabelText('Add-on duration'),{target:{value:'30'}});fireEvent.click(screen.getByRole('button',{name:'Add add-on'}));await waitFor(()=>expect(mocks.create).toHaveBeenCalledWith({label:'Inside fridge',description:'',active:true,priceCents:3525,durationMinutes:30}));});
  it('edits authoritative price and duration',async()=>{render(<AddOnCatalogSettings/>);await screen.findByText('Oven');fireEvent.click(screen.getByRole('button',{name:'Edit'}));fireEvent.change(screen.getByLabelText('Add-on price'),{target:{value:'52.50'}});fireEvent.change(screen.getByLabelText('Add-on duration'),{target:{value:'60'}});fireEvent.click(screen.getByRole('button',{name:'Save add-on'}));await waitFor(()=>expect(mocks.update).toHaveBeenCalledWith('oven',{label:'Oven',description:'Inside',active:true,priceCents:5250,durationMinutes:60}));});
});
