// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listFieldPhotos: vi.fn(),
  listFieldPhotosForMarketing: vi.fn(),
  loadFieldPhotoBlob: vi.fn(),
  setFieldPhotoMarketingApproval: vi.fn(),
  uploadFieldPhoto: vi.fn(),
  validateFieldPhoto: vi.fn(),
  validateFieldPhotoDetails: vi.fn(),
}));

vi.mock('../services/fieldPhotoService', () => ({
  createFieldPhotoClientUploadId: vi.fn(() => 'client-upload-stable'),
  FIELD_PHOTO_MAX_PER_BOOKING: 20,
  FIELD_PHOTO_PHASES: ['before', 'after'],
  listFieldPhotos: mocks.listFieldPhotos,
  listFieldPhotosForMarketing: mocks.listFieldPhotosForMarketing,
  loadFieldPhotoBlob: mocks.loadFieldPhotoBlob,
  setFieldPhotoMarketingApproval: mocks.setFieldPhotoMarketingApproval,
  uploadFieldPhoto: mocks.uploadFieldPhoto,
  validateFieldPhoto: mocks.validateFieldPhoto,
  validateFieldPhotoDetails: mocks.validateFieldPhotoDetails,
}));

import { BookingFieldPhotoReview, FieldPhotoUploadPanel } from '../components/FieldPhotoEvidence';

function jpegFile(name = 'before.jpg') {
  return new File(['photo'], name, { type: 'image/jpeg', lastModified: 1710000000000 });
}

