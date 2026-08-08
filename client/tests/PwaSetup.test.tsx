import { render, screen } from '@testing-library/react';
import InstallPwaSheet from '../src/components/InstallPwaSheet';
import { describe, it, expect } from 'vitest';

describe('InstallPwaSheet', () => {
  it('renders 3-step PWA install instructions', () => {
    render(<InstallPwaSheet isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('Cara Install Cepat Bayarkan')).toBeInTheDocument();
    expect(screen.getByText(/Share/i)).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
    expect(screen.getByText(/Buka dari ikon di homescreen/i)).toBeInTheDocument();
  });
});
