// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  login: vi.fn(),
  signup: vi.fn(),
  loginWithGoogle: vi.fn()
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authMocks
}));

import LoginForm from '../components/LoginForm';

describe('LoginForm customer signup guard', () => {
  it('shows invitation guidance without calling signup', () => {
    render(<LoginForm />);
    fireEvent.click(screen.getByRole('button', { name: "Don't have an account? Learn how to get access" }));

    expect(screen.getByRole('status')).toHaveTextContent(
      'Customer accounts are created by invitation from your service provider.'
    );
    expect(screen.queryByRole('button', { name: 'Create Account' })).not.toBeInTheDocument();
    expect(authMocks.signup).not.toHaveBeenCalled();
  });
});
