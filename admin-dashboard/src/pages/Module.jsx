import { Navigate, useOutletContext, useParams } from "react-router-dom";
import { MODULES, facilityById } from "../site";
import { PageHeader, Card, EmptyState } from "../components/ui";

// Optional modules chosen in Setup. None is built yet, so each page says
// what the module will do rather than pretending to do it.
function Module() {
  const { id } = useParams();
  const { role, siteConfig } = useOutletContext();
  const mod = MODULES[id];
  if (!mod) return <Navigate to="/overview" replace />;
  const facility = facilityById(siteConfig.site?.facilityType);
  const on = siteConfig.site?.modules?.[id] === true;

  return (
    <>
      <PageHeader title={mod.label} subtitle={facility ? `Optional module for ${facility.label}` : "Optional module"} />
      <div className="sws-page-body sws-narrow">
        <Card delay={0}>
          <EmptyState icon="clock" title="Not built yet">
            {mod.desc} This page holds its place in the sidebar until the module ships.{" "}
            {on ? "It's here because it was turned on in Setup." : "It's turned off for this site."}{" "}
            {role === "manager" ? "Turn modules on or off from Settings → Site setup." : "A manager can turn modules on or off."}
          </EmptyState>
        </Card>
      </div>
    </>
  );
}

export default Module;
