import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AdminSidebar } from './AdminSidebar';

const noop = () => {};

/** The rail has two widths, never zero: expanded with labels, or collapsed
 * to icons. These assert the markup half of that — the widths themselves are
 * CSS's problem, but "collapsed still renders every link, focusable and
 * named" is the part worth pinning down. */
describe('AdminSidebar', () => {
  it('expands with a control that says it will collapse', () => {
    const html = renderToStaticMarkup(
      <AdminSidebar pathname="/admin/analytics" open onToggle={noop} onClose={noop} />,
    );

    expect(html).toContain('sidebarOpen');
    expect(html).toContain('aria-label="Collapse menu"');
    expect(html).toContain('aria-expanded="true"');
  });

  it('keeps every link in the collapsed rail, labelled and in the tab order', () => {
    const expanded = renderToStaticMarkup(
      <AdminSidebar pathname="/admin/analytics" open onToggle={noop} onClose={noop} />,
    );
    const collapsed = renderToStaticMarkup(
      <AdminSidebar pathname="/admin/analytics" open={false} onToggle={noop} onClose={noop} />,
    );

    expect(collapsed).not.toContain('sidebarOpen');
    expect(collapsed).toContain('aria-label="Expand menu"');
    // Collapsing is a width change, not a removal: same links, same labels
    // (clipped by CSS, so a screen reader still names each icon), and
    // nothing pulled out of the tab order.
    const links = (html: string) => html.match(/<a /g)?.length ?? 0;
    expect(links(collapsed)).toBe(links(expanded));
    expect(collapsed).toContain('Analytics');
    expect(collapsed).not.toContain('tabindex="-1"');
    // The rail is on screen in both states, so it must never be hidden from
    // assistive tech the way a closed drawer would be.
    expect(collapsed).toMatch(/<aside class="[^"]*">/);
  });

  it('marks the current page, and only the current page', () => {
    const html = renderToStaticMarkup(
      <AdminSidebar pathname="/admin/analytics" open onToggle={noop} onClose={noop} />,
    );

    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });
});
