import { type ReactElement } from 'react';
import { Outlet } from 'react-router-dom';
import './Layout.css';

export default function Layout(): ReactElement {
  return (
    <div className="layout">
      <main className="layout-main no-nav">
        <Outlet />
      </main>
    </div>
  );
}
