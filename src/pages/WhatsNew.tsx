import React from 'react';
import ToolsLayout from '../components/ToolsLayout';
import { CHANGELOG } from '../lib/changelog';

export default function WhatsNew() {
  return (
    <ToolsLayout title="What's new" description="New features and improvements in Scnr, newest first.">
      <h1 className="hero-h1 tool-h1">What's new</h1>
      <p className="tool-intro">New features and improvements, newest first.</p>
      {CHANGELOG.map(e => (
        <article key={e.date + e.title} className="tool-box">
          <time dateTime={e.date} className="tool-crumb">{e.date}</time>
          <h2 style={{ fontFamily: 'var(--font-h)', fontSize: 22, margin: '4px 0 8px' }}>{e.title}</h2>
          <ul style={{ paddingLeft: 20, display: 'grid', gap: 6, color: 'var(--ink2)' }}>
            {e.items.map(i => <li key={i}>{i}</li>)}
          </ul>
        </article>
      ))}
    </ToolsLayout>
  );
}
