// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listFieldPhotos: vi.fn(),
  loadFieldPhotoBlob: vi.fn(),
  uploadFieldPhoto: vi.fn(),
  validateFieldPhoto: vi.fn(),
}));

vi.mock('../services/fieldPhotoService', () => ({
  FIELD_PHOTO_PHASES: ['before', 'after'],
  listFieldPhotos: mocks.listFieldPhotos,
  loadFieldPhotoBlob: mocks.loadFieldPhotoBlob,
  uploadFieldPhoto: mocks.uploadFieldPhoto,
  validateFieldPhoto: mocks.validateFieldPhoto,
}));

import { BookingFieldPhotoReview, FieldPhotoUploadPanel } from '../components/FieldPhotoEvidence';

function jpegFile(name = 'before.jpg') {
  return new File(['photo'], name, { type: 'image/jpeg', lastModified: 1710000000000 });
}

describe('FieldPhotoEvidence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listFieldPhotos.mockResolvedValue([]);
    mocks.validateFieldPhoto.mockReturnValue({ success: true });
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

  it('keeps a failed file retryable and reports uploaded only after service success', async () => {
    mocks.uploadFieldPhoto
      .mockResolvedValueOnce({ success: false, message: 'Upload failed. Try again.' })
      .mockResolvedValueOnce({
        success: true,
        data: {
          id: 'photo-1', phase: 'after', storagePath: 'safe/after/photo-1.jpg', uploadedAt: new Date(),
        },
      });
    render(<FieldPhotoUploadPanel tenantId="tenant-a" bookingId="booking-a" />);
    await screen.findByText('No after photos added yet.');
    fireEvent.change(screen.getByLabelText('Add after photo'), { target: { files: [jpegFile('after.jpg')] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Upload photo' }));

    expect(await screen.findByText('Upload failed. Try again.')).toBeInTheDocument();
    expect(screen.getByAltText('Selected after photo preview')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry upload' }));

    expect(await screen.findByText('Photo uploaded.')).toBeInTheDocument();
    expect(mocks.uploadFieldPhoto).toHaveBeenCalledTimes(2);
    expect(mocks.uploadFieldPhoto).toHaveBeenLastCalledWith({
      tenantId: 'tenant-a', bookingId: 'booking-a', phase: 'after', file: expect.any(File),
    });
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

  it('renders owner review as read-only and shows unavailable persisted content honestly', async () => {
    mocks.listFieldPhotos.mockResolvedValue([
      { id: 'before-1', phase: 'before', storagePath: 'safe/before-1.jpg', uploadedAt: new Date('2026-07-13T12:00:00Z') },
    ]);
    mocks.loadFieldPhotoBlob.mockRejectedValueOnce(new Error('denied'));
    render(<BookingFieldPhotoReview tenantId="tenant-a" bookingId="booking-a" />);

    expect(await screen.findByText('Photo unavailable.')).toBeInTheDocument();
    expect(screen.getByText(/Uploaded Jul 13, 2026/)).toBeInTheDocument();
    expect(screen.getByText('No after photos added yet.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Add .* photo/)).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.loadFieldPhotoBlob).toHaveBeenCalledWith('safe/before-1.jpg'));
  });
});
