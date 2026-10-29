import { useState } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { useNow } from "../units";
import { PageHeader, Card, Chips, Button, SearchInput, Skeleton } from "../components/ui";
import { EMPTY_SITE_FORM, SITE_STATUSES, createSite, sortedSites, summarize } from "./data";
import { ConsoleEmpty, CustomerCards, LoadError, SiteForm } from "./parts";

// Home's pipeline links here as /customers?status=prospect (or active).
const statusFrom = (params) => (SITE_STATUSES.some((s) => s.id === params.get("status")) ? params.get("status") : "all");

function Customers() {
  const { mode, data } = useOutletContext();
  const navigate = useNavigate();
  const now = useNow();
  const [params] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState(() => statusFrom(params));
  const [search, setSearch] = useState("");
  const { loaded, error, sites } = data;

  const head = (
    <PageHeader
      title="Customers"
      subtitle={mode === "sim" ? "Simulated customers and their lots" : "Every customer site and how its curbs are doing"}
      actions={!adding && loaded && !error && <Button variant="primary" icon="users" onClick={() => setAdding(true)}>New customer</Button>}
    />
  );
  if (error) return <>{head}<div className="sws-page-body sws-narrow"><LoadError error={error} /></div></>;
  if (!loaded) {
    return (
      <>
        {head}
        <div className="sws-page-body" role="status" aria-label="Loading">
          <Skeleton width={320} height={34} style={{ maxWidth: "100%" }} />
          <div className="cn-cards">{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={210} />)}</div>
        </div>
      </>
    );
  }

  const { siteStats } = summarize(data);
  const all = sortedSites(sites);
  const q = search.trim().toLowerCase();
  const searched = all.filter(([, s]) => !q || (s.name || "").toLowerCase().includes(q) || (s.contactName || "").toLowerCase().includes(q));
  const shown = searched.filter(([, s]) => filter === "all" || s.status === filter);
  const options = [{ id: "all", label: "All", count: searched.length }, ...SITE_STATUSES.map((s) => ({ ...s, count: searched.filter(([, x]) => x.status === s.id).length }))];

  return (
    <>
      {head}
      <div className="sws-page-body">
        {adding && (
          <Card title="New customer" subtitle="Lots are assigned on the customer's page once it's saved." delay={0} className="sws-narrow">
            <SiteForm
              idPrefix="new-site"
              initial={EMPTY_SITE_FORM}
              submitLabel="Save customer"
              busyLabel="Saving…"
              onSubmit={async (form) => { navigate(`/customers/${await createSite(form)}`); }}
              onCancel={() => setAdding(false)}
            />
          </Card>
        )}

        {all.length === 0 ? (
          <ConsoleEmpty
            icon="users"
            title="No customers yet"
            action={!adding && <Button size="sm" variant="primary" onClick={() => setAdding(true)}>New customer</Button>}
          >
            {mode === "sim" ? "Reload the demo customers from Home, or add one here." : "Add one here, or convert a quote request on the Requests page."}
          </ConsoleEmpty>
        ) : (
          <>
            <div className="cn-toolbar sws-enter">
              <Chips label="Filter by status" options={options} value={filter} onChange={setFilter} />
              <SearchInput label="Search customers" placeholder="Search name or contact…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <p className="sws-sr-only" role="status">{shown.length} of {all.length} customers shown</p>
            {shown.length === 0 ? (
              <ConsoleEmpty icon="search" title="No customers match" action={<Button size="sm" onClick={() => { setFilter("all"); setSearch(""); }}>Clear filters</Button>}>
                {q ? `Nothing matches “${search.trim()}”` : "None have this status"}{filter !== "all" && q ? " with this status" : ""}. Try another status or search.
              </ConsoleEmpty>
            ) : (
              <CustomerCards sites={shown} siteStats={siteStats} now={now} />
            )}
          </>
        )}
      </div>
    </>
  );
}

export default Customers;
