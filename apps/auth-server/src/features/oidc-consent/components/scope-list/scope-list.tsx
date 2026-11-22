import { CheckIcon } from "@nuvui/icons";
import type { ScopeItem } from "../../types";
import "./scope-list.scss";

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
