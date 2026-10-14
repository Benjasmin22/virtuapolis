import { demoContext } from "@/city/context";
import { getCityView } from "@/city/projection";
import CityDashboard from "./city-dashboard";
import "./city.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function CityPage() {
  const {db,identity}=await demoContext();
  const city=await getCityView(db,identity);
  return <CityDashboard city={city} />;
}