describe('FieldPhotoEvidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listFieldPhotos.mockResolvedValue([]);
    mocks.listFieldPhotosForMarketing.mockResolvedValue([]);
    mocks.setFieldPhotoMarketingApproval.mockResolvedValue({ success: true });
    mocks.validateFieldPhoto.mockReturnValue({ success: true });
    mocks.validateFieldPhotoDetails.mockImplementation(({ roomLabel, note }) => {
      const safeRoomLabel = roomLabel.trim();
      if (!safeRoomLabel) {
        return { success: false, message: 'Add a room or area before uploading this photo.' };
      }
      return { success: true, roomLabel: safeRoomLabel, note: note.trim() };
    });
    mocks.loadFieldPhotoBlob.mockResolvedValue(new Blob(['persisted'], { type: 'image/jpeg' }));
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:field-photo') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  });

  it('shows a local preview and allows removal before upload', async () => {
    render(<FieldPhotoUploadPanel tenantId="tenant-a" bookingId="booking-a" />);
    await screen.findByText('No before photos added yet.');

    fireEvent.change(screen.getByLabelText('Add before photo'), { target: { files: [jpegFile()] } });

    expect(await screen.findByAltText('Selected before photo preview')).toHaveAttribute('src', 'blob:field-photo');
    expect(screen.getByRole('status')).toHaveTextContent('Photo ready to upload.');
    fireEvent.click(screen.getByRole('button', { name: 'Remove selected photo' }));
    expect(screen.queryByAltText('Selected before photo preview')).not.toBeInTheDocument();
    expect(mocks.uploadFieldPhoto).not.toHaveBeenCalled();
  });

  it('rejects unsupported or oversized input before upload', async () => {
    mocks.validateFieldPhoto.mockReturnValue({ success: false, message: 'Choose a JPEG, PNG, or WebP photo.' });
    render(<FieldPhotoUploadPanel tenantId="tenant-a" bookingId="booking-a" />);
    await screen.findByText('No before photos added yet.');

    fireEvent.change(screen.getByLabelText('Add before photo'), {
      target: { files: [new File(['pdf'], 'unsafe.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a JPEG, PNG, or WebP photo.');
    expect(mocks.uploadFieldPhoto).not.toHaveBeenCalled();
  });

  it('requires a room label and persists trimmed metadata with a successful photo', async () => {
    mocks.uploadFieldPhoto.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'photo-1',
        phase: 'before',
        roomLabel: 'Kitchen',
        note: 'Grease behind stove',
        storagePath: 'safe/before/photo-1.jpg',
        uploadedAt: new Date('2026-08-24T08:14:00Z'),
      },
    });
    render(<FieldPhotoUploadPanel tenantId="tenant-a" bookingId="booking-a" />);
    await screen.findByText('No before photos added yet.');
    fireEvent.change(screen.getByLabelText('Add before photo'), { target: { files: [jpegFile()] } });

    fireEvent.click(await screen.findByRole('button', { name: 'Upload photo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Add a room or area before uploading this photo.');
    expect(mocks.uploadFieldPhoto).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('before photo room or area'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload photo' }));
    expect(mocks.uploadFieldPhoto).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('before photo room or area'), { target: { value: '  Kitchen  ' } });
    fireEvent.change(screen.getByLabelText('before photo note'), { target: { value: '  Grease behind stove  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload photo' }));

    await screen.findByText('Photo uploaded.');
    expect(mocks.uploadFieldPhoto).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      bookingId: 'booking-a',
      phase: 'before',
      roomLabel: 'Kitchen',
      note: 'Grease behind stove',
      file: expect.any(File),
      clientUploadId: 'client-upload-stable',
      recoverExisting: false,
    });
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    expect(screen.getByText('Grease behind stove')).toBeInTheDocument();
    expect(screen.getByText(/Uploaded Aug 24, 2026/)).toBeInTheDocument();
    expect(await screen.findByAltText('before job evidence')).toBeInTheDocument();
    expect(screen.getByLabelText('before photo room or area')).toHaveValue('');
    expect(screen.getByLabelText('before photo note')).toHaveValue('');
  });

  it('keeps a failed file retryable and reports uploaded only after service success', async () => {
    mocks.uploadFieldPhoto
      .mockResolvedValueOnce({ success: false, message: 'Upload failed. Try again.' })
      .mockResolvedValueOnce({
        success: true,
        data: {
          id: 'photo-1', phase: 'after', roomLabel: 'Bathroom', note: 'Mirror finished', storagePath: 'safe/after/photo-1.jpg', uploadedAt: new Date(),
        },
      });
    render(<FieldPhotoUploadPanel tenantId="tenant-a" bookingId="booking-a" />);
    await screen.findByText('No after photos added yet.');
    fireEvent.change(screen.getByLabelText('Add after photo'), { target: { files: [jpegFile('after.jpg')] } });
    fireEvent.change(screen.getByLabelText('after photo room or area'), { target: { value: 'Bathroom' } });
    fireEvent.change(screen.getByLabelText('after photo note'), { target: { value: 'Mirror finished' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Upload photo' }));

    expect(await screen.findByText('Upload failed. Try again.')).toBeInTheDocument();
    expect(screen.getByAltText('Selected after photo preview')).toBeInTheDocument();
    expect(screen.getByLabelText('after photo room or area')).toHaveValue('Bathroom');
    expect(screen.getByLabelText('after photo note')).toHaveValue('Mirror finished');
    fireEvent.click(screen.getByRole('button', { name: 'Retry upload' }));

    expect(await screen.findByText('Photo uploaded.')).toBeInTheDocument();
    expect(mocks.uploadFieldPhoto).toHaveBeenCalledTimes(2);
    expect(mocks.uploadFieldPhoto).toHaveBeenLastCalledWith({
      tenantId: 'tenant-a', bookingId: 'booking-a', phase: 'after', roomLabel: 'Bathroom', note: 'Mirror finished', file: expect.any(File),
      clientUploadId: 'client-upload-stable', recoverExisting: true,
    });
    expect(mocks.uploadFieldPhoto.mock.calls[0][0].clientUploadId).toBe('client-upload-stable');
    expect(screen.queryByAltText('Selected after photo preview')).not.toBeInTheDocument();
  });

  it('revokes temporary object URLs when previews are removed or unmounted', async () => {
    const { unmount } = render(<FieldPhotoUploadPanel tenantId="tenant-a" bookingId="booking-a" />);
    await screen.findByText('No before photos added yet.');
    fireEvent.change(screen.getByLabelText('Add before photo'), { target: { files: [jpegFile()] } });
    await screen.findByAltText('Selected before photo preview');
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:field-photo');
  });

  it('shows the soft 20-photo limit and disables new selections', async () => {
    mocks.listFieldPhotos.mockResolvedValue(Array.from({ length: 20 }, (_, index) => ({
      id: `photo-${index}`, phase: index % 2 ? 'after' : 'before', roomLabel: 'Kitchen',
      storagePath: `safe/photo-${index}.jpg`, uploadedAt: new Date(),
    })));
    render(<FieldPhotoUploadPanel tenantId="tenant-a" bookingId="booking-a" />);

    expect(await screen.findByText(/reached the 20-photo limit/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Add before photo')).toBeDisabled();
    expect(screen.getByLabelText('Add after photo')).toBeDisabled();
    expect(mocks.uploadFieldPhoto).not.toHaveBeenCalled();
  });

  it('renders owner review as read-only and shows unavailable persisted content honestly', async () => {
    mocks.listFieldPhotos.mockResolvedValue([
      { id: 'before-1', phase: 'before', storagePath: 'safe/before-1.jpg', uploadedAt: new Date('2026-07-13T12:00:00Z') },
    ]);
    mocks.loadFieldPhotoBlob.mockRejectedValueOnce(new Error('denied'));
    render(<BookingFieldPhotoReview tenantId="tenant-a" bookingId="booking-a" />);

    expect(await screen.findByText('Photo unavailable.')).toBeInTheDocument();
    expect(screen.getByText('Unlabeled')).toBeInTheDocument();
    expect(screen.getByText(/Uploaded Jul 13, 2026/)).toBeInTheDocument();
    expect(screen.getByText('No after photos added yet.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Add .* photo/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Marketing approval/i })).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.loadFieldPhotoBlob).toHaveBeenCalledWith('safe/before-1.jpg'));
  });

  it('renders independent room labels and optional notes for multiple persisted photos', async () => {
    mocks.listFieldPhotos.mockResolvedValue([
      { id: 'before-kitchen', phase: 'before', roomLabel: 'Kitchen', note: 'Grease buildup', storagePath: 'safe/before-kitchen.jpg', uploadedAt: new Date() },
      { id: 'before-bathroom', phase: 'before', roomLabel: 'Bathroom', storagePath: 'safe/before-bathroom.jpg', uploadedAt: new Date() },
      { id: 'after-kitchen', phase: 'after', roomLabel: 'Kitchen', storagePath: 'safe/after-kitchen.jpg', uploadedAt: new Date() },
    ]);

    render(<BookingFieldPhotoReview tenantId="tenant-a" bookingId="booking-a" />);

    expect((await screen.findAllByText('Kitchen')).length).toBe(2);
    expect(screen.getByText('Bathroom')).toBeInTheDocument();
    expect(screen.getByText('Grease buildup')).toBeInTheDocument();
    expect(await screen.findAllByRole('img')).toHaveLength(3);
  });

  it('keeps employee review read-only but gives owners an explicit separate marketing approval control', async () => {
    mocks.listFieldPhotosForMarketing.mockResolvedValue([
      { id: 'photo-a', phase: 'before', roomLabel: 'Kitchen', storagePath: 'safe/photo-a.jpg', marketingApproved: false },
    ]);
    render(<BookingFieldPhotoReview tenantId="tenant-a" bookingId="booking-a" canManageMarketing />);

    fireEvent.click(await screen.findByRole('button', { name: 'Approve for Marketing' }));
    await waitFor(() => expect(mocks.setFieldPhotoMarketingApproval).toHaveBeenCalledWith({
      tenantId: 'tenant-a', bookingId: 'booking-a', photoId: 'photo-a', approved: true,
    }));
    expect(await screen.findByText('Approved for Marketing')).toBeInTheDocument();
  });
});
