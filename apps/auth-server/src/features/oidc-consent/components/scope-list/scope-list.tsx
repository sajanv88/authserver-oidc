import { CheckIcon } from "@nuvui/icons";
import type { ScopeItem } from "../../types";
import "./scope-list.scss";

/** What the app will get, one line each. A server component. */
export function ScopeList({ scopes }: { scopes: ScopeItem[] }) {
  return (
    <ul className="scope-list">
      {scopes.map((item) => (
        <li key={item.scope} className="scope-list__item">
          <CheckIcon size={16} className="scope-list__icon" />
          <span className="scope-list__text">
            <span className="scope-list__title">{item.title}</span>
            <span className="scope-list__description">{item.description}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
