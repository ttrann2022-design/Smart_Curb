import { useState } from "react";
import ThemePicker from "../components/ThemePicker";
import { PageHeader, Card, StatusText } from "../components/ui";
import { readConsoleTheme, setConsoleTheme } from "./theme";

// Settings for the person using the console. Nothing here touches the database:
// the theme lives in this browser (src/console/theme.js).
function ConsoleSettings() {
  const [theme, setTheme] = useState(readConsoleTheme);
  const [msg, setMsg] = useState(null);
  const pick = (id) => {
    setTheme(id);
    setMsg(setConsoleTheme(id) ? null : { ok: false, text: "Applied, but this browser won't keep it after a reload (site storage is blocked)." });
  };
  return (
    <>
      <PageHeader title="Settings" subtitle="Your console preferences, kept in this browser" />
      <div className="sws-page-body sws-narrow">
        <Card title="Appearance" subtitle="The colour theme for your console, on this browser only. Other platform admins keep their own. Curb status colours stay the same in every theme." delay={0}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <ThemePicker value={theme} onPick={pick} name="console-theme" label="Console theme" />
            <StatusText msg={msg} />
          </div>
        </Card>
      </div>
    </>
  );
}

export default ConsoleSettings;
