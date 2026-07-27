import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AdminSidebar } from './AdminSidebar';

/** The rail is open or closed — the same two states at every width, since
 * that's the whole point of the rework. These assert the markup half of it;
 * whether the closed rail is off-screen or zero-width is CSS's problem. */
describe('AdminSidebar', () => {
  it('marks itself open and keeps its links reachable', () => {
    const html = renderToStaticMarkup(
      <AdminSidebar pathname="/admin/analytics" open onClose={() => {}} />,
    );

    expect(html).toContain('sidebarOpen');
    expect(html).toContain('aria-hidden="false"');
    expect(html).not.toContain('tabindex="-1"');
  });

  it('takes itself out of the tab order when closed', () => {
    const html = renderToStaticMarkup(
      <AdminSidebar pathname="/admin/analytics" open={false} onClose={() => {}} />,
    );

    expect(html).not.toContain('sidebarOpen');
    expect(html).toContain('aria-hidden="true"');
    // Every link and the chevron, so a shut rail can't be tabbed into.
    expect(html).not.toContain('tabindex="0"');
  });

  it('marks the current page, and only the current page', () => {
    const html = renderToStaticMarkup(
      <AdminSidebar pathname="/admin/analytics" open onClose={() => {}} />,
    );

    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
});
