import { jsonError, jsonOk } from "@/lib/api/http"
import { getCellFeaturesData } from "@/lib/cells/data"
export async function GET() { try { return jsonOk(await getCellFeaturesData()) } catch (error) { return jsonError(error) } }
