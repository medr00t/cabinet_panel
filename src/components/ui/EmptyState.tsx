import { ReactNode } from 'react';

const EmptyState = ({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) => (
  <div className="empty">
    <div className="ico">{icon}</div>
    <h3>{title}</h3>
    {text && <p>{text}</p>}
    {action}
  </div>
);

export default EmptyState;
