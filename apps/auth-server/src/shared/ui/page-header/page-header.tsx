import type { ReactNode } from "react";
import "./page-header.scss";

type PageHeaderProps = {
  /** The page's h1. */
  title: string;
  description?: ReactNode;
  /** Something to do with the whole page, at the end of the header (a "New client" button). */
  action?: ReactNode;
};

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1 className="page-header__title">{title}</h1>
        {description ? <p className="page-header__description">{description}</p> : null}
      </div>
      {action ? <div className="page-header__action">{action}</div> : null}
    </header>
  );
}
