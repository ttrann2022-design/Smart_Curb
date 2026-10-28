import { useOutletContext } from "react-router-dom";
import { PageHeader, Card, EmptyState } from "../components/ui";

function Home() {
  const { mode } = useOutletContext();
  return (
    <>
      <PageHeader title="Home" subtitle={mode === "sim" ? "Simulated customers and sites" : "Customers, quote requests and sites"} />
      <div className="sws-page-body sws-narrow">
        <Card>
          <EmptyState icon="overview" title="Nothing here yet">
            Customers, quote requests and where the system is deployed will show here.
          </EmptyState>
        </Card>
      </div>
    </>
  );
}

export default Home;
