import'@testing-library/jest-dom/vitest';import{fireEvent,render,screen,waitFor}from'@testing-library/react';import{beforeEach,describe,expect,it,vi}from'vitest';const mocks=vi.hoisted(()=>({list:vi.fn(),review:vi.fn()}));vi.mock('../services/extraWorkService',()=>({listOwnerExtraWork:mocks.list,reviewExtraWork:mocks.review}));import ExtraWorkReview from'../components/ExtraWorkReview';const request={id:'r1',status:'submitted',submission:{scope:{version:2,scopeHash:'hash'},items:[{id:'oven',label:'Oven',quantity:1,lineTotalCents:4500,totalDurationMinutes:45}],customRequest:{description:'Pantry',context:'Asked onsite'},employeeNote:'Review'},ownerReview:null};describe('ExtraWorkReview',()=>{beforeEach(()=>{mocks.list.mockReset().mockResolvedValue([request]);mocks.review.mockReset().mockImplementation(async(_b,_r,review)=>({...request,status:review.disposition==='declined'?'declined':'approval_ready',ownerReview:review}));});it('shows immutable submission and records future intent without scheduling',async()=>{render(<ExtraWorkReview bookingId="b1"/>);expect(await screen.findByText(/Oven × 1/)).toBeInTheDocument();fireEvent.change(screen.getByLabelText('Disposition r1'),{target:{value:'future_visit'}});fireEvent.change(screen.getByLabelText('Custom price r1'),{target:{value:'120'}});fireEvent.click(screen.getByRole('button',{name:'Save review'}));await waitFor(()=>expect(mocks.review).toHaveBeenCalledWith('b1','r1',expect.objectContaining({disposition:'future_visit',customPriceCents:12000,authorizedExtensionMinutes:0})));expect(JSON.stringify(mocks.review.mock.calls[0])).not.toContain('customerApproved');});});
describe('IW-02 strict owner monetary input', () => {
  beforeEach(() => {
    mocks.list.mockReset().mockResolvedValue([request]);
    mocks.review.mockReset().mockResolvedValue({ ...request, status: 'approval_ready' });
  });
  it.each(['111.111', '-1', '1e3', ''])('rejects unsupported input %s without sending a rounded amount', async price => {
    render(<ExtraWorkReview bookingId="b1" />);
    await screen.findByText(/Oven × 1/);
    fireEvent.change(screen.getByLabelText('Custom price r1'), { target: { value: price } });
    fireEvent.click(screen.getByRole('button', { name: 'Save review' }));
    await screen.findByText(/Review could not be saved/);
    expect(mocks.review).not.toHaveBeenCalled();
  });
  it.each([['0', 0], ['111.11', 11111], ['0.01', 1]])('sends exact supported amount %s', async (price, expected) => {
    render(<ExtraWorkReview bookingId="b1" />);
    await screen.findByText(/Oven × 1/);
    fireEvent.change(screen.getByLabelText('Custom price r1'), { target: { value: price } });
    fireEvent.click(screen.getByRole('button', { name: 'Save review' }));
    await waitFor(() => expect(mocks.review).toHaveBeenCalledWith('b1', 'r1', expect.objectContaining({ customPriceCents: expected })));
  });
});
