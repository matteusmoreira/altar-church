import { jsonError, jsonOk } from "@/lib/api/http"
import { saveCellPrayer } from "@/lib/cells/actions"
export async function POST(request: Request) { try { const result = await saveCellPrayer(await request.formData()); if (!result.ok) throw new Error(result.error); return jsonOk({ id: result.id }, { status: 201 }) } catch (error) { return jsonError(error) } }
