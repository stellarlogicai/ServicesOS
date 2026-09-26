// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const listAlerts = vi.fn();
vi.mock('../services/ownerSafetyAlertsService', () => ({ listOwnerSafetyAlerts: (...args) => listAlerts(...args) }));
import SafetyAlertsPanel from '../components/SafetyAlertsPanel';

beforeEach(() => listAlerts.mockReset());

it('shows tenant alerts and a location action only for valid coordinates', async () => {
  listAlerts.mockResolvedValue([{ eventId: 'event-a', employeeDisplayName: 'Worker',
    createdAt: '2026-09-26T12:00:00.000Z', bookingId: 'job-a', location: { latitude: 41.8, longitude: -87.6 } },
  { eventId: 'event-b', employeeDisplayName: 'Other', createdAt: null, bookingId: null,
    location: { latitude: 200, longitude: 0 } }]);
  render(<SafetyAlertsPanel tenantId="tenant-a" />);
  await waitFor(() => expect(screen.getByText('Worker')).toBeTruthy());
  expect(screen.getAllByText('Open location')).toHaveLength(1);
  expect(screen.getByText('Open location').getAttribute('href')).toContain('41.8');
  expect(screen.getByText('Other').closest('li').textContent).toContain('Location unavailable');
});

it('remains compact when empty and supports explicit refresh', async () => {
  listAlerts.mockResolvedValue([]);
  render(<SafetyAlertsPanel tenantId="tenant-a" />);
  await waitFor(() => expect(screen.getByText('No recent safety alerts.')).toBeTruthy());
  fireEvent.click(screen.getByText('Refresh'));
  await waitFor(() => expect(listAlerts).toHaveBeenCalledTimes(2));
});
