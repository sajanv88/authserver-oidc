import { GlobeIcon, LaptopIcon, SmartphoneIcon, TabletIcon } from "@nuvui/icons";
import {
  Badge,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@nuvui/react";
import type { DeviceKind, SessionRow } from "../../types";
import { RevokeSessionButton } from "./session-actions";
import "./session-list.scss";

const ICONS: Record<DeviceKind, typeof LaptopIcon> = {
  computer: LaptopIcon,
  phone: SmartphoneIcon,
  tablet: TabletIcon,
  unknown: GlobeIcon,
};

const when = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function At({ iso }: { iso: string }) {
  return <time dateTime={iso}>{when.format(new Date(iso))} UTC</time>;
}

export function SessionList({
  sessions,
  labelledBy,
}: {
  sessions: SessionRow[];
  labelledBy: string;
}) {
  return (
    <ItemGroup variant="outline" aria-labelledby={labelledBy}>
      {sessions.map((session) => {
        const Icon = ICONS[session.device.kind];
        const titleId = `session-${session.id}`;
        return (
          <Item key={session.id}>
            <ItemMedia variant="icon">
              <Icon size={16} aria-hidden="true" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle id={titleId}>
                {session.device.label}
                {session.current ? (
                  <Badge intent="success" variant="outline" className="session-list__badge">
                    This device
                  </Badge>
                ) : null}
              </ItemTitle>
              <ItemDescription>
                {session.ipAddress ? `${session.ipAddress} · ` : null}
                Signed in <At iso={session.signedInAt} />, last active{" "}
                <At iso={session.lastActiveAt} />
              </ItemDescription>
            </ItemContent>
            {session.current ? null : (
              <ItemActions>
                <RevokeSessionButton
                  sessionId={session.id}
                  label={session.device.label}
                  labelledBy={titleId}
                />
              </ItemActions>
            )}
          </Item>
        );
      })}
    </ItemGroup>
  );
}
