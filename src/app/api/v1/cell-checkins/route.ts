import { jsonError, jsonOk } from "@/lib/api/http"
import { parseJsonBody } from "@/lib/api/parse"
import { confirmCellCheckin, manualCellCheckin } from "@/lib/cells/actions"
export async function POST(request: Request) { try { const type = request.headers.get("content-type") ?? ""; const result = type.includes("multipart/form-data") ? await manualCellCheckin(await request.formData()) : await confirmCellCheckin(String(((await parseJsonBody(request)) as { token?: string }).token ?? "")); if (!result.ok) throw new Error(result.error); return jsonOk({ id: result.id }) } catch (error) { return jsonError(error) } }
