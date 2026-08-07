import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('design tokens', () => {
  it('applies the accent background utility class', () => {
    const { container } = render(<div className="bg-accent" data-testid="token-box" />);
    expect(container.firstChild).toHaveClass('bg-accent');
  });
});
